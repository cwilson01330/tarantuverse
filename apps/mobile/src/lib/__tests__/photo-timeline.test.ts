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
  PHOTO_DATE_MIN,
  localDateInput,
  photoDateError,
  takenAtFromLocalDate,
  toLocalDateInput,
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

describe('keeper-set photo dates', () => {
  const today = new Date(2026, 9, 20, 9, 0, 0); // Oct 20 2026, local

  it('reads a stored date back as a local day', () => {
    expect(localDateInput('2026-03-07T12:00:00')).toBe('2026-03-07');
    expect(localDateInput('2026-03-07')).toBe('2026-03-07');
    expect(localDateInput(null)).toBeNull();
    expect(localDateInput('nope')).toBeNull();
    expect(toLocalDateInput(new Date(2025, 0, 5))).toBe('2025-01-05');
  });

  it('sends local noon, so the chosen day survives a round trip', () => {
    const iso = takenAtFromLocalDate('2024-06-14');
    expect(iso).not.toBeNull();
    const back = new Date(iso as string);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours()]).toEqual([2024, 5, 14, 12]);
    expect(localDateInput(iso)).toBe('2024-06-14');
    expect(takenAtFromLocalDate(' 2024-06-14 ')).toBe(iso);
  });

  it('refuses days that do not exist', () => {
    expect(takenAtFromLocalDate('2026-02-31')).toBeNull();
    expect(takenAtFromLocalDate('2026-13-01')).toBeNull();
    expect(takenAtFromLocalDate('June 14')).toBeNull();
    expect(photoDateError('2026-02-31', today)).toMatch(/like/);
    expect(photoDateError('', today)).toMatch(/like/);
  });

  it('matches the API range: 1990 through today', () => {
    expect(photoDateError('1989-12-31', today)).toMatch(/1990/);
    expect(photoDateError(PHOTO_DATE_MIN, today)).toBeNull();
    expect(photoDateError('2026-10-20', today)).toBeNull();
    expect(photoDateError('2026-10-21', today)).toMatch(/future/);
  });

  it('a corrected date re-orders the timeline and moves the photo into the right molt period', () => {
    const molts = [{ id: 'm1', at: '2026-03-01T08:00:00' }];
    const uploaded = [photo('old', '2026-10-20T10:00:00'), photo('new', '2026-10-19T10:00:00')];
    const before = groupPhotosByMolt(uploaded, molts);
    expect(before.entries.map((e) => [e.photo.id, e.moltNumber])).toEqual([['new', 1], ['old', 1]]);
    const fixed = [{ ...uploaded[0], taken_at: takenAtFromLocalDate('2026-01-15') }, uploaded[1]];
    const after = groupPhotosByMolt(fixed, molts);
    expect(after.entries.map((e) => [e.photo.id, e.moltNumber])).toEqual([['old', 0], ['new', 1]]);
    expect(after.markers).toEqual([{ beforeIndex: 1, molts: [{ id: 'm1', number: 1, at: '2026-03-01T08:00:00' }] }]);
  });
});
