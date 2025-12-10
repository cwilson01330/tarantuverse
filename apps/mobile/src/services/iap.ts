import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';
import {
  Product,
  Purchase,
  PurchaseError,
  SubscriptionPurchase,
} from 'react-native-iap';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Product IDs (must match App Store Connect)
export const SUBSCRIPTION_SKUS = Platform.select({
  ios: [
    'com.tarantuverse.premium.monthly', // Monthly subscription
    // Add these after approval:
    // 'com.tarantuverse.premium.yearly',
  ],
  android: [
    'com.tarantuverse.premium.monthly',
    // Add these after approval:
    // 'com.tarantuverse.premium.yearly',
  ],
}) || [];

export const LIFETIME_SKU = Platform.select({
  ios: 'com.tarantuverse.lifetime',
  android: 'com.tarantuverse.lifetime',
}) || '';

/**
 * Initialize IAP connection
 * Must be called before any other IAP operations
 */
export const initializeIAP = async (): Promise<void> => {
  try {
    console.log('[IAP] Initializing connection...');
    await RNIap.initConnection();
    console.log('[IAP] Connection initialized successfully');

    // Clear any pending transactions (important for testing)
    if (Platform.OS === 'ios') {
      await RNIap.clearTransactionIOS();
    }
  } catch (error) {
    console.error('[IAP] Failed to initialize:', error);
    throw error;
  }
};

/**
 * End IAP connection
 * Call when app is closing
 */
export const endIAP = async (): Promise<void> => {
  try {
    await RNIap.endConnection();
    console.log('[IAP] Connection ended');
  } catch (error) {
    console.error('[IAP] Failed to end connection:', error);
  }
};

/**
 * Fetch available subscription products
 */
export const getSubscriptionProducts = async (): Promise<Product[]> => {
  try {
    console.log('[IAP] Fetching products:', SUBSCRIPTION_SKUS);
    const products = await RNIap.getSubscriptions({ skus: SUBSCRIPTION_SKUS });
    console.log('[IAP] Products fetched:', products);
    return products;
  } catch (error) {
    console.error('[IAP] Failed to fetch products:', error);
    throw error;
  }
};

/**
 * Purchase a subscription
 */
export const purchaseSubscription = async (
  productId: string
): Promise<SubscriptionPurchase | null> => {
  try {
    console.log('[IAP] Requesting subscription purchase:', productId);

    const purchase = await RNIap.requestSubscription({
      sku: productId,
      ...(Platform.OS === 'android' && {
        subscriptionOffers: [
          {
            sku: productId,
            offerToken: '', // Will be filled by Google Play
          },
        ],
      }),
    });

    console.log('[IAP] Purchase successful:', purchase);
    return purchase as SubscriptionPurchase;
  } catch (error) {
    const purchaseError = error as PurchaseError;
    console.error('[IAP] Purchase failed:', purchaseError);

    // User cancelled is not an error
    if (purchaseError.code === 'E_USER_CANCELLED') {
      return null;
    }

    throw error;
  }
};

/**
 * Validate receipt with backend
 * Sends the purchase receipt to your server for Apple/Google validation
 */
export const validateReceiptWithBackend = async (
  purchase: SubscriptionPurchase,
  token: string
): Promise<boolean> => {
  try {
    console.log('[IAP] Validating receipt with backend...');

    const response = await fetch(`${API_URL}/api/v1/subscriptions/validate-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: Platform.OS,
        receipt: purchase.transactionReceipt,
        product_id: purchase.productId,
        transaction_id: purchase.transactionId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Receipt validation failed');
    }

    const data = await response.json();
    console.log('[IAP] Receipt validated:', data);

    // Acknowledge/finish the transaction
    if (Platform.OS === 'ios') {
      await RNIap.finishTransaction({ purchase: purchase as Purchase });
    } else if (Platform.OS === 'android') {
      await RNIap.acknowledgePurchaseAndroid({ token: purchase.purchaseToken! });
    }

    return true;
  } catch (error) {
    console.error('[IAP] Receipt validation failed:', error);
    throw error;
  }
};

/**
 * Restore purchases (required by Apple)
 * iOS only - restores previous purchases
 */
export const restorePurchases = async (token: string): Promise<boolean> => {
  try {
    console.log('[IAP] Restoring purchases...');

    if (Platform.OS === 'android') {
      // Android doesn't need explicit restore - purchases are always available
      return true;
    }

    const purchases = await RNIap.getAvailablePurchases();
    console.log('[IAP] Available purchases:', purchases);

    if (purchases.length === 0) {
      return false;
    }

    // Validate each purchase with backend
    for (const purchase of purchases) {
      await validateReceiptWithBackend(purchase as SubscriptionPurchase, token);
    }

    return true;
  } catch (error) {
    console.error('[IAP] Restore purchases failed:', error);
    throw error;
  }
};

/**
 * Check if user has an active subscription
 * This queries the device's purchase history
 */
export const checkSubscriptionStatus = async (): Promise<boolean> => {
  try {
    const purchases = await RNIap.getAvailablePurchases();

    // Check if any purchases are for our subscription products
    const hasActiveSubscription = purchases.some((purchase) =>
      SUBSCRIPTION_SKUS.includes(purchase.productId)
    );

    return hasActiveSubscription;
  } catch (error) {
    console.error('[IAP] Failed to check subscription status:', error);
    return false;
  }
};
