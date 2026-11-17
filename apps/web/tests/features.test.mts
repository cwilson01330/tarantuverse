// Unit tests for the feature-switch helpers (forums pause, Task 3).
// Run: node --test --experimental-strip-types tests/features.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FEATURES,
  FEATURES_STORAGE_KEY,
  FORUMS_PAUSED_BODY,
  FORUMS_PAUSED_TITLE,
  OUTSIDE_COMMUNITIES,
  featuresFromStatus,
  featuresReady,
  pickFeatures,
} from '../src/lib/features.ts'

test('featuresFromStatus reads the forums switch', () => {
  assert.deepEqual(featuresFromStatus({ features: { forums_enabled: false } }), { forumsEnabled: false })
  assert.deepEqual(featuresFromStatus({ features: { forums_enabled: true, other: 1 } }), { forumsEnabled: true })
})

test('featuresFromStatus returns null for a wrong shape', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { features: null }, { features: {} }, { features: { forums_enabled: 'true' } }]) {
    assert.equal(featuresFromStatus(bad), null)
  }
})

test('pickFeatures: fetched, then saved, then default OFF', () => {
  assert.deepEqual(pickFeatures(null, null), { forumsEnabled: false })
  assert.deepEqual(pickFeatures(null, { forumsEnabled: true }), { forumsEnabled: true })
  assert.deepEqual(pickFeatures({ forumsEnabled: false }, { forumsEnabled: true }), { forumsEnabled: false })
  assert.deepEqual(pickFeatures({ forumsEnabled: true }, null), { forumsEnabled: true })
})

test('constants', () => {
  assert.deepEqual(DEFAULT_FEATURES, { forumsEnabled: false })
  assert.equal(FEATURES_STORAGE_KEY, 'features_v1')
  assert.equal(FORUMS_PAUSED_TITLE, 'Forums are paused')
  assert.equal(
    FORUMS_PAUSED_BODY,
    "The forums were quiet, so we've put them away for now. Nothing has been deleted. To talk with other keepers, try these communities:",
  )
  assert.deepEqual(OUTSIDE_COMMUNITIES, [
    { label: 'r/tarantulas', url: 'https://www.reddit.com/r/tarantulas/' },
    { label: 'r/jumpingspiders', url: 'https://www.reddit.com/r/jumpingspiders/' },
    { label: 'Arachnoboards', url: 'https://arachnoboards.com/' },
  ])
})

test('featuresReady: known from cache, saved, or a settled fetch', () => {
  assert.equal(featuresReady({ cached: false, saved: null, settled: false }), false)
  assert.equal(featuresReady({ cached: true, saved: null, settled: false }), true)
  assert.equal(featuresReady({ cached: false, saved: { forumsEnabled: true }, settled: false }), true)
  assert.equal(featuresReady({ cached: false, saved: null, settled: true }), true)
})
