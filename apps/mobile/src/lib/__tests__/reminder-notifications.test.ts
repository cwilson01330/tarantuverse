import { handleNotificationResponse } from '../../services/reminder-notifications';

const ID = '3f2b8c1e-1111-4222-8333-444455556666';
const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';

function resp(actionIdentifier: string, data: Record<string, unknown> = {}) {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: 'req-1',
        content: {
          data: {
            type: 'feeding_due',
            deeplink: `/invert/${ID}`,
            invert_id: ID,
            reminder_date: '2026-11-10',
            ...data,
          },
        },
      },
    },
  };
}

function deps(over: Partial<Record<string, any>> = {}) {
  return {
    post: jest.fn().mockResolvedValue({ action: 'fed', created: true, animal_name: 'Rosie', message: 'Logged: Rosie ate' }),
    navigate: jest.fn(),
    showToast: jest.fn(),
    isSignedIn: jest.fn().mockReturnValue(true),
    dismiss: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('handleNotificationResponse', () => {
  it('fed posts the action with the reminder date and toasts the server message', async () => {
    const d = deps();
    await handleNotificationResponse(resp('fed') as any, d);
    expect(d.post).toHaveBeenCalledWith(ID, { action: 'fed', reminder_date: '2026-11-10' });
    expect(d.showToast).toHaveBeenCalledWith('Logged: Rosie ate');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('signed out never posts, and opens the animal instead of doing nothing', async () => {
    const d = deps({ isSignedIn: jest.fn().mockReturnValue(false) });
    await handleNotificationResponse(resp('refused') as any, d);
    expect(d.post).not.toHaveBeenCalled();
    expect(d.showToast).not.toHaveBeenCalled();
    expect(d.navigate).toHaveBeenCalledWith(`/invert/${ID}`);
  });

  it('signed out with no usable deeplink does nothing', async () => {
    const d = deps({ isSignedIn: jest.fn().mockReturnValue(false) });
    await handleNotificationResponse(resp('fed', { deeplink: 'https://evil.example/x' }) as any, d);
    expect(d.post).not.toHaveBeenCalled();
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('a 409 toasts the server detail', async () => {
    const d = deps({
      post: jest.fn().mockRejectedValue({ response: { status: 409, data: { detail: 'Rosie has died.' } } }),
    });
    await handleNotificationResponse(resp('tomorrow') as any, d);
    expect(d.showToast).toHaveBeenCalledWith('Rosie has died.');
  });

  it('a network failure toasts a generic line', async () => {
    const d = deps({ post: jest.fn().mockRejectedValue(new Error('network')) });
    await handleNotificationResponse(resp('fed') as any, d);
    expect(d.showToast).toHaveBeenCalledTimes(1);
  });

  it('open_feeding_day navigates to /feeding-day', async () => {
    const d = deps();
    await handleNotificationResponse(resp('open_feeding_day', { type: 'feeding_digest', deeplink: '/feeding-day' }) as any, d);
    expect(d.navigate).toHaveBeenCalledWith('/feeding-day');
    expect(d.post).not.toHaveBeenCalled();
  });

  it('a body tap navigates to the animal', async () => {
    const d = deps();
    await handleNotificationResponse(resp(DEFAULT) as any, d);
    expect(d.navigate).toHaveBeenCalledWith(`/invert/${ID}`);
    expect(d.post).not.toHaveBeenCalled();
  });

  it('a body tap with an unknown deeplink does nothing', async () => {
    const d = deps();
    await handleNotificationResponse(resp(DEFAULT, { deeplink: 'https://x.y' }) as any, d);
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('a handled button tap dismisses the notification (success and failure)', async () => {
    const ok = deps({ dismiss: jest.fn().mockResolvedValue(undefined) });
    await handleNotificationResponse(resp('fed') as any, ok);
    expect(ok.dismiss).toHaveBeenCalledWith('req-1');

    const bad = deps({
      post: jest.fn().mockRejectedValue(new Error('network')),
      dismiss: jest.fn().mockResolvedValue(undefined),
    });
    await handleNotificationResponse(resp('tomorrow') as any, bad);
    expect(bad.dismiss).toHaveBeenCalledWith('req-1');
  });

  it('a throwing dismiss never propagates', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deps({ dismiss: jest.fn().mockRejectedValue(new Error('native boom')) });
    await expect(handleNotificationResponse(resp('fed') as any, d)).resolves.toBeUndefined();
    expect(d.showToast).toHaveBeenCalledWith('Logged: Rosie ate');
    warn.mockRestore();
  });

  it('a body tap does not call dismiss (the OS clears it)', async () => {
    const d = deps({ dismiss: jest.fn() });
    await handleNotificationResponse(resp(DEFAULT) as any, d);
    expect(d.dismiss).not.toHaveBeenCalled();
  });

  it('a button without an invert id never posts', async () => {
    const d = deps();
    await handleNotificationResponse(resp('fed', { invert_id: undefined }) as any, d);
    expect(d.post).not.toHaveBeenCalled();
  });
});


describe('registerReminderCategories', () => {
  afterEach(() => {
    jest.dontMock('expo-notifications');
    jest.resetModules();
  });

  it('registers both button sets with the button ids', async () => {
    const setNotificationCategoryAsync = jest.fn().mockResolvedValue(undefined);
    jest.resetModules();
    jest.doMock('expo-notifications', () => ({ setNotificationCategoryAsync }), { virtual: true });
    const { registerReminderCategories: register } = require('../../services/reminder-notifications');
    await register();
    expect(setNotificationCategoryAsync).toHaveBeenCalledTimes(2);
    const [dueId, dueButtons] = setNotificationCategoryAsync.mock.calls[0];
    expect(dueId).toBe('feeding_due');
    expect(dueButtons.map((b: any) => b.identifier)).toEqual(['fed', 'refused', 'tomorrow']);
    const [summaryId, summaryButtons] = setNotificationCategoryAsync.mock.calls[1];
    expect(summaryId).toBe('feeding_summary');
    expect(summaryButtons.map((b: any) => b.identifier)).toEqual(['open_feeding_day']);
  });

  it('a throwing native call does not propagate', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.resetModules();
    jest.doMock(
      'expo-notifications',
      () => ({ setNotificationCategoryAsync: jest.fn().mockRejectedValue(new Error('native boom')) }),
      { virtual: true },
    );
    const { registerReminderCategories: register } = require('../../services/reminder-notifications');
    await expect(register()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
