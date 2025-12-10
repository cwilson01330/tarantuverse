import { Platform } from 'react-native';
import * as InAppPurchases from 'expo-in-app-purchases';

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
    await InAppPurchases.connectAsync();
    console.log('[IAP] Connection initialized successfully');
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
    await InAppPurchases.disconnectAsync();
    console.log('[IAP] Connection ended');
  } catch (error) {
    console.error('[IAP] Failed to end connection:', error);
  }
};

/**
 * Fetch available subscription products
 */
export const getSubscriptionProducts = async (): Promise<InAppPurchases.InAppPurchase[]> => {
  try {
    console.log('[IAP] Fetching products:', SUBSCRIPTION_SKUS);
    const { results } = await InAppPurchases.getProductsAsync(SUBSCRIPTION_SKUS);
    console.log('[IAP] Products fetched:', results);
    return results;
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
): Promise<InAppPurchases.InAppPurchaseResult | null> => {
  try {
    console.log('[IAP] Requesting subscription purchase:', productId);

    const result = await InAppPurchases.purchaseItemAsync(productId);

    console.log('[IAP] Purchase result:', result);

    // Check if purchase was successful
    if (result.responseCode === InAppPurchases.IAPResponseCode.OK && result.results) {
      return result;
    }

    // User cancelled or error
    if (result.responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
      console.log('[IAP] User cancelled purchase');
      return null;
    }

    throw new Error(`Purchase failed with code: ${result.responseCode}`);
  } catch (error) {
    console.error('[IAP] Purchase failed:', error);
    throw error;
  }
};

/**
 * Validate receipt with backend
 * Sends the purchase receipt to your server for Apple/Google validation
 */
export const validateReceiptWithBackend = async (
  purchase: InAppPurchases.InAppPurchase,
  token: string
): Promise<boolean> => {
  try {
    console.log('[IAP] Validating receipt with backend...');

    // Get the transaction receipt
    let receipt: string;
    if (Platform.OS === 'ios') {
      // For iOS, we need to get the app receipt
      const { results } = await InAppPurchases.getPurchaseHistoryAsync();
      const appReceipt = results && results.length > 0 ? results[0].transactionReceipt : '';
      receipt = appReceipt || '';
    } else {
      // For Android, use the purchase token
      receipt = purchase.purchaseToken || '';
    }

    const response = await fetch(`${API_URL}/api/v1/subscriptions/validate-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: Platform.OS,
        receipt,
        product_id: purchase.productId,
        transaction_id: purchase.orderId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Receipt validation failed');
    }

    const data = await response.json();
    console.log('[IAP] Receipt validated:', data);

    // Finish the transaction
    await InAppPurchases.finishTransactionAsync(purchase, false);

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

    const { results } = await InAppPurchases.getPurchaseHistoryAsync();
    console.log('[IAP] Purchase history:', results);

    if (!results || results.length === 0) {
      return false;
    }

    // Validate each purchase with backend
    for (const purchase of results) {
      await validateReceiptWithBackend(purchase, token);
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
    const { results } = await InAppPurchases.getPurchaseHistoryAsync();

    // Check if any purchases are for our subscription products
    const hasActiveSubscription =
      results && results.some((purchase) => SUBSCRIPTION_SKUS.includes(purchase.productId));

    return hasActiveSubscription || false;
  } catch (error) {
    console.error('[IAP] Failed to check subscription status:', error);
    return false;
  }
};
