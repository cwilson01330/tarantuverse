import { resolveDeeplink } from '../deeplinks';

describe('resolveDeeplink', () => {
  it('serves /invert/<id> verbatim (per-animal feeding reminders)', () => {
    const id = '3f2b8c1e-1111-4222-8333-444455556666';
    expect(resolveDeeplink(`/invert/${id}`)).toBe(`/invert/${id}`);
  });
  it('rejects a bare /invert/ and nested paths', () => {
    expect(resolveDeeplink('/invert/')).toBeNull();
    expect(resolveDeeplink('/invert/abc/edit')).toBeNull();
  });
  it('keeps existing behaviour', () => {
    expect(resolveDeeplink('/feeding-day')).toBe('/feeding-day');
    expect(resolveDeeplink('/shared')).toBe('/sharing');
    expect(resolveDeeplink('https://evil.example')).toBeNull();
    expect(resolveDeeplink('//evil')).toBeNull();
    expect(resolveDeeplink(null)).toBeNull();
  });
});
