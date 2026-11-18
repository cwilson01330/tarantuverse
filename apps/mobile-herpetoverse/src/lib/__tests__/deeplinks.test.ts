import { resolveDeeplink } from '../deeplinks';

describe('resolveDeeplink (Herpetoverse mobile)', () => {
  it('serves /reptile/<id> verbatim (per-animal feeding reminders)', () => {
    const id = '3f2b8c1e-1111-4222-8333-444455556666';
    expect(resolveDeeplink(`/reptile/${id}`)).toBe(`/reptile/${id}`);
  });
  it('rejects a bare /reptile/, nested paths and odd ids', () => {
    expect(resolveDeeplink('/reptile/')).toBeNull();
    expect(resolveDeeplink('/reptile/abc/edit')).toBeNull();
    expect(resolveDeeplink('/reptile/../x')).toBeNull();
    expect(resolveDeeplink('/reptile/a?b=1')).toBeNull();
  });
  it('does not serve Tarantuverse routes', () => {
    expect(resolveDeeplink('/invert/abc')).toBeNull();
  });
  it('keeps existing behaviour', () => {
    expect(resolveDeeplink('/feeding-day')).toBe('/feeding-day');
    expect(resolveDeeplink('/shared')).toBe('/sharing');
    expect(resolveDeeplink('https://evil.example')).toBeNull();
    expect(resolveDeeplink('//evil')).toBeNull();
    expect(resolveDeeplink(null)).toBeNull();
  });
});
