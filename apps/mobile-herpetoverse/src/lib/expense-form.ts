/**
 * Pure helpers for the Expenses screens (spec 2026-10-22 §3). Kept out of the
 * screens so the rules that matter — what counts as a valid amount, which day
 * is "today", what the split preview says — can be pinned by a test.
 *
 * Herpetoverse copy of apps/mobile/src/lib/expense-form.ts, adapted to animals
 * only (HV has no colonies). The amount rule, the preview copy and the seeding
 * rule are the same as TV mobile, TV web and HV web
 * (apps/web-herpetoverse/src/components/ExpenseForm.tsx); keep them in step.
 * The cents math is the lib's `splitAmount`, which is the server's
 * `divide_amount`, so what the keeper reads is what gets stored.
 */
import { EXPENSE_MAX_AMOUNT, formatMoney, splitAmount, type Expense } from './expenses';

/** The earliest date the API accepts for `spent_on`. */
export const EXPENSE_EARLIEST_DATE = '1990-01-01';

/** YYYY-MM-DD from LOCAL calendar parts (never toISOString: that is UTC). */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Today in the keeper's LOCAL calendar as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  return ymd(now);
}

/**
 * Why a typed date can't be used, or null when it can. The field is a plain
 * YYYY-MM-DD text input (like HV's other forms), so this checks the shape, that
 * the day exists on the calendar ("2026-02-31" is refused, not rolled over),
 * that it isn't before 1990 and that it isn't after the keeper's local today.
 * (The API allows up to UTC today + 1 day; local today is never past that.)
 * `savedDate` is the date an expense being edited already has: keeping it
 * unchanged is always fine, even when it is after the keeper's local today
 * (logged from further east); only a NEW date is held to "no later than today".
 */
export function expenseDateError(
  text: string,
  today: string = localToday(),
  savedDate: string | null = null,
): string | null {
  const t = text.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return 'Enter the date as YYYY-MM-DD, like 2026-10-23.';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const real = new Date(y, mo - 1, d);
  if (real.getFullYear() !== y || real.getMonth() !== mo - 1 || real.getDate() !== d) {
    return 'That date does not exist. Enter it as YYYY-MM-DD.';
  }
  if (t < EXPENSE_EARLIEST_DATE) return 'Pick a date after 1990.';
  if (t > today && t !== savedDate) return 'Pick a date no later than today.';
  return null;
}

/**
 * Amount text → dollars, or null when it isn't usable. Same rule as the TV
 * mobile `parseExpenseAmount` and the web forms' `parseAmount` (keep them in
 * step):
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

/**
 * Seed the "Pick animals" selection from a saved split. ONLY ids present in the
 * living list are picked; a saved target that has died, been transferred or been
 * deleted (null target) is never picked, because the picker can't show it and
 * so the keeper could never untick it. Each such share counts in `missing`
 * (drives `missingTargetsNote`). A duplicate id is picked once.
 */
export function seedPicks(
  shares: SeedShare[],
  livingIds: Iterable<string>,
): { picked: string[]; missing: number } {
  const live = new Set(livingIds);
  const picked = new Set<string>();
  let missing = 0;
  for (const s of shares) {
    const id = s.target_id;
    if (id && s.target_kind === 'animal' && live.has(id)) picked.add(id);
    else missing += 1;
  }
  return { picked: Array.from(picked), missing };
}

/** The note under the split when saved shares point at animals that are gone (null = nothing missing). */
export function missingTargetsNote(missing: number): string | null {
  if (missing < 1) return null;
  const who = missing === 1 ? '1 animal in this split is' : `${missing} animals in this split are`;
  return `${who} no longer in your collection. Changing the split moves the cost onto the animals you pick; leave the split unchanged to keep it as it was.`;
}

/** Row subtitle for a saved expense: "Not split" / "Split across 3 animals · Rack 2". */
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
