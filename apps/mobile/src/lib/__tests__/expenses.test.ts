/**
 * Expense client lib. The same file ships in four copies (TV web/mobile, HV
 * web/mobile); everything below the "shared below" marker is byte-identical,
 * so this one test pins the shared half. The transport is mocked.
 */
import {
  EXPENSE_CATEGORIES,
  PremiumRequiredError,
  categoryLabel,
  createExpense,
  deleteExpense,
  formatMoney,
  getAnimalCost,
  getExpense,
  getExpenseSummary,
  listExpenses,
  splitAmount,
  updateExpense,
} from '../expenses';

const mockRequest = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
  default: { request: (...args: unknown[]) => mockRequest(...args) },
}));

const cents = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0);

beforeEach(() => mockRequest.mockReset());

describe('splitAmount', () => {
  it('gives the leftover pennies to the first shares', () => {
    expect(splitAmount(10, 3)).toEqual([3.34, 3.33, 3.33]);
    expect(splitAmount(0.01, 3)).toEqual([0.01, 0, 0]);
  });

  it('splits evenly when it can', () => {
    expect(splitAmount(30, 15)).toEqual(Array(15).fill(2));
  });

  it('always sums to the cent', () => {
    for (const [amount, n] of [
      [10, 3],
      [0.01, 3],
      [99.99, 7],
      [1.005, 4],
      [100000, 500],
      [0.1 + 0.2, 3],
    ] as const) {
      const parts = splitAmount(amount, n);
      expect(parts).toHaveLength(n);
      expect(cents(parts)).toBe(Math.round(Number((amount * 100).toPrecision(12))));
    }
  });

  it('refuses fewer than one share', () => {
    expect(() => splitAmount(10, 0)).toThrow();
  });
});

