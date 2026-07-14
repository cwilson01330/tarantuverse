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
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
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

const PRICING_URL = 'https://herpetoverse.com/pricing';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Headline; defaults to the collection-cap message. */
  title?: string;
  /** Sub-line under the title; server 402 `detail.message` fits well here. */
  message?: string;
  /** Optional "3 / 5 animals" style context line. */
  currentCount?: number | null;
  limit?: number | null;
}

const PREMIUM_PERKS = [
  'Unlimited animals in your collection',
  'Import your whole collection from a spreadsheet',
  'Every tracking feature stays free — this only lifts the count cap',
];

export default function UpgradeModal({
  visible,
  onClose,
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

  // Fetch live products when the sheet opens (only in a real build).
  useEffect(() => {
    let active = true;
    if (visible && iapOn) {
      setLoadingProducts(true);
      getAvailableProducts()
        .then((p) => { if (active) setProducts(p); })
        .catch(() => { if (active) setProducts([]); })
        .finally(() => { if (active) setLoadingProducts(false); });
    }
    return () => { active = false; };
  }, [visible, iapOn]);

  const showStore = iapOn && products.length > 0;

  const handleBuy = async (product: IapProduct) => {
    if (purchasingId) return;
    setPurchasingId(product.id);
    try {
      const purchase = await purchaseProduct(product.id, product.type);
      if (!purchase) return; // user cancelled — no-op
      if (!token) throw new Error('Please sign in again to complete your purchase.');
      await validateReceiptWithBackend(purchase, token);
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
    Linking.openURL(PRICING_URL).catch(() => {
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
      onRequestClose={onClose}
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
                onPress={onClose}
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
                {products.map((p) => {
                  const busy = purchasingId === p.id;
                  const dim = !!purchasingId && !busy;
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
                      accessibilityLabel={`Buy ${p.title || p.id} ${p.displayPrice}`}
                    >
                      {busy ? (
                        <ActivityIndicator color="#0B0B0B" />
                      ) : (
                        <Text style={styles.primaryBtnText}>
                          {(p.title || p.id)}
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
            ) : (
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
            )}

            {/* Dismiss */}
            <TouchableOpacity
              onPress={onClose}
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

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
});
