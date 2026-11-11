// Notification deeplink resolver (web). Run: node --test --experimental-strip-types tests/*.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDeeplink } from '../src/lib/deeplinks.ts'

const ID = '3f2b8c1e-5d4a-4e7b-9a10-0c1d2e3f4a5b'

test('per-animal reminder link opens the web animal page', () => {
  assert.equal(resolveDeeplink(`/invert/${ID}`), `/dashboard/inverts/${ID}`)
})

test('nested, bare and odd invert forms are rejected', () => {
  assert.equal(resolveDeeplink('/invert'), null)
  assert.equal(resolveDeeplink('/invert/'), null)
  assert.equal(resolveDeeplink(`/invert/${ID}/edit`), null)
  assert.equal(resolveDeeplink(`/invert/${ID}/`), null)
  assert.equal(resolveDeeplink('/invert/not a uuid'), null)
  assert.equal(resolveDeeplink('/invert/../admin'), null)
  assert.equal(resolveDeeplink(`//invert/${ID}`), null)
})

test('existing routes still resolve', () => {
  assert.equal(resolveDeeplink('/feeding-day'), '/dashboard/feeding-day')
  assert.equal(resolveDeeplink('/shared'), '/dashboard/sharing')
  assert.equal(resolveDeeplink(`/forums/thread/${ID}`), `/community/forums/thread/${ID}`)
  assert.equal(resolveDeeplink('/messages/gerald'), '/messages/gerald')
  assert.equal(resolveDeeplink(null), null)
  assert.equal(resolveDeeplink('https://evil.example'), null)
})