describe('formatMoney / categories', () => {
  it('prints a dollar sign and two decimals', () => {
    expect(formatMoney(2)).toBe('$2.00');
    expect(formatMoney(30)).toBe('$30.00');
    expect(formatMoney(3.3)).toBe('$3.30');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('lists the categories in the API order', () => {
    expect(EXPENSE_CATEGORIES.map((c) => c.key)).toEqual([
      'feeders',
      'substrate_decor',
      'enclosures_equipment',
      'heat_lighting',
      'health_vet',
      'shipping',
      'other',
    ]);
    expect(EXPENSE_CATEGORIES.map((c) => c.label)).toEqual([
      'Feeders',
      'Substrate & decor',
      'Enclosures & equipment',
      'Heat & lighting',
      'Health & vet',
      'Shipping',
      'Other',
    ]);
    expect(categoryLabel('heat_lighting')).toBe('Heat & lighting');
    expect(categoryLabel('mystery')).toBe('Other');
  });
});

describe('API calls', () => {
  it('turns every money string into a number', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        items: [
          {
            id: 'e1', spent_on: '2026-10-01', description: 'Crickets', category: 'feeders',
            amount: '30.00', notes: null, split_mode: 'none', split_label: null,
            share_count: 0, created_by_name: 'Cory',
          },
        ],
        total: 1,
        can_add: true,
      },
    });
    const list = await listExpenses({ app: 'tarantuverse', from: '2026-10-01', category: 'feeders' });
    expect(list.items[0].amount).toBe(30);
    expect(typeof list.items[0].amount).toBe('number');
    const call = mockRequest.mock.calls[0][0];
    expect(call.method).toBe('GET');
    expect(call.url).toBe('/expenses/?app=tarantuverse&from=2026-10-01&category=feeders');
  });

  it('converts detail shares', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 'e1', spent_on: '2026-10-01', description: 'x', category: 'other', amount: '10.00',
        notes: null, split_mode: 'animals', split_label: '3 animals', share_count: 3, created_by_name: null,
        shares: [
          { target_kind: 'invert', target_id: 'a', name: 'A', amount: '3.34' },
          { target_kind: null, target_id: null, name: 'Removed animal', amount: '3.33' },
        ],
      },
    });
    const d = await getExpense('e1');
    expect(d.shares.map((s) => s.amount)).toEqual([3.34, 3.33]);
  });

  it('sends amounts as two-decimal strings', async () => {
    mockRequest.mockResolvedValueOnce({ status: 201, data: { id: 'e2', amount: '30.00', shares: [] } });
    await createExpense({
      app: 'tarantuverse',
      spent_on: '2026-10-01',
      description: 'Crickets',
      category: 'feeders',
      amount: 30,
    });
    const call = mockRequest.mock.calls[0][0];
    expect(call.method).toBe('POST');
    expect(call.url).toBe('/expenses/');
    expect(call.data.amount).toBe('30.00');

    mockRequest.mockResolvedValueOnce({ status: 200, data: { id: 'e2', amount: '4.50', shares: [] } });
    await updateExpense('e2', { amount: 4.5, notes: null });
    const put = mockRequest.mock.calls[1][0];
    expect(put.method).toBe('PUT');
    expect(put.url).toBe('/expenses/e2');
    expect(put.data).toEqual({ amount: '4.50', notes: null });
  });

  it('deletes with no body back', async () => {
    mockRequest.mockResolvedValueOnce({ status: 204, data: '' });
    await expect(deleteExpense('e3')).resolves.toBeUndefined();
    expect(mockRequest.mock.calls[0][0].method).toBe('DELETE');
  });

  it('converts the summary and animal cost', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        total: '120.50',
        by_category: { feeders: '100.25', other: '20.25' },
        by_month: [{ month: '2026-10', total: '120.50' }],
        by_location: [{ location: 'Shelf A', total: '60.00' }],
        top_animals: [{ target_kind: 'invert', target_id: 'a', name: 'Rosie', total: '12.00' }],
        unallocated_total: '5.00',
        can_add: false,
      },
    });
    const s = await getExpenseSummary({ app: 'tarantuverse' });
    expect(mockRequest.mock.calls[0][0].url).toBe('/expenses/summary?app=tarantuverse');
    expect(s.total).toBe(120.5);
    expect(s.by_category).toEqual({ feeders: 100.25, other: 20.25 });
    expect(s.by_month[0].total).toBe(120.5);
    expect(s.by_location[0].total).toBe(60);
    expect(s.top_animals[0].total).toBe(12);
    expect(s.unallocated_total).toBe(5);

    mockRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        can_add: true, purchase_price: '45.00', shares_total: '8.40', by_category: { feeders: '8.40' },
        total: '53.40',
        shares: [{ expense_id: 'e', spent_on: '2026-10-01', description: 'x', category: 'feeders', amount: '8.40' }],
      },
    });
    const c = await getAnimalCost({ invert_id: 'abc' });
    expect(mockRequest.mock.calls[1][0].url).toBe('/expenses/animal-cost?invert_id=abc');
    expect([c.purchase_price, c.shares_total, c.total, c.by_category.feeders, c.shares[0].amount]).toEqual([
      45, 8.4, 53.4, 8.4, 8.4,
    ]);

    mockRequest.mockResolvedValueOnce({
      status: 200,
      data: { can_add: true, purchase_price: null, shares_total: '0.00', by_category: {}, total: '0.00', shares: [] },
    });
    expect((await getAnimalCost({ animal_id: 'z' })).purchase_price).toBeNull();
  });
});

describe('errors', () => {
  it('throws PremiumRequiredError on the premium 403', async () => {
    mockRequest.mockRejectedValueOnce({
      response: { status: 403, data: { detail: 'Expense tracking is a premium feature', code: 'premium_required' } },
    });
    const err = await createExpense({
      app: 'tarantuverse', spent_on: '2026-10-01', description: 'x', category: 'other', amount: 1,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PremiumRequiredError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Expense tracking is a premium feature');
  });

  it('carries the API detail for other failures', async () => {
    mockRequest.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Not allowed' } } });
    await expect(getExpense('x')).rejects.toThrow('Not allowed');
    expect(await getExpense('x').catch((e) => e)).not.toBeInstanceOf(PremiumRequiredError);
  });

  it('joins 422 messages', async () => {
    mockRequest.mockRejectedValueOnce({
      response: {
        status: 422,
        data: { detail: [{ msg: 'Value error, Amount must be more than $0.00' }, { msg: 'Date can\'t be in the future' }] },
      },
    });
    const err = await deleteExpense('x').catch((e) => e);
    expect(err.message).toContain('Amount must be more than $0.00');
    expect(err.message).toContain("Date can't be in the future");
  });

  it('rethrows network errors untouched', async () => {
    const boom = new Error('Network Error');
    mockRequest.mockRejectedValueOnce(boom);
    await expect(getExpense('x')).rejects.toBe(boom);
  });
});
