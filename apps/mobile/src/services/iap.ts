import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Check if we're running in Expo Go (where native modules aren't available)
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
                 Constants.appOwnership === 'expo';

console.log('[IAP] Environment check:', {
  executionEnvironment: Constants.executionEnvironment,
  appOwnership: Constants.appOwnership,
  isExpoGo,
});

// Lazy load expo-iap only when not in Expo Go
let ExpoIAP: typeof import('expo-iap') | null = null;

const getIAP = async () => {
  if (isExpoGo) {
    console.log('[IAP] Running in Expo Go - IAP not available');
    return null;
  }
  if (!ExpoIAP) {
    ExpoIAP = await import('expo-iap');
  }
  return ExpoIAP;
};

// Product IDs (must match App Store Connect)
export const SUBSCRIPTION_SKUS = Platform.select({
  ios: [
    'com.tarantuverse.premium.monthly.v2', // Monthly subscription
  ],
  android: [
    'com.tarantuverse.premium.monthly',
  ],
}) || [];

export const LIFETIME_SKU = Platform.select({
  ios: 'com.tarantuverse.lifetime',
  android: 'com.tarantuverse.lifetime',
}) || '';

// Export whether IAP is available (for UI to show/hide purchase options)
export const isIAPAvailable = () => !isExpoGo;

// Store listeners for cleanup
let purchaseUpdateSubscription: { remove: () => void } | null = null;
let purchaseErrorSubscription: { remove: () => void } | null = null;

// Global purchase handler
let pendingPurchaseResolver: ((result: any) => void) | null = null;
let pendingPurchaseRejecter: ((error: Error) => void) | null = null;

/**
 * Initialize IAP connection and set up listeners
 */
export const initializeIAP = async (): Promise<void> => {
  const iap = await getIAP();
  if (!iap) {
    console.log('[IAP] Skipping initialization - not available in Expo Go');
    return;
  }

  try {
    console.log('[IAP] Initializing connection...');
    await iap.initConnection();
    console.log('[IAP] Connection initialized successfully');

    // Set up purchase update listener
    purchaseUpdateSubscription = iap.purchaseUpdatedListener((purchase) => {
      console.log('[IAP] ===== PURCHASE UPDATE =====');
      console.log('[IAP] Purchase:', JSON.stringify(purchase, null, 2));

      if (pendingPurchaseResolver) {
        pendingPurchaseResolver(purchase);
        pendingPurchaseResolver = null;
        pendingPurchaseRejecter = null;
      }
    });

    // Set up purchase error listener
    purchaseErrorSubscription = iap.purchaseErrorListener((error) => {
      console.log('[IAP] ===== PURCHASE ERROR =====');
      console.log('[IAP] Error:', JSON.stringify(error, null, 2));

      if (pendingPurchaseRejecter) {
        pendingPurchaseRejecter(new Error(error.message || 'Purchase failed'));
        pendingPurchaseResolver = null;
        pendingPurchaseRejecter = null;
      }
    });

    console.log('[IAP] Listeners set up');
  } catch (error) {
    console.error('[IAP] Failed to initialize:', error);
    throw error;
  }
};

/**
 * End IAP connection and clean up listeners
 */
