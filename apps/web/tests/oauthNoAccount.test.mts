// Unit tests for the no-account hand-off helpers (sign-in fixes, Task 3).
// Run: pnpm --filter web test:auth   (node --test with type stripping; Node 22.6+)
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decodePending,
  encodePending,
  isOAuthProvider,
  noAccountFromDetail,
} from '../src/lib/oauthNoAccount.ts'

test('the pending cookie round-trips an email, including non-ASCII and plus signs', () => {
  for (const email of ['keeper@example.com', 'a+tag@example.com', 'josé@exämple.org']) {
    const raw = encodePending({ email, provider: 'google' })
    assert.match(raw, /^[A-Za-z0-9_-]+$/, 'cookie-safe characters only')
    assert.deepEqual(decodePending(raw), { email, provider: 'google' })
  }
})

test('decodePending rejects anything it did not write', () => {
  assert.equal(decodePending(null), null)
  assert.equal(decodePending(''), null)
  assert.equal(decodePending('%%%'), null)
  assert.equal(decodePending(Buffer.from('{"email":"x"}').toString('base64url')), null) // no provider
  assert.equal(
    decodePending(Buffer.from('{"email":"x@y.z","provider":"github"}').toString('base64url')),
    null,
  )
  assert.equal(
    decodePending(Buffer.from(JSON.stringify({ email: 'a'.repeat(300), provider: 'apple' })).toString('base64url')),
    null,
  )
})

test('only the oauth_no_account OBJECT detail counts (the unverified 409 has a string)', () => {
  assert.deepEqual(
    noAccountFromDetail({ code: 'oauth_no_account', provider: 'google', email: 'k@example.com' }),
    { email: 'k@example.com', provider: 'google' },
  )
  assert.equal(noAccountFromDetail('Account exists but is not verified'), null)
  assert.equal(noAccountFromDetail({ code: 'something_else' }), null)
  assert.equal(noAccountFromDetail(undefined), null)
})

test('providers', () => {
  assert.equal(isOAuthProvider('google'), true)
  assert.equal(isOAuthProvider('apple'), true)
  assert.equal(isOAuthProvider('github'), false)
  assert.equal(isOAuthProvider(null), false)
})
