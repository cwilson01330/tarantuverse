/**
 * UpgradeModal — free-tier cap gate for Herpetoverse mobile.
 *
 * Shown when a free keeper hits the collection cap (the create call
 * returns HTTP 402). It explains what premium unlocks and offers the
 * real store plans via expo-iap: products are fetched dynamically and
 * only the ones the store actually returns are shown, so tiers added
 * after first approval (yearly, lifetime) appear automatically with no
 * app update. Purchase → validate-receipt → refreshUser().
 *
 * Honesty-first fallback: in Expo Go (no native module) or before any
 * product is live, there's no fake purchase button — it shows the web
 * "Learn more" link instead. We never imply a charge that can't happen.
 *
 * Theme: dark-first via ThemeContext. HV has no `error` color — status
 * accents use `danger`/`warning`; on-primary text is #0B0B0B (matches
 * feeding-day.tsx and the collection FAB). Bottom padding respects
 * useSafeAreaInsets().bottom so the buttons clear the Android nav bar.
 *
 * `Linking.openURL` is a React Native core API — no native dependency,
 * OTA-safe. The pricing page (https://herpetoverse.com/pricing) is being
 * created by the web team.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getAvailableProducts,
  isIAPAvailable,
  purchaseProduct,
  restorePurchases,
  validateReceiptWithBackend,
  type IapProduct,
} from '../services/iap';

import { trackUpgrade, UPGRADE_EVENTS, type UpgradeSource } from '../lib/upgrade-tracking';

const PRICING_URL = 'https://herpetoverse.com/pricing';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Why this prompt opened. Required so no prompt ships unattributed. */
  source: UpgradeSource;
  /** Headline; defaults to the collection-cap message. */
  title?: string;
  /** Sub-line under the title; server 402 `detail.message` fits well here. */
  message?: string;
  /** Optional "3 / 5 animals" style context line. */
  currentCount?: number | null;
  limit?: number | null;
}

// What premium actually unlocks, matching the server gates: the animal cap
// (enforce_animal_limit), breeding (reptile_pairings 402) and feeder tracking
// (enforce_hv_premium). This list used to offer spreadsheet import — which is
// free — and claim premium "only lifts the count cap", while the breeding and
// feeder prompts that open this same sheet said otherwise.
const PREMIUM_PERKS = [
  'Unlimited animals in your collection',
  'Breeding: pairings, clutches & offspring',
  'Feeder inventory tracking',
  'Co-keepers — share your collection with up to 10 people',
  'Sitter logging + unlimited sitter links',
  'Feeding, weight, shed and health logs stay free, always',
];

