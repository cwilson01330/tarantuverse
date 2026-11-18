// Unit tests for the HV web deeplink resolver.
// Run: node --test --experimental-strip-types tests/*.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDeeplink } from '../src/lib/deeplinks.ts'

const ID = '3f2b8c1e-1111-4222-8333-444455556666'

test('/reptile/<id> maps to the animal page under /app/reptiles', () => {
  assert.equal(resolveDeeplink(`/reptile/${ID}`), `/app/reptiles/${ID}`)
})

test('rejects a bare /reptile/, nested paths, query strings and traversal', () => {
  assert.equal(resolveDeeplink('/reptile/'), null)
  assert.equal(resolveDeeplink('/reptile'), null)
  assert.equal(resolveDeeplink('/reptile/abc/edit'), null)
  assert.equal(resolveDeeplink('/reptile/a?b=1'), null)
  assert.equal(resolveDeeplink('/reptile/../x'), null)
  assert.equal(resolveDeeplink('/reptile/a%2Fb'), null)
})

test('does not map Tarantuverse animal links', () => {
  assert.equal(resolveDeeplink(`/invert/${ID}`), null)
})

test('keeps existing mappings and the open-redirect guards', () => {
  assert.equal(resolveDeeplink('/feeding-day'), '/app/feeding-day')
  assert.equal(resolveDeeplink('/shared'), '/app/sharing')
  assert.equal(resolveDeeplink('https://evil.example'), null)
  assert.equal(resolveDeeplink('//evil'), null)
  assert.equal(resolveDeeplink(null), null)
})
