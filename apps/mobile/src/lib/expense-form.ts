/**
 * Pure helpers for the Expenses screens (spec 2026-10-22 §3). Kept out of the
 * screens so the rules that matter — what counts as a valid amount, which day
 * is "today", what the split preview says — are pinned by a jest test.
 *
 * The preview copy matches the web form (apps/web/src/components/ExpenseForm.tsx)
 * character for character; the cents math is the lib's `splitAmount`, which is
 * the server's `divide_amount`, so what the keeper reads is what gets stored.
 */
import { toISODateLocal } from '../utils/date';
import { EXPENSE_MAX_AMOUNT, formatMoney, splitAmount, type Expense } from './expenses';

/** Today in the keeper's LOCAL calendar as YYYY-MM-DD (never toISOString: that is UTC). */
export function localToday(now: Date = new Date()): string {
  return toISODateLocal(now);
}

/**
 * Amount text → dollars, or null when it isn't usable. Same rule as the web
 * form's `parseAmount` (keep the two in step):
 *   1. trim;
 *   2. thousands grouping ("1,234.50", "12,500") → drop the commas;
 *   3. else a decimal comma, one or two digits ("12,50", "1,5") → "." (iOS
 *      decimal-pad shows a comma key in comma-decimal locales);
 *   4. else any other comma → refused;
 *   5. then digits with at most two decimals, > 0 and <= EXPENSE_MAX_AMOUNT.
 * "1e3", "0x10", "1.234", "$5", ".5" and "5." are all refused.
 */
export function parseExpenseAmount(text: string): number | null {
  let t = text.trim();
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else if (t.includes(',')) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  if (!(n > 0) || n > EXPENSE_MAX_AMOUNT) return null;
  return n;
}

/** "$30.00 across 15 animals · $2.00 each" and its uneven / single-animal forms. */
export function splitPreview(amount: number, n: number): string {
  if (n < 1) return 'Pick at least one animal';
  if (n === 1) return `${formatMoney(amount)} on 1 animal`;
  const parts = splitAmount(amount, n);
  const largest = parts[0];
  const smallest = parts[parts.length - 1];
  const each =
    largest === smallest
      ? `${formatMoney(largest)} each`
      : `${formatMoney(largest)} / ${formatMoney(smallest)} each`;
  return `${formatMoney(amount)} across ${n} animals · ${each}`;
}

/** A saved share as far as seeding cares: which kind of target, and which one (null = deleted). */
export interface SeedShare {
  target_kind: string | null;
  target_id: string | null;
}

/** Ids of the animals / colonies currently in the collection (the picker's list). */
export interface LivingIds {
  inverts: Iterable<string>;
  colonies: Iterable<string>;
}

/**
 * Seed the "Pick animals" selection from a saved split. ONLY ids present in the
 * living list are picked; a saved target that has died, been transferred, ended
 * / archived (colonies) or been deleted (null target) is never picked, because
 * the picker can't show it and so the keeper could never untick it. Each such
 * share counts in `missing` (drives `missingTargetsNote`). Keep the three
 * expense forms (TV web, HV web, this one) in step.
 */
export function seedPicks(
  shares: SeedShare[],
  living: LivingIds,
): { picked: { inverts: string[]; colonies: string[] }; missing: number } {
  const liveInverts = new Set(living.inverts);
  const liveColonies = new Set(living.colonies);
  const inverts = new Set<string>();
  const colonies = new Set<string>();
  let missing = 0;
  for (const s of shares) {
    const id = s.target_id;
    if (id && s.target_kind === 'invert' && liveInverts.has(id)) inverts.add(id);
    else if (id && s.target_kind === 'colony' && liveColonies.has(id)) colonies.add(id);
    else missing += 1;
  }
  return { picked: { inverts: Array.from(inverts), colonies: Array.from(colonies) }, missing };
}

/** The note under the split when saved shares point at animals that are gone (null = nothing missing). */
export function missingTargetsNote(missing: number): string | null {
  if (missing < 1) return null;
  const who = missing === 1 ? '1 animal in this split is' : `${missing} animals in this split are`;
  return `${who} no longer in your collection. Changing the split moves the cost onto the animals you pick; leave the split unchanged to keep it as it was.`;
}

/** Row subtitle for a saved expense: "Not split" / "Split across 3 animals · Spider room". */
export function splitText(e: Pick<Expense, 'split_mode' | 'share_count' | 'split_label'>): string {
  if (e.split_mode === 'none') return 'Not split';
  const base = `Split across ${e.share_count} ${e.share_count === 1 ? 'animal' : 'animals'}`;
  return e.split_label ? `${base} · ${e.split_label}` : base;
}

/** "YYYY-MM" for a local date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "October 2026" for a "YYYY-MM" key (the key itself if it can't be read). */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map((p) => Number.parseInt(p, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
