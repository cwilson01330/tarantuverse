// Egg sac helpers (web copy of the mobile suite).
// Run: node --test --experimental-strip-types tests/*.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHatchPayload,
  buildSacPayload,
  capDetailFromBody,
  colonyBannerText,
  hatchCapMessage,
  logSacLabel,
  parseWholeNumber,
  showEggSacsCard,
  splitCapMessage,
  splitToastText,
  buildSacEditPayload,
  resolveOffspringParent,
} from '../src/lib/eggSacs.ts'

test('parseWholeNumber', () => {
  assert.equal(parseWholeNumber(' 12 ', 1, 50), 12)
  assert.equal(parseWholeNumber('', 1, 50), null)
  assert.equal(parseWholeNumber('1.5', 1, 50), null)
  assert.equal(parseWholeNumber('0', 1, 50), null)
  assert.equal(parseWholeNumber('51', 1, 50), null)
})

test('buildHatchPayload', () => {
  assert.deepEqual(buildHatchPayload({ countText: '30', estimated: true, hatchedOn: '2026-06-01' }), {
    ok: true,
    payload: { count: 30, count_is_estimated: true, hatched_on: '2026-06-01' },
  })
  assert.equal(buildHatchPayload({ countText: '2001', estimated: false, hatchedOn: '2026-06-01' }).ok, false)
  assert.equal(buildHatchPayload({ countText: '5', estimated: false, hatchedOn: '' }).ok, false)
})

test('buildSacPayload omits blanks and respects live birth', () => {
  const r = buildSacPayload({ laidDate: '2026-06-01', expectedHatch: '2026-07-01', countText: '9', notes: ' ', liveBirth: false })
  assert.deepEqual(r, { ok: true, payload: { laid_date: '2026-06-01', expected_hatch_date: '2026-07-01' } })
  const live = buildSacPayload({ laidDate: '2026-06-01', expectedHatch: '2026-07-01', countText: '9', notes: 'x', liveBirth: true })
  assert.deepEqual(live, { ok: true, payload: { laid_date: '2026-06-01', spiderling_count: 9, notes: 'x' } })
  assert.equal(buildSacPayload({ laidDate: '2026-06-01', expectedHatch: null, countText: 'abc', notes: '', liveBirth: true }).ok, false)
  assert.equal(buildSacPayload({ laidDate: '', expectedHatch: null, countText: '', notes: '', liveBirth: false }).ok, false)
})

test('capDetailFromBody', () => {
  assert.deepEqual(capDetailFromBody({ detail: { can_add: 3, limit: 15 } }), { can_add: 3, limit: 15 })
  assert.deepEqual(capDetailFromBody({ detail: 'nope' }), {})
  assert.deepEqual(capDetailFromBody(null), {})
})

test('card visibility', () => {
  assert.equal(showEggSacsCard(true, 'female', true), true)
  assert.equal(showEggSacsCard(true, null, true), true)
  assert.equal(showEggSacsCard(true, 'male', true), false)
  assert.equal(showEggSacsCard(true, 'female', false), false)
  assert.equal(showEggSacsCard(false, 'female', true), false)
})

test('wording', () => {
  assert.equal(logSacLabel('Egg sac'), 'Log egg sac')
  assert.equal(colonyBannerText('Egg sac', 'Sally', 'Jun 3, 2026'), "From Sally's egg sac · laid Jun 3, 2026")
  assert.equal(colonyBannerText('Ootheca', null, 'Jun 3, 2026'), 'From an ootheca · laid Jun 3, 2026')
  assert.equal(colonyBannerText('Egg sac', null, 'x'), 'From an egg sac · laid x')
  assert.equal(splitToastText(5, 'spiders'), '5 spiders added')
  assert.equal(splitCapMessage('You can add 2 more on the free plan', true), 'You can add 2 more on the free plan. Nothing was added.')
  assert.equal(
    splitCapMessage("You're at the free plan's limit", false),
    "You're at the free plan's limit. Nothing was added. Ask the owner to upgrade to add more.",
  )
  assert.match(hatchCapMessage('You can add 0', false), /owner can upgrade/)
  assert.match(hatchCapMessage('You can add 4 more on the free plan', true), /Nothing was started/)
})

test('buildSacEditPayload clears emptied fields and keeps the date', () => {
  assert.deepEqual(
    buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: null, countText: '', notes: ' ', liveBirth: false }),
    { ok: true, payload: { laid_date: '2026-10-01', expected_hatch_date: null, notes: null } },
  )
  assert.deepEqual(
    buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: '2026-11-01', countText: '', notes: 'x', liveBirth: false }),
    { ok: true, payload: { laid_date: '2026-10-01', expected_hatch_date: '2026-11-01', notes: 'x' } },
  )
  // Live birth: the count, never an expected hatch date.
  assert.deepEqual(
    buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: '2026-11-01', countText: '', notes: '', liveBirth: true }),
    { ok: true, payload: { laid_date: '2026-10-01', spiderling_count: null, notes: null } },
  )
  assert.deepEqual(
    buildSacEditPayload({ laidDate: '2026-10-01', expectedHatch: null, countText: '12', notes: '', liveBirth: true }),
    { ok: true, payload: { laid_date: '2026-10-01', spiderling_count: 12, notes: null } },
  )
  assert.equal(buildSacEditPayload({ laidDate: '', expectedHatch: null, countText: '', notes: '', liveBirth: false }).ok, false)
})

function fakeGet(rows: Record<string, unknown>) {
  const seen: string[] = []
  const get = async (path: string) => {
    seen.push(path)
    return path in rows ? rows[path] : null
  }
  return { get, seen }
}

test('resolveOffspringParent: mother first, no pairing call', async () => {
  const { get, seen } = fakeGet({ '/inverts/m1': { taxon: 'true_spider', scientific_name: 'Phidippus regius', species_id: 's1' } })
  assert.deepEqual(await resolveOffspringParent({ mother_invert_id: 'm1', pairing_id: null }, get), {
    taxon: 'true_spider', scientific_name: 'Phidippus regius', species_id: 's1',
  })
  assert.deepEqual(seen, ['/inverts/m1'])
})

test('resolveOffspringParent: pairless sac with an unreadable mother is null (never tarantula)', async () => {
  const { get, seen } = fakeGet({})
  assert.equal(await resolveOffspringParent({ mother_invert_id: 'gone', pairing_id: null }, get), null)
  assert.ok(!seen.some((p) => p.includes('null')))
})

test('resolveOffspringParent: falls back to the pairing male, then female', async () => {
  const { get } = fakeGet({
    '/pairings/p1': { male_invert_id: 'ma', female_invert_id: 'fe', male_id: null, female_id: null },
    '/inverts/fe': { taxon: 'mantis', scientific_name: null, species_id: null },
  })
  assert.deepEqual(await resolveOffspringParent({ mother_invert_id: null, pairing_id: 'p1' }, get), {
    taxon: 'mantis', scientific_name: null, species_id: null,
  })
  assert.equal(await resolveOffspringParent({ mother_invert_id: null, pairing_id: 'nope' }, fakeGet({}).get), null)
})
