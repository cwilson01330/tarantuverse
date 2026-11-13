import {
  buildHatchPayload,
  buildSacPayload,
  capDetailFromError,
  colonyBannerText,
  logSacLabel,
  parseWholeNumber,
  showEggSacsCard,
  splitCapMessage,
  splitToastText,
  buildSacEditPayload,
  resolveOffspringParent,
} from '../egg-sacs';

describe('parseWholeNumber', () => {
  it('accepts whole numbers in range only', () => {
    expect(parseWholeNumber('12', 1, 2000)).toBe(12);
    expect(parseWholeNumber(' 7 ', 1, 2000)).toBe(7);
    expect(parseWholeNumber('0', 1, 2000)).toBeNull();
    expect(parseWholeNumber('2001', 1, 2000)).toBeNull();
    expect(parseWholeNumber('1.5', 1, 2000)).toBeNull();
    expect(parseWholeNumber('', 1, 2000)).toBeNull();
    expect(parseWholeNumber('-3', 0, 10)).toBeNull();
  });
});

describe('buildHatchPayload', () => {
  it('builds the body', () => {
    expect(buildHatchPayload({ countText: '40', estimated: true, hatchedOn: '2026-11-01' })).toEqual({
      ok: true,
      payload: { count: 40, count_is_estimated: true, hatched_on: '2026-11-01' },
    });
  });
  it('refuses bad counts', () => {
    expect(buildHatchPayload({ countText: '', estimated: false, hatchedOn: '2026-11-01' }).ok).toBe(false);
    expect(buildHatchPayload({ countText: '2001', estimated: false, hatchedOn: '2026-11-01' }).ok).toBe(false);
  });
});

describe('buildSacPayload', () => {
  it('omits blanks and expected hatch for live birth', () => {
    expect(buildSacPayload({ laidDate: '2026-11-01', expectedHatch: '2026-12-01', countText: '', notes: ' ', liveBirth: false })).toEqual({
      ok: true,
      payload: { laid_date: '2026-11-01', expected_hatch_date: '2026-12-01' },
    });
    expect(buildSacPayload({ laidDate: '2026-11-01', expectedHatch: '2026-12-01', countText: '12', notes: 'n', liveBirth: true })).toEqual({
      ok: true,
      payload: { laid_date: '2026-11-01', spiderling_count: 12, notes: 'n' },
    });
  });
  it('rejects a bad count', () => {
    expect(buildSacPayload({ laidDate: '2026-11-01', expectedHatch: null, countText: 'x', notes: '', liveBirth: true }).ok).toBe(false);
  });
});

describe('capDetailFromError', () => {
  it('reads a 402 body, ignores others', () => {
    expect(capDetailFromError({ response: { status: 402, data: { detail: { can_add: 3 } } } })).toEqual({ can_add: 3 });
    expect(capDetailFromError({ response: { status: 402, data: { detail: 'x' } } })).toEqual({});
    expect(capDetailFromError({ response: { status: 409 } })).toBeNull();
  });
});

describe('card and wording', () => {
  it('shows the card to keepers on female/unknown eggSacs taxa', () => {
    expect(showEggSacsCard('true_spider', 'female', true)).toBe(true);
    expect(showEggSacsCard('true_spider', null, true)).toBe(true);
    expect(showEggSacsCard('true_spider', 'male', true)).toBe(false);
    expect(showEggSacsCard('true_spider', 'female', false)).toBe(false);
    expect(showEggSacsCard('roach', 'female', true)).toBe(false);
  });
  it('labels', () => {
    expect(logSacLabel('mantis')).toBe('Log ootheca');
    expect(logSacLabel('tarantula')).toBe('Log egg sac');
    expect(colonyBannerText('true_spider', 'Sally', 'Jun 3, 2026')).toBe("From Sally's egg sac · laid Jun 3, 2026");
    expect(colonyBannerText('mantis', null, 'Jun 3, 2026')).toBe('From an ootheca · laid Jun 3, 2026');
    expect(splitToastText(5, 'spiders')).toBe('5 spiders added');
  });
});

describe('splitCapMessage', () => {
  it('shows how many fit and nothing was added', () => {
    expect(splitCapMessage(3, true)).toBe('You can add 3 more on the free plan. Nothing was added.');
    expect(splitCapMessage(0, true)).toBe("You're at the free plan's limit. Nothing was added.");
  });
  it('points co-keepers at the owner', () => {
    expect(splitCapMessage(2, false)).toBe(
      'You can add 2 more on the free plan. Nothing was added. Ask the owner to upgrade to add more.',
    );
  });
});

describe('buildSacEditPayload', () => {
  it('clears emptied fields and keeps the date', () => {
    expect(buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: null, countText: '', notes: ' ', liveBirth: false })).toEqual({
      ok: true,
      payload: { laid_date: '2026-10-01', expected_hatch_date: null, notes: null },
    });
    expect(buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: '2026-11-01', countText: '', notes: '', liveBirth: true })).toEqual({
      ok: true,
      payload: { laid_date: '2026-10-01', spiderling_count: null, notes: null },
    });
    expect(buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: null, countText: '12', notes: 'x', liveBirth: true })).toEqual({
      ok: true,
      payload: { laid_date: '2026-10-01', spiderling_count: 12, notes: 'x' },
    });
  });
});

describe('resolveOffspringParent', () => {
  const fake = (rows: Record<string, unknown>) => {
    const seen: string[] = [];
    const get = async (path: string) => {
      seen.push(path);
      return path in rows ? rows[path] : null;
    };
    return { get, seen };
  };
  it('reads the mother first and never calls /pairings/null', async () => {
    const { get, seen } = fake({ '/inverts/m1': { taxon: 'true_spider', scientific_name: 'Phidippus regius', species_id: 's1' } });
    await expect(resolveOffspringParent({ mother_invert_id: 'm1', pairing_id: null }, get)).resolves.toEqual({
      taxon: 'true_spider',
      scientific_name: 'Phidippus regius',
      species_id: 's1',
    });
    expect(seen).toEqual(['/inverts/m1']);
  });
  it('is null (not tarantula) when nothing can be read', async () => {
    const { get, seen } = fake({});
    await expect(resolveOffspringParent({ mother_invert_id: 'gone', pairing_id: null }, get)).resolves.toBeNull();
    expect(seen.some((p) => p.includes('null'))).toBe(false);
  });
  it('falls back to the pairing male, then female', async () => {
    const { get } = fake({
      '/pairings/p1': { male_invert_id: 'ma', female_invert_id: 'fe' },
      '/inverts/fe': { taxon: 'mantis' },
    });
    await expect(resolveOffspringParent({ mother_invert_id: null, pairing_id: 'p1' }, get)).resolves.toEqual({
      taxon: 'mantis',
      scientific_name: null,
      species_id: null,
    });
  });
});
