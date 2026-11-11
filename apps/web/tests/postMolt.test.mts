// Unit tests for the post-molt pause helpers (web copy of mobile post-molt.ts).
// Dates are plain local 'YYYY-MM-DD' strings, so these hold in any timezone.
// Run: node --test --experimental-strip-types tests/*.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectivePauseDays,
  isPauseActive,
  moltFormLine,
  pauseDaysFor,
  pauseLabel,
  pauseUntil,
} from '../src/lib/postMolt.ts'

test('isPauseActive: today or later is active, a finished window is not', () => {
  assert.equal(isPauseActive('2026-11-24', '2026-11-10'), true)
  assert.equal(isPauseActive('2026-11-10', '2026-11-10'), true)
  assert.equal(isPauseActive('2026-10-20', '2026-11-10'), false)
  assert.equal(isPauseActive(null, '2026-11-10'), false)
  assert.equal(isPauseActive('nope', '2026-11-10'), false)
  assert.equal(isPauseActive('2026-11-24', 'nope'), false)
})

test('pauseUntil adds the window to the molt day', () => {
  assert.equal(pauseUntil('2026-11-10', 14), '2026-11-24')
})

test('pauseUntil crosses month and year ends', () => {
  assert.equal(pauseUntil('2026-12-28', 7), '2027-01-04')
  assert.equal(pauseUntil('2028-02-25', 7), '2028-03-03')
})

test('pauseUntil is null with no window or a bad date', () => {
  assert.equal(pauseUntil('2026-11-10', null), null)
  assert.equal(pauseUntil('2026-11-10', 0), null)
  assert.equal(pauseUntil('nope', 7), null)
})

test('pauseLabel formats Mon D without drift', () => {
  assert.equal(pauseLabel('2026-11-24'), 'Paused after molt · until Nov 24')
  assert.equal(pauseLabel('2027-01-01'), 'Paused after molt · until Jan 1')
})

test('pauseLabel is null for no pause', () => {
  assert.equal(pauseLabel(null), null)
  assert.equal(pauseLabel(undefined), null)
  assert.equal(pauseLabel('garbage'), null)
})

test('moltFormLine uses the exact copy', () => {
  assert.equal(
    moltFormLine('2026-11-24'),
    'Feeding reminders pause until Nov 24 — check the fangs are fully black before offering food.',
  )
})

test('effectivePauseDays: override wins, 0 means no pause', () => {
  assert.equal(effectivePauseDays(14, 0), null)
  assert.equal(effectivePauseDays(14, 21), 21)
})

test('effectivePauseDays: null or undefined override keeps the default', () => {
  assert.equal(effectivePauseDays(14, null), 14)
  assert.equal(effectivePauseDays(14, undefined), 14)
})

test('effectivePauseDays: no default and no override means no pause', () => {
  assert.equal(effectivePauseDays(null, null), null)
  assert.equal(effectivePauseDays(null, 5), 5)
  assert.equal(effectivePauseDays(0, null), null)
})

test('pauseDaysFor counts whole days from the molt day', () => {
  assert.equal(pauseDaysFor('2026-11-10', '2026-11-24'), 14)
  assert.equal(pauseDaysFor('2026-12-28', '2027-01-04'), 7)
})

test('pauseDaysFor: on or before the molt means no pause', () => {
  assert.equal(pauseDaysFor('2026-11-10', '2026-11-10'), 0)
  assert.equal(pauseDaysFor('2026-11-10', '2026-11-01'), 0)
})

test('pauseDaysFor is capped at the 60 days the server allows', () => {
  assert.equal(pauseDaysFor('2026-11-10', '2027-03-01'), 60)
})

test('pauseDaysFor is null for unparseable input', () => {
  assert.equal(pauseDaysFor('x', '2026-11-10'), null)
})
