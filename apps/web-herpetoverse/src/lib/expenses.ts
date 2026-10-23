/**
 * Expense tracking client — see the shared half below the marker.
 * Transport: Herpetoverse web's `apiFetch` (`lib/apiClient.ts`: hv token, 401 clears the session).
 * Paths here are relative to `/api/v1`.
 */
import { ApiError, UnauthorizedError, apiFetch } from './apiClient';

type TransportResult = { status: number; data: any };

/** HTTP adapter. Resolves with the status and parsed body for ANY response; only network failures (and a 401) throw. */
async function transport(method: string, path: string, body?: unknown): Promise<TransportResult> {
  try {
    const data = await apiFetch<any>(`/api/v1${path}`, { method, json: body });
    return { status: method === 'DELETE' ? 204 : 200, data };
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    if (e instanceof ApiError) return { status: e.status, data: e.body };
    throw e;
  }
}

// ---- shared below: keep identical in all four copies ----
//
// Expense tracking client (API: routers/expenses.py, spec 2026-10-22 §3).
//
// FOUR COPIES, byte-identical below the marker above (only the import lines and
// the `transport` adapter at the top differ):
//   apps/web/src/lib/expenses.ts
//   apps/mobile/src/lib/expenses.ts
//   apps/web-herpetoverse/src/lib/expenses.ts
//   apps/mobile-herpetoverse/src/lib/expenses.ts
// Pinned by apps/mobile/src/lib/__tests__/expenses.test.ts. HV copies keep the
// colony fields in the types (harmless) so this half can stay identical.
//
// The API sends money as JSON STRINGS ("30.00"); every function here hands
// back plain numbers. Amounts go out as two-decimal strings.

export type ExpenseApp = 'tarantuverse' | 'herpetoverse';

export type ExpenseCategory =
  | 'feeders'
  | 'substrate_decor'
  | 'enclosures_equipment'
  | 'heat_lighting'
  | 'health_vet'
  | 'shipping'
  | 'other';

export type ExpenseSplitMode = 'none' | 'animals' | 'location' | 'collection';

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'feeders', label: 'Feeders' },
  { key: 'substrate_decor', label: 'Substrate & decor' },
  { key: 'enclosures_equipment', label: 'Enclosures & equipment' },
  { key: 'heat_lighting', label: 'Heat & lighting' },
  { key: 'health_vet', label: 'Health & vet' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'other', label: 'Other' },
];

export const EXPENSE_MAX_SHARES = 500;
export const EXPENSE_MAX_AMOUNT = 100000;
export const EXPENSE_DESCRIPTION_MAX = 120;
export const EXPENSE_NOTES_MAX = 500;

/** Label for a category key; unknown keys read as "Other". */
export function categoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other';
}

/** "$30.00" / "-$2.50". Always two decimals, no grouping (like the feeding-cost card). */
export function formatMoney(n: number): string {
  const cents = toCents(n);
  const abs = Math.abs(cents);
  const text = `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${text}` : text;
}

/** Whole cents from a dollar amount, rounded half-up (float noise like 1.005 * 100 ignored). */
function toCents(n: number): number {
  const scaled = Number((Math.abs(n) * 100).toPrecision(12));
  const cents = Math.round(scaled);
  return n < 0 ? -cents : cents;
}

/**
 * Divide `amount` into `n` parts of whole cents that sum exactly to it. The
 * first `extra` parts carry the leftover pennies — identical to the server's
 * `divide_amount`, so a preview matches what gets stored.
 */
