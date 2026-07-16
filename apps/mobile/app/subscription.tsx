import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  AppState,
} from 'react-native';

// URLs to manage subscriptions per platform
const MANAGE_SUBSCRIPTIONS_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';
import {
  initializeIAP,
  getSubscriptionProducts,
  purchaseSubscription,
  validateReceiptWithBackend,
  restorePurchases,
  isIAPAvailable,
  endIAP,
  ALL_ACCESS_SKUS,
  YEARLY_SKUS,
} from '../src/services/iap';

interface SubscriptionLimits {
  max_tarantulas: number; // legacy; retained for back-compat
  max_animals?: number; // cross-taxon collection cap (-1 = unlimited)
  can_use_breeding: boolean;
  max_photos_per_tarantula: number;
  has_priority_support: boolean;
  is_premium: boolean;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, token, refreshUser } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [iapAvailable, setIapAvailable] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [revoking, setRevoking] = useState(false);
  // Which provider the active subscription was bought through
  // ('stripe' | 'apple' | 'google' | 'admin_grant' | null for free).
  // Drives the Manage button: Stripe subs are managed via the Stripe
  // billing portal, not the App Store / Play Store subscription pages.
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    setIapAvailable(isIAPAvailable());
    loadData();

    // Don't disconnect IAP on unmount - it breaks pending purchases
    // The connection is managed globally
  }, []);

  // Re-check subscription status whenever the app returns to the
  // foreground — covers the user completing Stripe checkout in the
  // browser and switching back (the webhook will have activated
  // premium on this same account).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadSubscriptionStatus();
      }
    });
    return () => sub.remove();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load subscription status and IAP products in parallel
      const [limitsResult] = await Promise.all([
        loadSubscriptionStatus(),
        loadProducts(),
      ]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptionStatus = async () => {
    try {
      const response = await apiClient.get('/promo-codes/me/limits');
      setLimits(response.data);

      // Fetch the subscription record for its payment provider (the
      // limits endpoint doesn't include it). Non-fatal if it fails.
      try {
        const subResponse = await apiClient.get('/subscriptions/me');
        setPaymentProvider(subResponse.data?.payment_provider ?? null);
      } catch {
        setPaymentProvider(null);
      }

      return response.data;
    } catch (error) {
      console.error('Failed to load subscription status:', error);
      // Set default free tier limits
      setLimits({
        max_tarantulas: 15,
        max_animals: 15,
        can_use_breeding: false,
        max_photos_per_tarantula: 5,
        has_priority_support: false,
        is_premium: false,
      });
      return null;
    }
  };

  const loadProducts = async () => {
    try {
      await initializeIAP();
      const availableProducts = await getSubscriptionProducts();
      setProducts(availableProducts);
      setProductsLoaded(true);
      return availableProducts;
    } catch (error: any) {
      console.error('[Subscription] Failed to load IAP products:', error);
      setProductsLoaded(true); // Mark as loaded even on error
      return [];
    }
  };

  const handlePurchase = async (productId: string) => {
    if (!token) {
      Alert.alert('Error', 'You must be logged in to purchase');
      return;
    }

    setPurchasing(true);

    try {
      const purchase = await purchaseSubscription(productId);

      if (!purchase) {
        // User cancelled
        setPurchasing(false);
        return;
      }

      // Validate with backend - expo-iap returns the purchase object directly
      // Handle both array (Android) and single object (iOS) formats
      const purchaseToValidate = Array.isArray(purchase) ? purchase[0] : purchase;

      if (purchaseToValidate) {
        await validateReceiptWithBackend(purchaseToValidate, token);
      } else {
        throw new Error('No purchase data received');
      }

      // Refresh user data
      await refreshUser();
      await loadSubscriptionStatus();

      Alert.alert(
        'Success!',
        'Your subscription is now active! Enjoy unlimited animals, photos, and breeding features.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Purchase failed:', error);

      // Handle "already owned" error - auto-restore
      const errorMessage = error.message?.toLowerCase() || '';
      if (errorMessage.includes('already owned') ||
          errorMessage.includes('already purchased') ||
          error.code === 'E_ALREADY_OWNED') {
        Alert.alert(
          'Already Subscribed',
          'You already have an active subscription. Restoring your purchase...',
          [{
            text: 'OK',
            onPress: () => handleRestore(),
          }]
        );
      } else {
        Alert.alert('Purchase Failed', error.message || 'Something went wrong');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (!token) {
      Alert.alert('Error', 'You must be logged in to restore purchases');
      return;
    }

    setRestoring(true);

    try {
      const restored = await restorePurchases(token);

      if (restored) {
        await refreshUser();
        await loadSubscriptionStatus();
        Alert.alert('Success', 'Your purchases have been restored!');
      } else {
        Alert.alert('No Purchases Found', "You don't have any previous purchases to restore");
      }
    } catch (error: any) {
      console.error('Restore failed:', error);
      Alert.alert('Restore Failed', error.message || 'Something went wrong');
    } finally {
      setRestoring(false);
    }
  };

  const handleManageSubscription = async () => {
    if (paymentProvider === 'stripe') {
      // Stripe subscribers manage billing through the Stripe Customer
      // Portal (cancel, update card, view invoices) — the App Store /
      // Play Store subscription pages know nothing about this sub.
      setOpeningPortal(true);
      try {
        const response = await apiClient.get('/subscriptions/billing-portal', {
          params: { return_url: 'https://www.tarantuverse.com/dashboard' },
        });
        if (response.data?.portal_url) {
          await Linking.openURL(response.data.portal_url);
        }
      } catch (error: any) {
        Alert.alert(
          'Unable to Open Billing Portal',
          error.response?.data?.detail ||
            'Please manage your subscription at tarantuverse.com.'
        );
      } finally {
        setOpeningPortal(false);
      }
      return;
    }

    // Apple / Google subscriptions are managed in the store account
    Linking.openURL(MANAGE_SUBSCRIPTIONS_URL!);
  };

  // Only offer the web-checkout link-out where it's compliant. The
  // post-Epic rulings allow external purchase links on the US App
  // Store / Play Store only, so gate on the storefront currency that
  // came back with the IAP products (USD ⇒ US storefront). In Expo Go
  // (no IAP) we always show it so the flow is testable in dev.
  const storefrontCurrency =
    products[0]?.currency || products[0]?.currencyCode || null;
  // Show the web (Stripe) link-out whenever the user otherwise has NO working
  // purchase path, so we never strand them on a dead "coming soon":
  //   - Expo Go / no IAP at all
  //   - IAP available but the store returned zero products (misconfig, region,
  //     sandbox) — the bug Cory caught: previously this hid BOTH paths
  //   - Android always (Google permits external purchase links)
  //   - US App Store (post-Epic external-link entitlement)
  // When real IAP products ARE shown on a non-US iOS storefront, we still keep
  // the link hidden to respect Apple's entitlement scope.
  const noIapProducts = products.length === 0;
  const showWebCheckout =
    !iapAvailable ||
    noIapProducts ||
    Platform.OS === 'android' ||
    storefrontCurrency === 'USD';

  const handleWebCheckout = () => {
    Linking.openURL('https://www.tarantuverse.com/pricing');
  };

  const handleRevokePremium = () => {
    Alert.alert(
      'Revoke Premium',
      'Are you sure you want to revoke your premium subscription? This is for testing purposes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevoking(true);
            try {
              await apiClient.post('/promo-codes/me/revoke');
              Alert.alert('Success', 'Premium subscription revoked. You are now on the free plan.');
              loadSubscriptionStatus();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to revoke subscription');
            } finally {
              setRevoking(false);
            }
          },
        },
      ]
    );
  };

  const formatPrice = (product: any) => {
    // expo-iap exposes a pre-localized price string under different
    // field names depending on platform + SDK version:
    //   - iOS (expo-iap 2.7+): `displayPrice` → "$4.99"
    //   - Android / legacy:    `localizedPrice` → "$4.99"
    //   - Some shapes:         `priceString`
    // Prefer the formatted string; only fall back to the raw number if
    // none of those fields are populated. The previous version went
    // straight to `product.price` on iOS, which is a float — JS would
    // stringify it as "4.990000000001" or similar precision artifact
    // and render that into the UI.
    const localized =
      product?.displayPrice ||
      product?.localizedPrice ||
      product?.priceString;
    if (typeof localized === 'string' && localized.trim().length > 0) {
      return localized;
    }

    // Raw-number fallback — coerce to number (iOS returns a number,
    // Android sometimes returns a string), then format with the
    // product's currency code so rounding + symbol are right.
    const rawNumber =
      typeof product?.price === 'number'
        ? product.price
        : typeof product?.price === 'string'
          ? Number(product.price)
          : NaN;
    if (!Number.isFinite(rawNumber)) return 'N/A';

    const currency = product?.currency || product?.currencyCode || 'USD';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(rawNumber);
    } catch {
      // Unknown currency code — last-resort plain dollar formatting.
      return `$${rawNumber.toFixed(2)}`;
    }
  };

  // ---- Product-aware labels (Premium vs All-Access, monthly vs yearly) ----
  // Derive everything from the product id so cards are labeled correctly
  // instead of the old hardcoded "Premium Monthly".
  const productSku = (p: any): string => p?.id || p?.productId || '';
  const isAllAccessProduct = (p: any) => ALL_ACCESS_SKUS.includes(productSku(p));
  const isYearlyProduct = (p: any) => YEARLY_SKUS.includes(productSku(p));
  const planTitle = (p: any) =>
    `${isAllAccessProduct(p) ? 'All-Access' : 'Premium'} ${isYearlyProduct(p) ? 'Yearly' : 'Monthly'}`;
  const planSubtitle = (p: any) =>
    isAllAccessProduct(p)
      ? `Tarantuverse + Herpetoverse · billed ${isYearlyProduct(p) ? 'yearly' : 'monthly'}`
      : `Billed ${isYearlyProduct(p) ? 'yearly' : 'monthly'}`;
  // Render order: Premium before All-Access, monthly before yearly.
  const sortedProducts = [...products].sort((a, b) => {
    const rank = (p: any) =>
      (isAllAccessProduct(p) ? 2 : 0) + (isYearlyProduct(p) ? 1 : 0);
    return rank(a) - rank(b);
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scrollContent: {
      padding: 16,
    },
    currentPlanCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    planHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    planTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    planBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    planBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    limitRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    limitLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    limitValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    premiumCard: {
      borderRadius: 16,
      padding: 24,
      marginBottom: 20,
      alignItems: 'center',
    },
    premiumIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    premiumTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: 'white',
      marginBottom: 8,
      textAlign: 'center',
    },
    premiumSubtitle: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      marginBottom: 20,
    },
    featuresList: {
      width: '100%',
      marginBottom: 20,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },
    featureText: {
      fontSize: 14,
      color: 'white',
      marginLeft: 8,
    },
    productCard: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 12,
      padding: 16,
      width: '100%',
      marginBottom: 12,
    },
    productHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    productName: {
      fontSize: 16,
      fontWeight: '600',
      color: 'white',
    },
    productPrice: {
      fontSize: 20,
      fontWeight: '700',
      color: 'white',
    },
    productPeriod: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.8)',
    },
    allAccessBadge: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    allAccessBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: 'white',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    purchaseButton: {
      backgroundColor: 'white',
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    purchaseButtonDisabled: {
      opacity: 0.6,
    },
    purchaseButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    restoreButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    restoreButtonText: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 14,
      fontWeight: '500',
    },
    legalSection: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 8,
    },
    legalLink: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    legalLinkText: {
      fontSize: 13,
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    legalDivider: {
      fontSize: 13,
      color: colors.textTertiary,
      marginHorizontal: 8,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    thankYouCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    thankYouIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    thankYouTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    thankYouText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    manageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: colors.primary + '15',
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 8,
      gap: 8,
    },
    manageButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    revokeButton: {
      marginTop: 20,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.error,
      borderRadius: 8,
    },
    revokeButtonText: {
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
    },
    disclaimer: {
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 16,
      paddingHorizontal: 16,
      lineHeight: 16,
    },
    noProductsText: {
      color: 'rgba(255,255,255,0.8)',
      textAlign: 'center',
      fontSize: 14,
      marginBottom: 12,
    },
    webCheckoutCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 8,
      gap: 12,
    },
    webCheckoutTextWrap: {
      flex: 1,
    },
    webCheckoutTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    webCheckoutSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription & Premium</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription & Premium</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current Plan */}
        <View style={styles.currentPlanCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>Current Plan</Text>
            <View
              style={[
                styles.planBadge,
                {
                  backgroundColor: limits?.is_premium
                    ? 'rgba(147, 51, 234, 0.2)'
                    : 'rgba(107, 114, 128, 0.2)',
                },
              ]}
            >
              <Text
                style={[
                  styles.planBadgeText,
                  { color: limits?.is_premium ? '#9333ea' : colors.textTertiary },
                ]}
              >
                {limits?.is_premium ? 'Premium' : 'Free'}
              </Text>
            </View>
          </View>

          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Animals</Text>
            <Text style={styles.limitValue}>
              {(() => {
                const cap = limits?.max_animals ?? limits?.max_tarantulas;
                return cap === -1 ? 'Unlimited' : `${cap ?? 20} max`;
              })()}
            </Text>
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Photos per animal</Text>
            <Text style={styles.limitValue}>
              {limits?.max_photos_per_tarantula === -1
                ? 'Unlimited'
                : `${limits?.max_photos_per_tarantula} max`}
            </Text>
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Breeding Module</Text>
            <Text
              style={[styles.limitValue, { color: limits?.can_use_breeding ? '#22c55e' : colors.error }]}
            >
              {limits?.can_use_breeding ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <View style={[styles.limitRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.limitLabel}>Priority Support</Text>
            <Text
              style={[
                styles.limitValue,
                { color: limits?.has_priority_support ? '#22c55e' : colors.error },
              ]}
            >
              {limits?.has_priority_support ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        {/* Premium or Thank You Card */}
        {limits?.is_premium ? (
          <View style={styles.thankYouCard}>
            <Text style={styles.thankYouIcon}>💜</Text>
            <Text style={styles.thankYouTitle}>Thank You for Being Premium!</Text>
            <Text style={styles.thankYouText}>
              You have access to all features. Enjoy tracking your collection!
            </Text>

            {/* Manage Subscription Button - Required by Apple & Google.
                Routes to the Stripe billing portal for web purchases,
                store subscription settings for IAP. Hidden for promo /
                admin grants (nothing to manage). */}
            {['apple', 'google', 'stripe'].includes(paymentProvider ?? '') && (
              <TouchableOpacity
                style={styles.manageButton}
                onPress={handleManageSubscription}
                disabled={openingPortal}
              >
                {openingPortal ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="cog" size={18} color={colors.primary} />
                    <Text style={styles.manageButtonText}>
                      {paymentProvider === 'stripe' ? 'Manage Billing' : 'Manage Subscription'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Revoke Premium Button (for testing) */}
            <TouchableOpacity
              style={styles.revokeButton}
              onPress={handleRevokePremium}
              disabled={revoking}
            >
              {revoking ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <Text style={styles.revokeButtonText}>Revoke Premium (Testing)</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Upgrade Card with IAP */}
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumCard}
            >
              <Text style={styles.premiumIcon}>💎</Text>
              <Text style={styles.premiumTitle}>Upgrade to Premium</Text>
              <Text style={styles.premiumSubtitle}>
                Unlock all features and take your collection to the next level
              </Text>

              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="white" />
                  <Text style={styles.featureText}>Unlimited animals</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="white" />
                  <Text style={styles.featureText}>Unlimited photos</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="white" />
                  <Text style={styles.featureText}>Full breeding module</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="white" />
                  <Text style={styles.featureText}>Priority support</Text>
                </View>
              </View>

              {/* IAP Products */}
              {!iapAvailable ? (
                <View style={styles.productCard}>
                  <Text style={styles.noProductsText}>
                    In-app purchases are not available in Expo Go.
                  </Text>
                  <Text style={styles.noProductsText}>
                    Use promo codes below or build a development version.
                  </Text>
                </View>
              ) : sortedProducts.length > 0 ? (
                sortedProducts.map((product) => (
                  <View key={productSku(product)} style={styles.productCard}>
                    <View style={styles.productHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={styles.productName}>{planTitle(product)}</Text>
                          {isAllAccessProduct(product) && (
                            <View style={styles.allAccessBadge}>
                              <Text style={styles.allAccessBadgeText}>Both apps</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.productPeriod}>{planSubtitle(product)}</Text>
                      </View>
                      <Text style={styles.productPrice}>{formatPrice(product)}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
                      onPress={() => handlePurchase(productSku(product))}
                      disabled={purchasing || restoring}
                    >
                      {purchasing ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={styles.purchaseButtonText}>Subscribe Now</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              ) : productsLoaded ? (
                <View style={styles.productCard}>
                  <Text style={styles.noProductsText}>
                    In-app subscriptions aren’t available on this device right now.
                  </Text>
                  <Text style={styles.noProductsText}>
                    You can subscribe by card below — it unlocks premium on this
                    same account.
                  </Text>
                </View>
              ) : (
                <View style={styles.productCard}>
                  <ActivityIndicator color="white" style={{ marginBottom: 8 }} />
                  <Text style={styles.noProductsText}>
                    Loading subscription options...
                  </Text>
                </View>
              )}

              {/* Restore Purchases Button - Required by Apple & Google */}
              {iapAvailable && (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestore}
                  disabled={restoring || purchasing}
                >
                  {restoring ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.restoreButtonText}>Restore Previous Purchases</Text>
                  )}
                </TouchableOpacity>
              )}
            </LinearGradient>

            {/* Web checkout link-out (US storefronts only — see
                showWebCheckout). Stripe checkout on the website
                activates premium on this same account via webhook;
                the AppState listener picks it up on return. */}
            {showWebCheckout && (
              <TouchableOpacity style={styles.webCheckoutCard} onPress={handleWebCheckout}>
                <MaterialCommunityIcons name="credit-card-outline" size={22} color={colors.primary} />
                <View style={styles.webCheckoutTextWrap}>
                  <Text style={styles.webCheckoutTitle}>Prefer to pay by card?</Text>
                  <Text style={styles.webCheckoutSubtitle}>
                    Subscribe on tarantuverse.com — sign in with this account and
                    premium unlocks here automatically.
                  </Text>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            {/* Legal Links - Required by Apple */}
            <View style={styles.legalSection}>
              <TouchableOpacity
                style={styles.legalLink}
                onPress={() => Linking.openURL('https://www.tarantuverse.com/terms')}
              >
                <Text style={styles.legalLinkText}>Terms of Use</Text>
              </TouchableOpacity>
              <Text style={styles.legalDivider}>•</Text>
              <TouchableOpacity
                style={styles.legalLink}
                onPress={() => Linking.openURL('https://www.tarantuverse.com/privacy-policy')}
              >
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>

            {/* Disclaimer - only show when IAP is available */}
            {iapAvailable && (
              <Text style={styles.disclaimer}>
                {Platform.OS === 'ios'
                  ? 'Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscription in your App Store account settings.'
                  : 'Payment will be charged to your Google Play account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscription in your Google Play account settings.'}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
