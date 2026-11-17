const mockPost = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

import {
  PREMOLT_COPY,
  alertCount,
  answerPremolt,
  premoltAnswerable,
  premoltCardState,
  type PremoltPrediction,
} from '../premolt-view';

function pred(over: Partial<PremoltPrediction> = {}): PremoltPrediction {
  return {
    tarantula_id: 'a',
    tarantula_name: 'Alpha',
    is_premolt_likely: false,
    confidence: 'low',
    recent_refusal_streak: 0,
    data_quality: 'good',
    has_matured: false,
    feeding_count: 5,
    molt_count: 2,
    ...over,
  } as PremoltPrediction;
}

describe('premoltCardState', () => {
  it('hides for null, grazers and closed animals', () => {
    expect(premoltCardState(null)).toBe('hidden');
    expect(premoltCardState(pred({ eligible: false, ineligible_reason: 'grazer' }))).toBe('hidden');
    expect(premoltCardState(pred({ eligible: false, ineligible_reason: 'closed' }))).toBe('hidden');
  });
  it('matured by flag or reason', () => {
    expect(premoltCardState(pred({ has_matured: true }))).toBe('matured');
    expect(premoltCardState(pred({ eligible: false, ineligible_reason: 'matured' }))).toBe('matured');
  });
  it('insufficient data and not likely', () => {
    expect(premoltCardState(pred({ eligible: true, data_quality: 'insufficient' }))).toBe('insufficient');
  });
  it('paused beats everything below it', () => {
    expect(premoltCardState(pred({ eligible: true, is_premolt_likely: true, paused_for_premolt: true, show_alert: false }))).toBe('paused');
  });
  it('snoozed when likely but the alert is hidden', () => {
    expect(premoltCardState(pred({ eligible: true, is_premolt_likely: true, show_alert: false }))).toBe('snoozed');
  });
  it('alert when show_alert', () => {
    expect(premoltCardState(pred({ eligible: true, is_premolt_likely: true, show_alert: true }))).toBe('alert');
  });
  it('clear otherwise', () => {
    expect(premoltCardState(pred({ eligible: true }))).toBe('clear');
  });
  it('old-style response without the new fields: likely -> alert, else clear', () => {
    expect(premoltCardState(pred({ is_premolt_likely: true }))).toBe('alert');
    expect(premoltCardState(pred())).toBe('clear');
  });
  it('paused is checked before insufficient data', () => {
    expect(premoltCardState(pred({ eligible: true, data_quality: 'insufficient', paused_for_premolt: true }))).toBe('paused');
  });
  it('closed is hidden even when matured', () => {
    expect(premoltCardState(pred({ eligible: false, ineligible_reason: 'closed', has_matured: true }))).toBe('hidden');
  });
});

describe('premoltAnswerable', () => {
  it('only an alert card can be answered', () => {
    expect(premoltAnswerable(pred({ eligible: true, is_premolt_likely: true, show_alert: true }))).toBe(true);
    expect(premoltAnswerable(pred({ eligible: true, is_premolt_likely: true, show_alert: false }))).toBe(false);
    expect(premoltAnswerable(pred({ eligible: true }))).toBe(false);
    expect(premoltAnswerable(null)).toBe(false);
  });
  it('never while paused for another reason (Yes would overwrite it)', () => {
    expect(premoltAnswerable(pred({ eligible: true, is_premolt_likely: true, show_alert: true, paused_other: true }))).toBe(false);
  });
  it('older responses without paused_other stay answerable', () => {
    expect(premoltAnswerable(pred({ is_premolt_likely: true }))).toBe(true);
  });
});

describe('alertCount', () => {
  it('counts show_alert, falling back to is_premolt_likely', () => {
    expect(
      alertCount([
        pred({ show_alert: true }),
        pred({ show_alert: false, is_premolt_likely: true }),
        pred({ is_premolt_likely: true }),
        pred(),
      ]),
    ).toBe(2);
    expect(alertCount([])).toBe(0);
  });
});

describe('copy', () => {
  it('is exact', () => {
    expect(PREMOLT_COPY).toEqual({
      headline: 'May be in premolt',
      yes: 'Yes, pause feeding',
      notYet: 'Not yet',
      snoozedToast: 'Hidden for 2 weeks',
      paused: 'Paused · premolt',
      clear: 'No premolt signs',
    });
  });
});

describe('answerPremolt', () => {
  beforeEach(() => mockPost.mockReset());
  it('posts the answer and returns the fresh prediction', async () => {
    mockPost.mockResolvedValue({ data: pred({ paused_for_premolt: true }) });
    const out = await answerPremolt('inv1', 'yes');
    expect(mockPost).toHaveBeenCalledWith('/premolt/inverts/inv1/answer', { answer: 'yes' });
    expect(out.paused_for_premolt).toBe(true);
  });
  it('throws an Error carrying the API detail', async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: "Premolt answers aren't available for this animal." } } });
    await expect(answerPremolt('inv1', 'not_yet')).rejects.toThrow("Premolt answers aren't available for this animal.");
  });
});
