// Egg sac helpers + brood registry (web copy of the mobile suite).
// Run: node --test --experimental-strip-types tests/broods.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import { sacStatus, sacStatusLabel, splitCapText, splitMax, splitNoun } from '../src/lib/broods.ts'
import {
  TAXON_MODULES,
  breedingVocabulary,
  broodBucket,
  countsPrey,
  hatchButtonLabel,
  isLiveBirth,
} from '../src/lib/inverts.ts'

test('hatch labels and buckets', () => {
  assert.equal(hatchButtonLabel('mantis'), 'Hatched: start a nymph group')
  assert.equal(hatchButtonLabel('tarantula'), 'Hatched: start a sling group')
  assert.equal(hatchButtonLabel('true_spider'), 'Hatched: start a sling group')
  assert.equal(hatchButtonLabel('scorpion'), 'Start a scorpling group')
  assert.equal(broodBucket('true_spider'), 'slings')
  assert.equal(broodBucket('mantis'), 'nymphs')
  assert.equal(broodBucket('scorpion'), 'scorplings')
  assert.equal(broodBucket('roach'), 'young')
})

test('live birth, prey, module', () => {
  assert.equal(isLiveBirth('scorpion'), true)
  assert.equal(isLiveBirth('tarantula'), false)
  assert.equal(breedingVocabulary('scorpion').liveBirth?.offspring, 'scorplings')
  assert.equal(countsPrey('mantis'), true)
  assert.equal(countsPrey('tarantula'), false)
  assert.ok(TAXON_MODULES.true_spider.includes('eggSacs'))
  assert.ok(!TAXON_MODULES.roach.includes('eggSacs'))
})

test('sac status', () => {
  assert.equal(sacStatus({ outcome: null, hatched_colony: null }), 'waiting')
  assert.equal(sacStatus({ outcome: 'hatched', hatched_colony: { id: 'a', name: 'x' } }), 'hatched')
  assert.equal(sacStatus({ outcome: 'hatched', hatched_colony: null }), 'hatched_removed')
  assert.equal(sacStatus({ outcome: 'failed', hatched_colony: null }), 'failed')
  assert.equal(sacStatusLabel('waiting', true), 'Not grouped yet')
  assert.equal(sacStatusLabel('hatched', true), 'Grouped')
  assert.equal(sacStatusLabel('hatched_removed', false), 'Hatched (group removed)')
  assert.equal(sacStatusLabel('failed', false), "Didn't hatch")
})

test('split', () => {
  assert.equal(splitMax(73), 50)
  assert.equal(splitMax(-1), 0)
  assert.equal(splitNoun('mantis'), 'mantids')
  assert.equal(splitNoun('roach'), 'animals')
  assert.equal(splitCapText(4), 'You can add 4 more on the free plan')
  assert.equal(splitCapText(0), "You're at the free plan's limit")
})
