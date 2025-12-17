import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Check if we're running in Expo Go (where native modules aren't available)
// executionEnvironment is more reliable than appOwnership in newer Expo SDKs
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
                 Constants.appOwnership === 'expo';

console.log('[IAP] Environment check:', {
  executionEnvironment: Constants.executionEnvironment,
  appOwnership: Constants.appOwnership,
  isExpoGo,
});

// Lazy load InAppPurchases only when not in Expo Go
let InAppPurchases: typeof import('expo-in-app-purchases') | null = null;

const getIAP = async () => {
  if (isExpoGo) {
    console.log('[IAP] Running in Expo Go - IAP not available');
    return null;
  }
  if (!InAppPurchases) {
    InAppPurchases = await import('expo-in-app-purchases');
  }
  return InAppPurchases;
};

// Product IDs (must match App Store Connect)
export const SUBSCRIPTION_SKUS = Platform.select({
  ios: [
    'com.tarantuverse.premium.monthly.v2', // Monthly subscription
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

// Export whether IAP is available (for UI to show/hide purchase options)
export const isIAPAvailable = () => !isExpoGo;

/**
 * Initialize IAP connection
 * Must be called before any other IAP operations
 */
export const initializeIAP = async (): Promise<void> => {
  const iap = await getIAP();
  if (!iap) {
    console.log('[IAP] Skipping initialization - not available in Expo Go');
    return;
  }
  try {
    console.log('[IAP] Initializing connection...');
    await iap.connectAsync();
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
  const iap = await getIAP();
  if (!iap) return;
  try {
    await iap.disconnectAsync();
    console.log('[IAP] Connection ended');
  } catch (error) {
    console.error('[IAP] Failed to end connection:', error);
  }
};

/**
 * Fetch available subscription products
 */
export const getSubscriptionProducts = async (): Promise<any[]> => {
  const iap = await getIAP();
  if (!iap) {
    console.log('[IAP] Products not available in Expo Go');
    return [];
  }
  try {
    console.log('[IAP] Fetching products:', SUBSCRIPTION_SKUS);
    const { results } = await iap.getProductsAsync(SUBSCRIPTION_SKUS);
    console.log('[IAP] Products fetched:', results);
    return results;
  } catch (error) {
    console.error('[IAP] Failed to fetch products:', error);
    throw error;
  }
};

/**
 * Purchase a subscription
 * NOTE: Uses setPurchaseListener callback pattern - purchaseItemAsync returns void
 */
export const purchaseSubscription = async (
  productId: string
): Promise<any | null> => {
  const iap = await getIAP();
  if (!iap) {
    throw new Error('In-app purchases not available in Expo Go. Please use a development build.');
  }

  return new Promise((resolve, reject) => {
    console.log('[IAP] Requesting subscription purchase:', productId);

    // Set up purchase listener BEFORE calling purchaseItemAsync
    const listener = iap.setPurchaseListener(({ responseCode, results, errorCode }) => {
      console.log('[IAP] Purchase listener triggered');
      console.log('[IAP] Response code:', responseCode);
      console.log('[IAP] Error code:', errorCode);
      console.log('[IAP] Results:', JSON.stringify(results, null, 2));

      // Clean up listener
      listener.remove();

      // Handle response
      if (responseCode === iap.IAPResponseCode.OK) {
        console.log('[IAP] Purchase successful');
        resolve({ responseCode, results, errorCode });
      } else if (responseCode === iap.IAPResponseCode.USER_CANCELED) {
        console.log('[IAP] User cancelled purchase');
        resolve(null);
      } else if (responseCode === iap.IAPResponseCode.DEFERRED) {
        console.log('[IAP] Purchase deferred (pending approval)');
        resolve(null);
      } else {
        console.error('[IAP] Purchase failed with code:', responseCode);
        reject(new Error(`Purchase failed with code: ${responseCode}, error: ${errorCode}`));
      }
    });

    // Now initiate the purchase (returns void)
    iap.purchaseItemAsync(productId).catch((error) => {
      console.error('[IAP] purchaseItemAsync error:', error);
      listener.remove();
      reject(error);
    });
  });
};

/**
 * Validate receipt with backend
 * Sends the purchase receipt to your server for Apple/Google validation
 */
export const validateReceiptWithBackend = async (
  purchase: any,
  token: string
): Promise<boolean> => {
  const iap = await getIAP();
  if (!iap) {
    throw new Error('In-app purchases not available');
  }
  try {
    console.log('[IAP] Validating receipt with backend...');

    // Get the transaction receipt
    let receipt: string;
    if (Platform.OS === 'ios') {
      // For iOS, we need to get the app receipt
      const { results } = await iap.getPurchaseHistoryAsync();
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
    await iap.finishTransactionAsync(purchase, false);

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
  const iap = await getIAP();
  if (!iap) {
    throw new Error('In-app purchases not available in Expo Go');
  }
  try {
    console.log('[IAP] Restoring purchases...');

    if (Platform.OS === 'android') {
      // Android doesn't need explicit restore - purchases are always available
      return true;
    }

    const { results } = await iap.getPurchaseHistoryAsync();
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
  const iap = await getIAP();
  if (!iap) {
    return false;
  }
  try {
    const { results } = await iap.getPurchaseHistoryAsync();

    // Check if any purchases are for our subscription products
    const hasActiveSubscription =
      results && results.some((purchase: any) => SUBSCRIPTION_SKUS.includes(purchase.productId));

    return hasActiveSubscription || false;
  } catch (error) {
    console.error('[IAP] Failed to check subscription status:', error);
    return false;
  }
};
