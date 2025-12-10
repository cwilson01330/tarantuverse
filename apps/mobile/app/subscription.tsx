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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import {
  initializeIAP,
  getSubscriptionProducts,
  purchaseSubscription,
  validateReceiptWithBackend,
  restorePurchases,
} from '../src/services/iap';
import { Product } from 'react-native-iap';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    loadProducts();

    return () => {
      // Cleanup IAP connection when component unmounts
      // Don't await, just fire and forget
      initializeIAP().catch(console.error);
    };
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      await initializeIAP();
      const availableProducts = await getSubscriptionProducts();
      setProducts(availableProducts);

      // Check if user has premium
      // (You could also fetch this from your backend)
      // For now, we'll rely on the backend limits check
    } catch (error: any) {
      console.error('Failed to load products:', error);
      Alert.alert('Error', 'Failed to load subscription options');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (productId: string) => {
    if (!token) {
      Alert.alert('Error', 'You must be logged in to purchase');
      return;
    }

    setPurchasing(true);

    try {
      // Request the purchase
      const purchase = await purchaseSubscription(productId);

      if (!purchase) {
        // User cancelled
        setPurchasing(false);
        return;
      }

      // Validate with backend
      await validateReceiptWithBackend(purchase, token);

      Alert.alert(
        'Success! 🎉',
        'Your subscription is now active! Enjoy unlimited tarantulas, photos, and breeding features.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Purchase failed:', error);
      Alert.alert('Purchase Failed', error.message || 'Something went wrong');
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
        Alert.alert('Success', 'Your purchases have been restored!', [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            },
          },
        ]);
      } else {
        Alert.alert('No Purchases Found', 'You don\'t have any previous purchases to restore');
      }
    } catch (error: any) {
      console.error('Restore failed:', error);
      Alert.alert('Restore Failed', error.message || 'Something went wrong');
    } finally {
      setRestoring(false);
    }
  };

  const formatPrice = (product: Product) => {
    return product.localizedPrice || product.price || 'N/A';
  };

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
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
    },
    heroSection: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
    },
    heroIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 16,
    },
    featuresList: {
      width: '100%',
      marginTop: 8,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    featureIcon: {
      marginRight: 12,
      color: colors.primary,
    },
    featureText: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    productsSection: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    productCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    productHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    productName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    productPrice: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
    },
    productPeriod: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    productDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    purchaseButton: {
      backgroundColor: colors.primary,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    purchaseButtonDisabled: {
      opacity: 0.5,
    },
    purchaseButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    restoreButton: {
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    restoreButtonText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '500',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: colors.textSecondary,
    },
    disclaimer: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 24,
      paddingHorizontal: 16,
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Upgrade to Premium</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upgrade to Premium</Text>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroIcon}>💎</Text>
          <Text style={styles.heroTitle}>Unlock Premium Features</Text>
          <Text style={styles.heroSubtitle}>Get unlimited access to all features</Text>

          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} style={styles.featureIcon} />
              <Text style={styles.featureText}>Unlimited tarantulas</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} style={styles.featureIcon} />
              <Text style={styles.featureText}>Unlimited photos per tarantula</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} style={styles.featureIcon} />
              <Text style={styles.featureText}>Full breeding module access</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} style={styles.featureIcon} />
              <Text style={styles.featureText}>Advanced analytics</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} style={styles.featureIcon} />
              <Text style={styles.featureText}>Priority support</Text>
            </View>
          </View>
        </View>

        {/* Products */}
        <View style={styles.productsSection}>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>

          {products.map((product) => (
            <View key={product.productId} style={styles.productCard}>
              <View style={styles.productHeader}>
                <View>
                  <Text style={styles.productName}>Premium Monthly</Text>
                  <Text style={styles.productPeriod}>/month</Text>
                </View>
                <Text style={styles.productPrice}>{formatPrice(product)}</Text>
              </View>

              <Text style={styles.productDescription}>
                Cancel anytime. All features included. Start tracking unlimited tarantulas today!
              </Text>

              <TouchableOpacity
                style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
                onPress={() => handlePurchase(product.productId)}
                disabled={purchasing || restoring}
              >
                {purchasing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.purchaseButtonText}>Subscribe Now</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}

          {products.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              No subscription options available at this time.
            </Text>
          )}
        </View>

        {/* Restore Purchases Button (iOS only) */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={restoring || purchasing}>
            {restoring ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Previous Purchases</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically
          renews unless canceled at least 24 hours before the end of the current period.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
