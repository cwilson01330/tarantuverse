/**
 * Store-localized Premium prices for marketing surfaces (pricing screen,
 * UpgradeModal). Prices come from the App Store / Play products for THIS
 * account's storefront, so a keeper in Germany sees euros and a keeper in
 * the US sees dollars. When the store can't be reached (Expo Go, offline,
 * product misconfig) every price is null and callers show no amount at all —
 * never a hardcoded USD figure, which would mislead non-US storefronts.
 *
 * The purchase itself still happens on /subscription.
 */
import { useEffect, useState } from 'react';
import {
  formatProductPrice,
  getLifetimeProducts,
  getSubscriptionProducts,
  initializeIAP,
  productPriceNumber,
} from '../services/iap';

export interface StorePrices {
  monthly: string | null;
  yearly: string | null;
  lifetime: string | null;
  /** Whole-percent saving of yearly vs 12 × monthly, from the store's own
   *  numbers; null when either price is missing. */
  yearlySavingsPct: number | null;
}

const EMPTY: StorePrices = { monthly: null, yearly: null, lifetime: null, yearlySavingsPct: null };

// TV Premium SKUs (iOS has a .v2 suffix on the subscriptions).
const isPremiumMonthly = (id: string) => id.startsWith('com.tarantuverse.premium.monthly');
const isPremiumYearly = (id: string) => id.startsWith('com.tarantuverse.premium.yearly');
const isPremiumLifetime = (id: string) => id === 'com.tarantuverse.lifetime';
const skuOf = (p: any): string => p?.id || p?.productId || '';

// One fetch per app session — the modal can open many times.
let cached: StorePrices | null = null;
let inflight: Promise<StorePrices> | null = null;

async function loadStorePrices(): Promise<StorePrices> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await initializeIAP();
      const [subs, lifetime] = await Promise.all([
        getSubscriptionProducts().catch(() => [] as any[]),
        getLifetimeProducts().catch(() => [] as any[]),
      ]);
      const monthly = subs.find((p) => isPremiumMonthly(skuOf(p)));
      const yearly = subs.find((p) => isPremiumYearly(skuOf(p)));
      const life = lifetime.find((p) => isPremiumLifetime(skuOf(p)));

      const m = productPriceNumber(monthly);
      const y = productPriceNumber(yearly);
      const pct = m && y && y < m * 12 ? Math.round((1 - y / (m * 12)) * 100) : null;

      const result: StorePrices = {
        monthly: monthly ? formatProductPrice(monthly) : null,
        yearly: yearly ? formatProductPrice(yearly) : null,
        lifetime: life ? formatProductPrice(life) : null,
        yearlySavingsPct: pct && pct > 0 ? pct : null,
      };
      // Only cache a useful answer so a transient failure can retry later.
      if (result.monthly || result.yearly || result.lifetime) cached = result;
      return result;
    } catch {
      return EMPTY;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useStorePrices(enabled = true): StorePrices {
  const [prices, setPrices] = useState<StorePrices>(cached ?? EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadStorePrices().then((p) => {
      if (alive) setPrices(p);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return prices;
}
