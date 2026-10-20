/**
 * Photo timeline grouping. The same rules ship in four copies (TV web/mobile,
 * HV web/mobile — see the header of src/lib/photo-timeline.ts); this pins them.
 * Dates without a "Z" are local, so the tests hold in any timezone.
 */
import {
  calendarDaysBetween,
  daysAfterLabel,
  groupPhotosByMolt,
  markerFraction,
  markerLabel,
  periodLabel,
  photoDate,
} from '../photo-timeline';

const photo = (id: string, created_at: string, taken_at: string | null = null) => ({ id, created_at, taken_at });

describe('photoDate', () => {
  it('prefers taken_at, falls back to created_at', () => {
    expect(photoDate(photo('a', '2026-06-10T09:00:00', '2026-01-02T09:00:00'))).toEqual({ date: '2026-01-02T09:00:00', source: 'taken_at' });
    expect(photoDate(photo('a', '2026-06-10T09:00:00'))).toEqual({ date: '2026-06-10T09:00:00', source: 'created_at' });
    expect(photoDate({ id: 'a', taken_at: 'garbage', created_at: '2026-06-10' })).toEqual({ date: '2026-06-10', source: 'created_at' });
    expect(photoDate({ id: 'a' })).toBeNull();
  });
});

describe('groupPhotosByMolt', () => {
  const molts = [
    // Out of order on purpose (the API sends newest first).
    { id: 'm2', at: '2026-06-10T08:00:00' },
    { id: 'm1', at: '2026-03-01T08:00:00' },
  ];

  it('sorts photos by date and numbers molts in date order', () => {
    const t = groupPhotosByMolt(
      [photo('late', '2026-06-12T10:00:00'), photo('early', '2026-02-01T10:00:00'), photo('mid', '2026-04-01T10:00:00')],
      molts,
    );
    expect(t.moltCount).toBe(2);
    expect(t.entries.map((e) => e.photo.id)).toEqual(['early', 'mid', 'late']);
    expect(t.entries.map((e) => e.moltNumber)).toEqual([0, 1, 2]);
    expect(t.entries[0].moltId).toBeNull();
    expect(t.entries[0].daysAfterMolt).toBeNull();
    expect(t.entries[2].moltId).toBe('m2');
    expect(t.entries[2].daysAfterMolt).toBe(2);
  });

  it('orders by taken_at when present', () => {
    const t = groupPhotosByMolt(
      [photo('uploadedLate', '2026-06-20T10:00:00', '2026-02-01T10:00:00'), photo('b', '2026-04-01T10:00:00')],
      molts,
    );
    expect(t.entries.map((e) => e.photo.id)).toEqual(['uploadedLate', 'b']);
    expect(t.entries[0].dateSource).toBe('taken_at');
    expect(t.entries[0].moltNumber).toBe(0);
  });

  it('puts a photo on the molt day after that molt, even earlier in the day', () => {
    const t = groupPhotosByMolt([photo('p', '2026-06-10T06:00:00')], molts);
    expect(t.entries[0].moltNumber).toBe(2);
    expect(t.entries[0].daysAfterMolt).toBe(0);
  });

  it('places markers between photos and merges molts with no photos between them', () => {
    const t = groupPhotosByMolt(
      [photo('a', '2026-01-01'), photo('b', '2026-07-01'), photo('c', '2026-08-01')],
      [...molts, { id: 'm3', at: '2026-09-01' }],
    );
    expect(t.markers).toEqual([
      { beforeIndex: 1, molts: [{ id: 'm1', number: 1, at: '2026-03-01T08:00:00' }, { id: 'm2', number: 2, at: '2026-06-10T08:00:00' }] },
      { beforeIndex: 3, molts: [{ id: 'm3', number: 3, at: '2026-09-01' }] },
    ]);
    expect(t.entries.map((e) => e.moltNumber)).toEqual([0, 2, 2]);
  });

  it('handles no molts and no photos', () => {
    const t = groupPhotosByMolt([photo('a', '2026-01-01'), photo('b', '2026-02-01')], []);
    expect(t.moltCount).toBe(0);
    expect(t.markers).toEqual([]);
    expect(t.entries.every((e) => e.moltNumber === 0)).toBe(true);
    expect(groupPhotosByMolt([], molts).entries).toEqual([]);
  });

  it('drops photos with no usable date and molts with no usable date', () => {
    const t = groupPhotosByMolt([{ id: 'x' }, photo('a', '2026-07-01')], [{ id: 'bad', at: 'nope' }, ...molts]);
    expect(t.entries.map((e) => e.photo.id)).toEqual(['a']);
    expect(t.moltCount).toBe(2);
  });
});

describe('labels', () => {
  it('words periods, days and markers', () => {
    expect(periodLabel(0, 2, 'molt')).toBe('Before first molt');
    expect(periodLabel(3, 3, 'shed')).toBe('After shed 3');
    expect(periodLabel(0, 0, 'molt')).toBeNull();
    expect(daysAfterLabel(null, 'molt')).toBeNull();
    expect(daysAfterLabel(0, 'molt')).toBe('molt day');
    expect(daysAfterLabel(1, 'shed')).toBe('1 day after shed');
    expect(daysAfterLabel(12, 'molt')).toBe('12 days after molt');
    expect(markerLabel({ beforeIndex: 1, molts: [{ id: 'a', number: 2, at: '' }] }, 'molt')).toBe('Molt 2');
    expect(markerLabel({ beforeIndex: 1, molts: [{ id: 'a', number: 2, at: '' }, { id: 'b', number: 3, at: '' }] }, 'shed')).toBe('Sheds 2–3');
  });

  it('places markers on the track', () => {
    expect(markerFraction(0, 5)).toBe(0);
    expect(markerFraction(5, 5)).toBe(1);
    expect(markerFraction(1, 5)).toBeCloseTo(0.125);
    expect(markerFraction(1, 1)).toBe(0);
  });

  it('counts calendar days', () => {
    expect(calendarDaysBetween('2026-03-07', '2026-03-09T23:59:00')).toBe(2);
    expect(calendarDaysBetween('2026-03-07', 'nope')).toBeNull();
  });
});
