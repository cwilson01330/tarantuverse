/**
 * When to ask for notification permission (Day-one). Pure decisions only.
 */
import {
  ASK_STORAGE_KEY,
  parseAskState,
  shouldAskAfterSave,
  shouldAskWhenDue,
} from '../notification-ask';

const fresh = { afterSaveShown: false, dueShown: false };

describe('ASK_STORAGE_KEY', () => {
  it('is versioned', () => {
    expect(ASK_STORAGE_KEY).toBe('notification_ask_v1');
  });
});

describe('shouldAskAfterSave', () => {
  it('asks once when undetermined and never asked', () => {
    expect(shouldAskAfterSave(fresh, 'undetermined')).toBe(true);
  });
  it('does not ask again after it was shown', () => {
    expect(shouldAskAfterSave({ afterSaveShown: true, dueShown: false }, 'undetermined')).toBe(false);
  });
  it('is independent of the due ask', () => {
    expect(shouldAskAfterSave({ afterSaveShown: false, dueShown: true }, 'undetermined')).toBe(true);
  });
  it('never asks once granted or denied', () => {
    expect(shouldAskAfterSave(fresh, 'granted')).toBe(false);
    expect(shouldAskAfterSave(fresh, 'denied')).toBe(false);
  });
});

describe('shouldAskWhenDue', () => {
  it('asks when undetermined, something is due and not asked before', () => {
    expect(shouldAskWhenDue(fresh, 'undetermined', true)).toBe(true);
  });
  it('still asks after the after-save ask was shown', () => {
    expect(shouldAskWhenDue({ afterSaveShown: true, dueShown: false }, 'undetermined', true)).toBe(true);
  });
  it('does not ask when nothing is due', () => {
    expect(shouldAskWhenDue(fresh, 'undetermined', false)).toBe(false);
  });
  it('does not ask twice', () => {
    expect(shouldAskWhenDue({ afterSaveShown: false, dueShown: true }, 'undetermined', true)).toBe(false);
    expect(shouldAskWhenDue({ afterSaveShown: true, dueShown: true }, 'undetermined', true)).toBe(false);
  });
  it('never asks once granted or denied', () => {
    expect(shouldAskWhenDue(fresh, 'granted', true)).toBe(false);
    expect(shouldAskWhenDue(fresh, 'denied', true)).toBe(false);
  });
});

describe('parseAskState', () => {
  it('reads a saved state', () => {
    expect(parseAskState('{"afterSaveShown":true,"dueShown":false}')).toEqual({ afterSaveShown: true, dueShown: false });
    expect(parseAskState('{"afterSaveShown":true,"dueShown":true}')).toEqual({ afterSaveShown: true, dueShown: true });
  });
  it('null, empty and junk give both false', () => {
    expect(parseAskState(null)).toEqual(fresh);
    expect(parseAskState('')).toEqual(fresh);
    expect(parseAskState('junk')).toEqual(fresh);
    expect(parseAskState('null')).toEqual(fresh);
    expect(parseAskState('42')).toEqual(fresh);
    expect(parseAskState('[1,2]')).toEqual(fresh);
  });
  it('partial JSON: missing keys are false', () => {
    expect(parseAskState('{"dueShown":true}')).toEqual({ afterSaveShown: false, dueShown: true });
    expect(parseAskState('{}')).toEqual(fresh);
  });
  it('only a real true counts', () => {
    expect(parseAskState('{"afterSaveShown":"yes","dueShown":1}')).toEqual(fresh);
  });
});
