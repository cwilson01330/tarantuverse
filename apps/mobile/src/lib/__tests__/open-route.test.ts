import { openRoute } from '../open-route';

function fake(canDismiss: boolean) {
  return {
    canDismiss: jest.fn(() => canDismiss),
    dismissTo: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
  };
}

describe('openRoute', () => {
  it('dismisses down to the tabs when the caller sits above them', () => {
    const r = fake(true);
    openRoute(r, '/(tabs)/feeding');
    expect(r.dismissTo).toHaveBeenCalledWith('/(tabs)/feeding');
    expect(r.navigate).not.toHaveBeenCalled();
    expect(r.push).not.toHaveBeenCalled();
  });
  it('navigates when already inside the tabs', () => {
    const r = fake(false);
    openRoute(r, '/(tabs)/feeding');
    expect(r.navigate).toHaveBeenCalledWith('/(tabs)/feeding');
    expect(r.dismissTo).not.toHaveBeenCalled();
  });
  it('pushes every other route', () => {
    const r = fake(true);
    openRoute(r, '/invert/abc');
    expect(r.push).toHaveBeenCalledWith('/invert/abc');
    expect(r.dismissTo).not.toHaveBeenCalled();
    expect(r.navigate).not.toHaveBeenCalled();
  });
});
