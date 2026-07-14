/**
 * Herpetoverse in-app purchases (expo-iap) — mirrors the proven Tarantuverse
 * service, adapted for HV's two tiers (Premium + All-Access) and two lifetimes.
 *
 * Product IDs must match App Store Connect / Google Play. The client fetches
 * DYNAMICALLY and renders only what the store returns, so IDs that aren't live
 * yet (e.g. yearly/lifetime added after first approval) simply don't appear —
 * no crash, no app update needed when they go live.
 *
 * Backend mapping lives in apps/api/app/routers/subscriptions.py
 * (product_to_plan_map). Any product added here MUST be added there too, or the
 * user is charged by the store but the receipt is rejected.
 *
 * Not available in Expo Go (native module) — guarded so the JS still loads.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === 'expo';

let ExpoIAP: typeof import('expo-iap') | null = null;
const getIAP = async () => {
  if (isExpoGo) return null;
  if (!ExpoIAP) ExpoIAP = await import('expo-iap');
  return ExpoIAP;
};

// Auto-renewable subscriptions (type 'subs'). iOS uses per-duration product IDs;
// Android's Play subscriptions are the subscription-level IDs with base plans.
// We list the canonical IDs plus `.v2` fallbacks (iOS sometimes forces a suffix
// when a product is recreated — matches what TV needed).
export const SUBSCRIPTION_SKUS = Platform.select({
  ios: [
    'herpetoverse.premium.monthly',
    'herpetoverse.premium.monthly.v2',
    'herpetoverse.premium.yearly',
    'herpetoverse.premium.yearly.v2',
    'herpetoverse.allaccess.monthly',
    'herpetoverse.allaccess.monthly.v2',
    'herpetoverse.allaccess.yearly',
    'herpetoverse.allaccess.yearly.v2',
  ],
  android: [
    // Play subscription-level product IDs (base plans monthly/yearly live inside).
    'herpetoverse.premium',
    'herpetoverse.allaccess',
  ],
}) || [];

// One-time non-consumables (type 'in-app').
export const LIFETIME_SKUS = Platform.select({
  ios: ['herpetoverse.premium.lifetime', 'herpetoverse.allaccess.lifetime'],
  android: ['herpetoverse.premium.lifetime', 'herpetoverse.allaccess.lifetime'],
}) || [];

/** True when a real purchase is possible (i.e. a dev/production build, not Expo Go). */
export const isIAPAvailable = () => !isExpoGo;

let purchaseUpdateSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;
let pendingResolve: ((result: any) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;

export const initializeIAP = async (): Promise<void> => {
  const iap = await getIAP();
  if (!iap) return;
  try {
    await iap.initConnection();
    purchaseUpdateSub = iap.purchaseUpdatedListener((purchase) => {
      if (pendingResolve) {
        pendingResolve(purchase);
        pendingResolve = null;
        pendingReject = null;
      }
    });
    purchaseErrorSub = iap.purchaseErrorListener((error) => {
      if (pendingReject) {
        pendingReject(new Error(error.message || 'Purchase failed'));
        pendingResolve = null;
        pendingReject = null;
      }
    });
  } catch (e) {
    console.error('[HV IAP] init failed:', e);
  }
};

export const endIAP = async (): Promise<void> => {
  const iap = await getIAP();
  if (!iap) return;
  try {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
    await iap.endConnection();
  } catch (e) {
    console.error('[HV IAP] end failed:', e);
  }
};

export interface IapProduct {
  id: string;
  title: string;
  displayPrice: string;
  type: 'subs' | 'in-app';
  raw: any;
}

/**
 * Fetch every available product (subscriptions + lifetimes) the store returns.
 * Missing/not-yet-live IDs are silently omitted — that's the staggered-rollout
 * behavior. Returns a flat, UI-friendly list.
 */
export const getAvailableProducts = async (): Promise<IapProduct[]> => {
  const iap = await getIAP();
  if (!iap) return [];
  const out: IapProduct[] = [];

  const map = (p: any, type: 'subs' | 'in-app'): IapProduct => ({
    id: p.id ?? p.productId ?? p.sku,
    title: p.title ?? p.displayName ?? '',
    displayPrice: p.displayPrice ?? p.localizedPrice ?? p.price ?? '',
    type,
    raw: p,
  });

  try {
    if (SUBSCRIPTION_SKUS.length) {
      const subs = await iap.fetchProducts({ skus: SUBSCRIPTION_SKUS, type: 'subs' });
      (subs || []).forEach((p: any) => out.push(map(p, 'subs')));
    }
  } catch (e) {
    console.warn('[HV IAP] sub fetch failed:', e);
  }
  try {
    if (LIFETIME_SKUS.length) {
      const items = await iap.fetchProducts({ skus: LIFETIME_SKUS, type: 'in-app' });
      (items || []).forEach((p: any) => out.push(map(p, 'in-app')));
    }
  } catch (e) {
    console.warn('[HV IAP] lifetime fetch failed:', e);
  }
  return out;
};

/**
 * Purchase a product. `type` must match the product ('subs' for auto-renewables,
 * 'in-app' for the lifetime non-consumables). Resolves with the purchase, or
 * null if the user cancelled.
 */
export const purchaseProduct = async (
  productId: string,
  type: 'subs' | 'in-app',
): Promise<any | null> => {
  const iap = await getIAP();
  if (!iap) {
    throw new Error('In-app purchases require the installed app (not Expo Go).');
  }
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    const timeout = setTimeout(() => {
      pendingResolve = null;
      pendingReject = null;
      reject(new Error('Purchase timed out — no response received.'));
    }, 120000);

    const done = (fn: (v: any) => void) => (v: any) => {
      clearTimeout(timeout);
      fn(v);
    };
    pendingResolve = done(resolve);
    pendingReject = done(reject);

    iap
      .requestPurchase({
        request: { apple: { sku: productId }, google: { skus: [productId] } },
        type,
      })
      .then((result: any) => {
        if (result && pendingResolve) {
          clearTimeout(timeout);
          const r = pendingResolve;
          pendingResolve = null;
          pendingReject = null;
          r(result);
        }
      })
      .catch((error: any) => {
        clearTimeout(timeout);
        pendingResolve = null;
        pendingReject = null;
        if (
          error?.code === 'E_USER_CANCELLED' ||
          /cancel/i.test(error?.message || '')
        ) {
          resolve(null); // treat cancellation as a no-op, not an error
        } else {
          reject(error);
        }
      });
  });
};

const finishTransaction = async (purchase: any, isConsumable = false) => {
  const iap = await getIAP();
  if (!iap) return;
  try {
    await iap.finishTransaction({ purchase, isConsumable });
  } catch (e) {
    console.error('[HV IAP] finishTransaction failed:', e);
  }
};

/**
 * Send the receipt to the backend to activate the app-scoped subscription.
 * Finishes the store transaction on success.
 */
export const validateReceiptWithBackend = async (
  purchase: any,
  token: string,
): Promise<boolean> => {
  const receipt =
    Platform.OS === 'ios' ? purchase.transactionReceipt : purchase.purchaseToken;

  const res = await fetch(`${API_URL}/api/v1/subscriptions/validate-receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      platform: Platform.OS,
      receipt: receipt || '',
      product_id: purchase.productId ?? purchase.id,
      transaction_id: purchase.transactionId || purchase.orderId,
      original_transaction_id:
        purchase.originalTransactionIdentifierIOS ||
        purchase.originalTransactionIdentifierIos ||
        null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Receipt validation failed');
  }
  await finishTransaction(purchase, false);
  return true;
};

/** Restore past purchases (required by Apple). Validates each with the backend. */
export const restorePurchases = async (token: string): Promise<boolean> => {
  const iap = await getIAP();
  if (!iap) throw new Error('In-app purchases require the installed app.');
  const purchases = await iap.getAvailablePurchases();
  if (!purchases?.length) return false;
  const known = new Set([...SUBSCRIPTION_SKUS, ...LIFETIME_SKUS]);
  let any = false;
  for (const p of purchases) {
    const pid = (p as any).productId ?? (p as any).id;
    if (known.has(pid)) {
      await validateReceiptWithBackend(p, token);
      any = true;
    }
  }
  return any;
};
