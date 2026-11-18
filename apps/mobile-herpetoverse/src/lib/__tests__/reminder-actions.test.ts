import { actionFromIdentifier, toastFor } from '../reminder-actions';

describe('actionFromIdentifier', () => {
  it('maps the three buttons', () => {
    expect(actionFromIdentifier('fed')).toBe('fed');
    expect(actionFromIdentifier('refused')).toBe('refused');
    expect(actionFromIdentifier('tomorrow')).toBe('tomorrow');
  });
  it('returns null for open_feeding_day and unknown ids', () => {
    expect(actionFromIdentifier('open_feeding_day')).toBeNull();
    expect(actionFromIdentifier('expo.modules.notifications.actions.DEFAULT')).toBeNull();
    expect(actionFromIdentifier('')).toBeNull();
  });
});

describe('toastFor', () => {
  it('uses the server message', () => {
    expect(toastFor({ message: 'Logged: Rosie ate' })).toBe('Logged: Rosie ate');
  });
  it('falls back to the error, then a generic line', () => {
    expect(toastFor(null, 'This animal has died.')).toBe('This animal has died.');
    expect(toastFor(null)).toMatch(/try again/i);
    expect(toastFor({ message: '' }, 'boom')).toBe('boom');
  });
});
