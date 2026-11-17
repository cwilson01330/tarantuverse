// Unit tests for the premolt card view lib (premolt v2, Task 5).
// Run: node --test --experimental-strip-types tests/premoltView.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREMOLT_COPY, alertCount, answerPremolt, premoltAnswerable, premoltCardState } from '../src/lib/premoltView.ts'
import type { PremoltPrediction } from '../src/lib/premoltView.ts'

function pred(over: Partial<PremoltPrediction> = {}): PremoltPrediction {
  return {
    tarantula_id: 'a',
    tarantula_name: 'Alpha',
    is_premolt_likely: false,
    confidence: 'low',
    recent_refusal_streak: 0,
    data_quality: 'good',
    has_matured: false,
    feeding_count: 5,
    molt_count: 2,
    ...over,
  } as PremoltPrediction
}

test('hidden for null, grazers and closed animals', () => {
  assert.equal(premoltCardState(null), 'hidden')
  assert.equal(premoltCardState(pred({ eligible: false, ineligible_reason: 'grazer' })), 'hidden')
  assert.equal(premoltCardState(pred({ eligible: false, ineligible_reason: 'closed' })), 'hidden')
})

test('matured by flag or reason', () => {
  assert.equal(premoltCardState(pred({ has_matured: true })), 'matured')
  assert.equal(premoltCardState(pred({ eligible: false, ineligible_reason: 'matured' })), 'matured')
})

test('insufficient, paused, snoozed, alert, clear', () => {
  assert.equal(premoltCardState(pred({ eligible: true, data_quality: 'insufficient' })), 'insufficient')
  assert.equal(premoltCardState(pred({ eligible: true, is_premolt_likely: true, paused_for_premolt: true, show_alert: false })), 'paused')
  assert.equal(premoltCardState(pred({ eligible: true, is_premolt_likely: true, show_alert: false })), 'snoozed')
  assert.equal(premoltCardState(pred({ eligible: true, is_premolt_likely: true, show_alert: true })), 'alert')
  assert.equal(premoltCardState(pred({ eligible: true })), 'clear')
})

test('old-style response without the new fields', () => {
  assert.equal(premoltCardState(pred({ is_premolt_likely: true })), 'alert')
  assert.equal(premoltCardState(pred()), 'clear')
})

test('paused is checked before insufficient data; closed beats matured', () => {
  assert.equal(premoltCardState(pred({ eligible: true, data_quality: 'insufficient', paused_for_premolt: true })), 'paused')
  assert.equal(premoltCardState(pred({ eligible: false, ineligible_reason: 'closed', has_matured: true })), 'hidden')
})

test('premoltAnswerable: alert only, never while paused for another reason', () => {
  assert.equal(premoltAnswerable(pred({ eligible: true, is_premolt_likely: true, show_alert: true })), true)
  assert.equal(premoltAnswerable(pred({ eligible: true, is_premolt_likely: true, show_alert: false })), false)
  assert.equal(premoltAnswerable(pred({ eligible: true })), false)
  assert.equal(premoltAnswerable(null), false)
  assert.equal(premoltAnswerable(pred({ eligible: true, is_premolt_likely: true, show_alert: true, paused_other: true })), false)
  assert.equal(premoltAnswerable(pred({ is_premolt_likely: true })), true)
})

test('alertCount', () => {
  assert.equal(
    alertCount([pred({ show_alert: true }), pred({ show_alert: false, is_premolt_likely: true }), pred({ is_premolt_likely: true }), pred()]),
    2,
  )
  assert.equal(alertCount([]), 0)
})

test('copy is exact', () => {
  assert.deepEqual(PREMOLT_COPY, {
    headline: 'May be in premolt',
    yes: 'Yes, pause feeding',
    notYet: 'Not yet',
    snoozedToast: 'Hidden for 2 weeks',
    paused: 'Paused · premolt',
    clear: 'No premolt signs',
  })
})

test('answerPremolt posts and throws the API detail', async () => {
  const realFetch = globalThis.fetch
  let seen: { url: string; init: any } | null = null
  globalThis.fetch = (async (url: string, init: any) => {
    seen = { url, init }
    return { ok: true, json: async () => pred({ paused_for_premolt: true }) }
  }) as any
  const out = await answerPremolt('tok', 'inv1', 'yes')
  assert.match(seen!.url, /\/api\/v1\/premolt\/inverts\/inv1\/answer$/)
  assert.equal(seen!.init.method, 'POST')
  assert.equal(seen!.init.headers.Authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(seen!.init.body), { answer: 'yes' })
  assert.equal(out.paused_for_premolt, true)

  globalThis.fetch = (async () => ({ ok: false, json: async () => ({ detail: 'Nope.' }) })) as any
  await assert.rejects(() => answerPremolt('tok', 'inv1', 'not_yet'), /Nope\./)
  globalThis.fetch = realFetch
})