export function splitAmount(amount: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be at least 1');
  const cents = toCents(amount);
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

// ── types (money already converted to numbers) ───────────────────────────────

export type ExpenseTargetKind = 'invert' | 'colony' | 'animal';

export interface ExpenseShare {
  /** null when the animal / colony was deleted (the share is kept). */
  target_kind: ExpenseTargetKind | null;
  target_id: string | null;
  name: string;
  amount: number;
}

export interface Expense {
  id: string;
  spent_on: string; // YYYY-MM-DD
  description: string;
  category: ExpenseCategory;
  amount: number;
  notes: string | null;
  split_mode: ExpenseSplitMode;
  split_label: string | null;
  share_count: number;
  created_by_name: string | null;
}

export interface ExpenseDetail extends Expense {
  shares: ExpenseShare[];
}

export interface ExpenseList {
  items: Expense[];
  total: number;
  /** false = the collection owner isn't premium: reading is open, adding isn't. */
  can_add: boolean;
}

export interface ExpenseSummary {
  total: number;
  by_category: Record<string, number>;
  by_month: { month: string; total: number }[]; // "YYYY-MM"
  by_location: { location: string; total: number }[];
  top_animals: { target_kind: ExpenseTargetKind; target_id: string; name: string; total: number }[];
  unallocated_total: number;
  can_add: boolean;
}

export interface AnimalCost {
  can_add: boolean;
  purchase_price: number | null;
  shares_total: number;
  by_category: Record<string, number>;
  total: number;
  shares: {
    expense_id: string;
    spent_on: string;
    description: string;
    category: ExpenseCategory;
    /** This animal's cut, not the whole purchase. */
    amount: number;
  }[];
}

export interface ExpenseSplitInput {
  mode: ExpenseSplitMode;
  /** mode 'animals' only. TV: invert_ids + colony_ids. HV: animal_ids. */
  invert_ids?: string[];
  colony_ids?: string[];
  animal_ids?: string[];
  /** mode 'location' only. */
  location?: string;
}

export interface ExpenseInput {
  app: ExpenseApp;
  /** Owner's user id when a co-keeper logs it; omit for your own collection. */
  collection?: string | null;
  spent_on: string; // YYYY-MM-DD
  description: string;
  category: ExpenseCategory;
  amount: number;
  notes?: string | null;
  split?: ExpenseSplitInput;
}

/** PUT body: every field optional. `notes: null` clears; `split` replaces the split. */
export type ExpenseUpdateInput = Partial<Omit<ExpenseInput, 'app' | 'collection'>>;

export interface ExpenseListParams {
  app: ExpenseApp;
  collection?: string | null;
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  limit?: number;
  offset?: number;
}

export interface ExpenseSummaryParams {
  app: ExpenseApp;
  collection?: string | null;
  from?: string;
  to?: string;
}

/** Exactly one id. TV: invert_id | colony_id. HV: animal_id. */
export interface AnimalCostParams {
  invert_id?: string;
  colony_id?: string;
  animal_id?: string;
}

// ── errors ───────────────────────────────────────────────────────────────────

/** The collection owner isn't premium and the call was a create / update (403, code premium_required). */
export class PremiumRequiredError extends Error {
  readonly code = 'premium_required';
  constructor(message = 'Expense tracking is a premium feature') {
    super(message);
    this.name = 'PremiumRequiredError';
    Object.setPrototypeOf(this, PremiumRequiredError.prototype);
  }
}

function errorMessage(data: any, status: number): string {
  const detail = data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error,\s*/i, '') : null))
      .filter((m): m is string => !!m);
    if (msgs.length) return msgs.join('. ');
  }
  if (typeof detail?.message === 'string') return detail.message;
  return `Request failed (${status})`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { status, data } = await transport(method, path, body);
  if (status >= 200 && status < 300) return data as T;
  if (status === 403 && (data as any)?.code === 'premium_required') {
    throw new PremiumRequiredError(errorMessage(data, status));
  }
  throw new Error(errorMessage(data, status));
}

// ── wire → client conversion ─────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function numMap(m: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m ?? {})) out[k] = num(v);
  return out;
}

/** Dollar amount → the API's two-decimal string ("30.00"). */
function moneyString(n: number): string {
  return (toCents(n) / 100).toFixed(2);
}

function toExpense(w: any): Expense {
  return { ...w, amount: num(w.amount), notes: w.notes ?? null, split_label: w.split_label ?? null, created_by_name: w.created_by_name ?? null };
}

function toDetail(w: any): ExpenseDetail {
  return {
    ...toExpense(w),
    shares: (w.shares ?? []).map((s: any) => ({ ...s, amount: num(s.amount) })),
  };
}

function query(params: Record<string, string | number | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function wireBody(body: ExpenseInput | ExpenseUpdateInput): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if (typeof (body as any).amount === 'number') out.amount = moneyString((body as any).amount);
  return out;
}

// ── API ──────────────────────────────────────────────────────────────────────
// Collection routes keep their trailing slash; /summary and /animal-cost are
// declared without one — match the router exactly.

export async function listExpenses(params: ExpenseListParams): Promise<ExpenseList> {
  const w = await request<any>('GET', `/expenses/${query({ ...params })}`);
  return { items: (w.items ?? []).map(toExpense), total: w.total ?? 0, can_add: !!w.can_add };
}

export async function getExpense(id: string): Promise<ExpenseDetail> {
  return toDetail(await request<any>('GET', `/expenses/${encodeURIComponent(id)}`));
}

export async function createExpense(body: ExpenseInput): Promise<ExpenseDetail> {
  return toDetail(await request<any>('POST', '/expenses/', wireBody(body)));
}

export async function updateExpense(id: string, body: ExpenseUpdateInput): Promise<ExpenseDetail> {
  return toDetail(await request<any>('PUT', `/expenses/${encodeURIComponent(id)}`, wireBody(body)));
}

export async function deleteExpense(id: string): Promise<void> {
  await request<unknown>('DELETE', `/expenses/${encodeURIComponent(id)}`);
}

export async function getExpenseSummary(params: ExpenseSummaryParams): Promise<ExpenseSummary> {
  const w = await request<any>('GET', `/expenses/summary${query({ ...params })}`);
  return {
    total: num(w.total),
    by_category: numMap(w.by_category),
    by_month: (w.by_month ?? []).map((m: any) => ({ ...m, total: num(m.total) })),
    by_location: (w.by_location ?? []).map((l: any) => ({ ...l, total: num(l.total) })),
    top_animals: (w.top_animals ?? []).map((a: any) => ({ ...a, total: num(a.total) })),
    unallocated_total: num(w.unallocated_total),
    can_add: !!w.can_add,
  };
}

export async function getAnimalCost(params: AnimalCostParams): Promise<AnimalCost> {
  const w = await request<any>('GET', `/expenses/animal-cost${query({ ...params })}`);
  return {
    can_add: !!w.can_add,
    purchase_price: w.purchase_price === null || w.purchase_price === undefined ? null : num(w.purchase_price),
    shares_total: num(w.shares_total),
    by_category: numMap(w.by_category),
    total: num(w.total),
    shares: (w.shares ?? []).map((s: any) => ({ ...s, amount: num(s.amount) })),
  };
}