export const endIAP = async (): Promise<void> => {
  const iap = await getIAP();
  if (!iap) return;

  try {
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }
    await iap.endConnection();
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
    console.log('[IAP] Fetching subscription products:', SUBSCRIPTION_SKUS);
    // Must use type: 'subs' for subscription products (not 'in-app')
    const products = await iap.fetchProducts({
      skus: SUBSCRIPTION_SKUS,
      type: 'subs',
    });
    console.log('[IAP] Subscription products fetched:', products);
    console.log('[IAP] Product count:', products?.length || 0);
    if (products && products.length > 0) {
      console.log('[IAP] First product details:', JSON.stringify(products[0], null, 2));
    }
    return products || [];
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
): Promise<any | null> => {
  const iap = await getIAP();
  if (!iap) {
    throw new Error('In-app purchases not available in Expo Go. Please use a development build.');
  }

  console.log('[IAP] ===== PURCHASE STARTING =====');
  console.log('[IAP] Product ID:', productId);

  return new Promise((resolve, reject) => {
    // Set up handlers
    pendingPurchaseResolver = resolve;
    pendingPurchaseRejecter = reject;

    // Set timeout
    const timeoutId = setTimeout(() => {
      console.error('[IAP] TIMEOUT - No response after 120 seconds');
      pendingPurchaseResolver = null;
      pendingPurchaseRejecter = null;
      reject(new Error('Purchase timeout - no response received'));
    }, 120000);

    // Wrap resolver to clear timeout
    const originalResolver = pendingPurchaseResolver;
    pendingPurchaseResolver = (result) => {
      clearTimeout(timeoutId);
      originalResolver(result);
    };

    const originalRejecter = pendingPurchaseRejecter;
    pendingPurchaseRejecter = (error) => {
      clearTimeout(timeoutId);
      originalRejecter(error);
    };

    // Initiate purchase
    console.log('[IAP] Calling requestPurchase...');
    iap.requestPurchase({
      request: Platform.OS === 'ios'
        ? { sku: productId }
        : { skus: [productId] },
    })
      .then((result) => {
        console.log('[IAP] requestPurchase returned:', result);
        // For iOS, the result might come directly
        if (result && !pendingPurchaseResolver) {
          // Already resolved by listener
          return;
        }
        if (result) {
          clearTimeout(timeoutId);
          pendingPurchaseResolver = null;
          pendingPurchaseRejecter = null;
          resolve(result);
        }
      })
      .catch((error) => {
        console.error('[IAP] requestPurchase error:', error);
        clearTimeout(timeoutId);
        pendingPurchaseResolver = null;
        pendingPurchaseRejecter = null;

        // Check for user cancellation
        if (error.code === 'E_USER_CANCELLED' ||
            error.message?.includes('cancel') ||
            error.message?.includes('Cancel')) {
          resolve(null);
        } else {
          reject(error);
        }
      });
  });
};

/**
 * Finish a transaction (must be called after successful purchase)
 */
export const finishTransaction = async (purchase: any): Promise<void> => {
  const iap = await getIAP();
  if (!iap) return;

  try {
    console.log('[IAP] Finishing transaction...');
    await iap.finishTransaction({ purchase, isConsumable: false });
    console.log('[IAP] Transaction finished');
  } catch (error) {
    console.error('[IAP] Failed to finish transaction:', error);
    throw error;
  }
};

/**
 * Validate receipt with backend
 */
export const validateReceiptWithBackend = async (
  purchase: any,
  token: string
): Promise<boolean> => {
  try {
    console.log('[IAP] Validating receipt with backend...');

    // Get receipt data from purchase
    const receipt = Platform.OS === 'ios'
      ? purchase.transactionReceipt
      : purchase.purchaseToken;

    const response = await fetch(`${API_URL}/api/v1/subscriptions/validate-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: Platform.OS,
        receipt: receipt || '',
        product_id: purchase.productId,
        transaction_id: purchase.transactionId || purchase.orderId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Receipt validation failed');
    }

    const data = await response.json();
    console.log('[IAP] Receipt validated:', data);

    // Finish the transaction after successful validation
    await finishTransaction(purchase);

    return true;
  } catch (error) {
    console.error('[IAP] Receipt validation failed:', error);
    throw error;
  }
};

/**
 * Restore purchases (required by Apple)
 */
export const restorePurchases = async (token: string): Promise<boolean> => {
  const iap = await getIAP();
  if (!iap) {
    throw new Error('In-app purchases not available in Expo Go');
  }

  try {
    console.log('[IAP] Restoring purchases...');

    // Get available purchases (includes past purchases)
    const purchases = await iap.getAvailablePurchases();
    console.log('[IAP] Available purchases:', purchases);

    if (!purchases || purchases.length === 0) {
      return false;
    }

    // Validate each purchase with backend
    for (const purchase of purchases) {
      if (SUBSCRIPTION_SKUS.includes(purchase.productId)) {
        await validateReceiptWithBackend(purchase, token);
      }
    }

    return true;
  } catch (error) {
    console.error('[IAP] Restore purchases failed:', error);
    throw error;
  }
};

/**
 * Check if user has an active subscription
 */
export const checkSubscriptionStatus = async (): Promise<boolean> => {
  const iap = await getIAP();
  if (!iap) {
    return false;
  }

  try {
    const hasActive = await iap.hasActiveSubscriptions(SUBSCRIPTION_SKUS);
    return hasActive;
  } catch (error) {
    console.error('[IAP] Failed to check subscription status:', error);
    return false;
  }
};
