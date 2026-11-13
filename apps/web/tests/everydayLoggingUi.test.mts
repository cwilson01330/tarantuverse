import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampQuantity,
  isPromptableMolt,
  maturedAtFromMolts,
  quantityForSave,
  quantityFromQuery,
  readMoltPhotoDismissed,
  stepQuantity,
  writeMoltPhotoDismissed,
} from '../src/lib/everydayLoggingUi.ts'

test('clampQuantity keeps 1..20 and defaults to 1', () => {
  assert.equal(clampQuantity(0), 1)
  assert.equal(clampQuantity(25), 20)
  assert.equal(clampQuantity('7'), 7)
  assert.equal(clampQuantity('x'), 1)
  assert.equal(clampQuantity(null), 1)
  assert.equal(clampQuantity(3.6), 4)
})

test('maturedAtFromMolts takes the newest ultimate molt as a local date', () => {
  assert.equal(maturedAtFromMolts([]), null)
  assert.equal(maturedAtFromMolts([{ molted_at: '2026-01-01T12:00:00', is_ultimate: false }]), null)
  assert.equal(
    maturedAtFromMolts([
      { molted_at: '2026-03-05T12:00:00', is_ultimate: true },
      { molted_at: '2026-05-09T12:00:00', is_ultimate: true },
      { molted_at: '2026-06-01T12:00:00' },
    ]),
    '2026-05-09',
  )
})

test('dismissal storage: errors mean keep asking, writes never throw', () => {
  const mem = new Map<string, string>()
  const ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
  assert.equal(readMoltPhotoDismissed(ok, 'k'), false)
  writeMoltPhotoDismissed(ok, 'k')
  assert.equal(readMoltPhotoDismissed(ok, 'k'), true)
  const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
  assert.equal(readMoltPhotoDismissed(bad, 'k'), false)
  assert.doesNotThrow(() => writeMoltPhotoDismissed(bad, 'k'))
  assert.equal(readMoltPhotoDismissed(null, 'k'), false)
})

test('isPromptableMolt: new, non-fatal only', () => {
  assert.equal(isPromptableMolt(false, ''), true)
  assert.equal(isPromptableMolt(false, 'stuck'), true)
  assert.equal(isPromptableMolt(false, 'fatal'), false)
  assert.equal(isPromptableMolt(true, ''), false)
})

test('quantityFromQuery: a readable count, else null (unknown, never a default)', () => {
  assert.equal(quantityFromQuery('3'), 3)
  assert.equal(quantityFromQuery('25'), 20)
  assert.equal(quantityFromQuery(''), null)
  assert.equal(quantityFromQuery('   '), null)
  assert.equal(quantityFromQuery(null), null)
  assert.equal(quantityFromQuery(undefined), null)
  assert.equal(quantityFromQuery('many'), null)
})

test('stepQuantity: touching the stepper makes the count known (and clamps)', () => {
  assert.deepEqual(stepQuantity(1, 1), { quantity: 2, known: true })
  assert.deepEqual(stepQuantity(1, -1), { quantity: 1, known: true })
  assert.deepEqual(stepQuantity(20, 1), { quantity: 20, known: true })
})

test('quantityForSave: unknown + untouched leaves the stored count alone', () => {
  assert.equal(quantityForSave(true, false, 1), undefined)
  assert.equal(quantityForSave(false, true, 3), undefined)
  assert.equal(quantityForSave(true, true, 3), 3)
  // Failed log load, then a stepper tap: saved.
  const next = stepQuantity(1, 1)
  assert.equal(quantityForSave(true, next.known, next.quantity), 2)
})