export default function UpgradeModal({
  visible,
  onClose,
  source,
  title = "You've reached the free limit",
  message = 'The free plan tracks up to 5 animals. Premium keepers get unlimited animals.',
  currentCount,
  limit,
}: UpgradeModalProps) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, refreshUser } = useAuth();

  const iapOn = isIAPAvailable();
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  // True once the store has answered for this open (success or failure).
  // Separate from loadingProducts, which starts false and would otherwise read
  // as "done" on the very first render of an open.
  const [productsResolved, setProductsResolved] = useState(false);

  // Fetch live products when the sheet opens (only in a real build).
  useEffect(() => {
    let active = true;
    if (visible && iapOn) {
      setProductsResolved(false);
      setLoadingProducts(true);
      getAvailableProducts()
        .then((p) => { if (active) setProducts(p); })
        .catch(() => { if (active) setProducts([]); })
        .finally(() => {
          if (active) {
            setLoadingProducts(false);
            setProductsResolved(true);
          }
        });
    }
    return () => { active = false; };
  }, [visible, iapOn]);

  const showStore = iapOn && products.length > 0;

  // Set on any purchase/restore/learn-more action, so the close that follows
  // isn't also counted as a dismissal.
  const acted = useRef(false);
  // One "shown" per open. Deferred until the store has answered, so the event
  // can say whether this keeper had any way to pay: on iOS there are no HV
  // store products yet, and "prompt shown with no purchase path" should be a
  // number in PostHog rather than something nobody can see.
  const shownLogged = useRef(false);
  useEffect(() => {
    if (!visible) {
      shownLogged.current = false;
      return;
    }
    if (!shownLogged.current && !(iapOn && !productsResolved)) {
      shownLogged.current = true;
      acted.current = false;
      const webLinkAllowed = Platform.OS !== 'ios' || !iapOn; // mirrors canLinkToWebCheckout
      trackUpgrade(UPGRADE_EVENTS.shown, source, {
        platform: Platform.OS,
        purchase_path: showStore ? 'store' : webLinkAllowed ? 'web_link' : 'none',
      });
    }
  }, [visible, iapOn, productsResolved, showStore, source]);

  const handleDismiss = () => {
    if (!acted.current) trackUpgrade(UPGRADE_EVENTS.dismissed, source);
    onClose();
  };

  // ---------------------------------------------------------------------
  // App Store Guideline 3.1.1 — never point iOS users at a web checkout.
  //
  // NOTE: this is deliberately STRICTER than Tarantuverse's equivalent gate
  // (apps/mobile/app/subscription.tsx). TV also reveals the web link when the
  // store returns zero products, which is safe there only because TV's
  // products exist — that branch never fires in review. Herpetoverse has no
  // App Store products yet, so on iOS that fallback is the DEFAULT state and
  // would show a reviewer a Stripe checkout link. That's the textbook 3.1.1
  // rejection.
  //
  // Rule here: on iOS the ONLY purchase path is native IAP. If there are no
  // products, we show no purchase path at all rather than an external one.
  // Android may link out (Google permits it), as may Expo Go for dev testing.
  const canLinkToWebCheckout = Platform.OS !== 'ios' || !iapOn;
  // ---------------------------------------------------------------------

  // Product-aware labels derived from the product id (Premium vs All-Access,
  // monthly/yearly/lifetime) so buttons read cleanly instead of raw store
  // titles or ids. All-Access unlocks Herpetoverse + Tarantuverse.
  const isAllAccess = (id: string) => id.includes('allaccess');
  const planLabel = (id: string) => {
    const tier = isAllAccess(id) ? 'All-Access' : 'Premium';
    const period = id.includes('lifetime')
      ? 'Lifetime'
      : id.includes('yearly')
        ? 'Yearly'
        : 'Monthly';
    return `${tier} ${period}`;
  };
  // Order: Premium before All-Access, then monthly < yearly < lifetime.
  const sortedProducts = [...products].sort((a, b) => {
    const rank = (id: string) =>
      (isAllAccess(id) ? 100 : 0) +
      (id.includes('lifetime') ? 2 : id.includes('yearly') ? 1 : 0);
    return rank(a.id) - rank(b.id);
  });

  const handleBuy = async (product: IapProduct) => {
    if (purchasingId) return;
    acted.current = true;
    trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'buy', product_id: product.id });
    setPurchasingId(product.id);
    try {
      const purchase = await purchaseProduct(product.id, product.type);
      if (!purchase) return; // user cancelled — no-op
      if (!token) throw new Error('Please sign in again to complete your purchase.');
      await validateReceiptWithBackend(purchase, token);
      trackUpgrade(UPGRADE_EVENTS.purchased, source, {
        product_id: product.id,
        product_type: product.type,
        provider: Platform.OS === 'ios' ? 'apple' : 'google',
      });
      await refreshUser();
      Alert.alert("You're all set", 'Premium is now active — thanks for supporting Herpetoverse!');
      onClose();
    } catch (e: any) {
      Alert.alert(
        'Purchase not completed',
        e?.message ||
          'Something went wrong. If you were charged, tap Restore purchases in a minute.',
      );
    } finally {
      setPurchasingId(null);
    }
  };

  const handleRestore = async () => {
    if (!token) return;
    acted.current = true;
    trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'restore' });
    try {
      const ok = await restorePurchases(token);
      if (ok) {
        await refreshUser();
        Alert.alert('Restored', 'Your previous purchases have been restored.');
        onClose();
      } else {
        Alert.alert('Nothing to restore', 'No previous purchases were found for this account.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message || 'Could not restore purchases.');
    }
  };

  const handleLearnMore = () => {
    // Fire-and-forget: if the browser can't open we simply leave the
    // modal up rather than crashing. Nothing here charges the keeper.
    acted.current = true;
    trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'web_pricing' });
    // Source forwarded so the web pricing page can attribute the checkout.
    Linking.openURL(`${PRICING_URL}?source=${encodeURIComponent(source)}`).catch(() => {
      /* no-op — keep the modal open so they can dismiss */
    });
  };

  const showCount =
    typeof currentCount === 'number' &&
    typeof limit === 'number' &&
    limit > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.xl,
              borderTopRightRadius: layout.radius.xl,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colors.primary, borderRadius: layout.radius.md },
                ]}
              >
                <MaterialCommunityIcons name="star-four-points" size={22} color="#0B0B0B" />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{message}</Text>
              </View>
              <TouchableOpacity
                onPress={handleDismiss}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                style={styles.closeBtn}
              >
                <MaterialCommunityIcons name="close" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Count context — only when the server told us both numbers */}
            {showCount && (
              <View
                style={[
                  styles.countRow,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.warning,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                <MaterialCommunityIcons name="counter" size={18} color={colors.warning} />
                <Text style={[styles.countText, { color: colors.textSecondary }]}>
                  You have{' '}
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    {currentCount} of {limit}
                  </Text>{' '}
                  animals on the free plan.
                </Text>
              </View>
            )}

            {/* Perks */}
            <View
              style={[
                styles.perksCard,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <Text style={[styles.perksTitle, { color: colors.textPrimary }]}>
                What premium unlocks
              </Text>
              {PREMIUM_PERKS.map((perk) => (
                <View key={perk} style={styles.perkRow}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={colors.success}
                    style={styles.perkIcon}
                  />
                  <Text style={[styles.perkText, { color: colors.textSecondary }]}>{perk}</Text>
                </View>
              ))}
            </View>

            {/* Purchase options — real store plans when available; honest web
                fallback in Expo Go or before any products are live. */}
            {iapOn && loadingProducts ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.honestNote, { color: colors.textTertiary, marginBottom: 0 }]}>
                  Loading plans…
                </Text>
              </View>
            ) : showStore ? (
              <>
                {sortedProducts.map((p) => {
                  const busy = purchasingId === p.id;
                  const dim = !!purchasingId && !busy;
                  const label = planLabel(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => handleBuy(p)}
                      disabled={!!purchasingId}
                      style={[
                        styles.primaryBtn,
                        {
                          backgroundColor: colors.primary,
                          borderRadius: layout.radius.md,
                          opacity: dim ? 0.5 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Buy ${label} ${p.displayPrice || ''}`}
                    >
                      {busy ? (
                        <ActivityIndicator color="#0B0B0B" />
                      ) : (
                        <Text style={styles.primaryBtnText}>
                          {label}
                          {isAllAccess(p.id) ? ' · both apps' : ''}
                          {p.displayPrice ? `  ·  ${p.displayPrice}` : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={handleRestore}
                  disabled={!!purchasingId}
                  style={styles.dismissBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Restore purchases"
                >
                  <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
                    Restore purchases
                  </Text>
                </TouchableOpacity>
              </>
            ) : canLinkToWebCheckout ? (
              <>
                <Text style={[styles.honestNote, { color: colors.textTertiary }]}>
                  {iapOn
                    ? "Plans aren't available right now — you can also manage premium on the web."
                    : 'The in-app purchase option appears in the installed app. Learn more on the web.'}
                </Text>
                <TouchableOpacity
                  onPress={handleLearnMore}
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.primary, borderRadius: layout.radius.md },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Learn more about premium on the web"
                >
                  <MaterialCommunityIcons name="open-in-new" size={18} color="#0B0B0B" />
                  <Text style={styles.primaryBtnText}>Learn more</Text>
                </TouchableOpacity>
              </>
            ) : (
              // iOS with no store products: say so plainly. No external link
              // (3.1.1), and no fake "coming soon" that implies a path exists.
              <Text style={[styles.honestNote, { color: colors.textTertiary }]}>
                Premium isn&apos;t available for purchase in the app just yet.
                Everything you&apos;re already tracking stays exactly as it is.
              </Text>
            )}

            {/* Guideline 3.1.2 — auto-renew terms plus Terms/Privacy must be
                visible wherever a subscription can actually be bought. Only
                rendered alongside a real purchase path; showing renewal terms
                with nothing to buy would just be noise. */}
            {showStore && (
              <View style={styles.legalWrap}>
                <Text style={[styles.legalText, { color: colors.textTertiary }]}>
                  {Platform.OS === 'ios'
                    ? 'Payment will be charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings. Lifetime is a one-time purchase and does not renew.'
                    : 'Payment will be charged to your Google Play account at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Google Play account settings. Lifetime is a one-time purchase and does not renew.'}
                </Text>
                <View style={styles.legalLinks}>
                  <TouchableOpacity
                    onPress={() => Linking.openURL('https://herpetoverse.com/terms')}
                    accessibilityRole="link"
                  >
                    <Text style={[styles.legalLinkText, { color: colors.textSecondary }]}>
                      Terms of Use
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.legalText, { color: colors.textTertiary }]}> • </Text>
                  <TouchableOpacity
                    onPress={() => Linking.openURL('https://herpetoverse.com/privacy-policy')}
                    accessibilityRole="link"
                  >
                    <Text style={[styles.legalLinkText, { color: colors.textSecondary }]}>
                      Privacy Policy
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.legalText, { color: colors.textTertiary }]}> • </Text>
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(
                        Platform.OS === 'ios'
                          ? 'https://apps.apple.com/account/subscriptions'
                          : 'https://play.google.com/store/account/subscriptions',
                      )
                    }
                    accessibilityRole="link"
                  >
                    <Text style={[styles.legalLinkText, { color: colors.textSecondary }]}>
                      Manage subscription
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Dismiss */}
            <TouchableOpacity
              onPress={handleDismiss}
              style={styles.dismissBtn}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
                Not now
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    maxHeight: '88%',
    borderWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  handleWrap: { alignItems: 'center', marginBottom: 12 },
  handle: { width: 40, height: 4, borderRadius: 2 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  closeBtn: { padding: 2, marginLeft: 8 },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  countText: { flex: 1, fontSize: 13, lineHeight: 18 },

  perksCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  perksTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  perkIcon: { marginRight: 10, marginTop: 1 },
  perkText: { flex: 1, fontSize: 14, lineHeight: 20 },

  honestNote: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
    textAlign: 'center',
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginBottom: 8,
  },
  primaryBtnText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },

  dismissBtn: { paddingVertical: 12, alignItems: 'center' },
  dismissText: { fontSize: 14, fontWeight: '600' },
  // Guideline 3.1.2 disclosure block — deliberately small and low-contrast;
  // it's required legal text, not something to compete with the buy buttons.
  legalWrap: { marginTop: 16, gap: 8 },
  legalText: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalLinkText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
});
