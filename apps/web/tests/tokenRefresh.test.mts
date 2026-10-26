// Unit tests for the token-refresh decision (sign-in fixes, Task 3).
// Run: pnpm --filter web test:auth   (node --test with type stripping; Node 22.6+)
// The same file lives in apps/web-herpetoverse/tests/ against its own copy.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REFRESH_RETRY_AFTER_MS,
  TOKEN_REFRESH_AFTER_MS,
  shouldRefreshToken,
  tokenIssuedAtSeconds,
} from '../src/lib/tokenRefresh.ts'

const b64url = (obj: object) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url')

/** A token shaped like the API's: header.payload.signature (signature unchecked here). */
const tokenIssuedAt = (iatSeconds: number | undefined, extra: object = {}) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'u', jti: 'j', ...(iatSeconds === undefined ? {} : { iat: iatSeconds }), ...extra })}.sig`

const NOW = 1_800_000_000_000 // fixed "now", ms

test('reads iat from a JWT, and nothing from garbage', () => {
  assert.equal(tokenIssuedAtSeconds(tokenIssuedAt(1234)), 1234)
  assert.equal(tokenIssuedAtSeconds(undefined), null)
  assert.equal(tokenIssuedAtSeconds(''), null)
  assert.equal(tokenIssuedAtSeconds('not-a-jwt'), null)
  assert.equal(tokenIssuedAtSeconds('a.b.c'), null)
  assert.equal(tokenIssuedAtSeconds(tokenIssuedAt(undefined)), null) // no iat claim
  assert.equal(tokenIssuedAtSeconds(tokenIssuedAt(undefined, { iat: 'soon' })), null)
})

test('a token younger than a day is not refreshed', () => {
  const iat = (NOW - (TOKEN_REFRESH_AFTER_MS - 60_000)) / 1000
  assert.equal(shouldRefreshToken(tokenIssuedAt(iat), NOW), false)
})

test('a token a day old (or older) is refreshed', () => {
  const exactlyADay = (NOW - TOKEN_REFRESH_AFTER_MS) / 1000
  assert.equal(shouldRefreshToken(tokenIssuedAt(exactlyADay), NOW), true)
  const tenDays = (NOW - 10 * TOKEN_REFRESH_AFTER_MS) / 1000
  assert.equal(shouldRefreshToken(tokenIssuedAt(tenDays), NOW), true)
})

test('a token whose age is unknown is left alone (never refresh-on-every-call)', () => {
  assert.equal(shouldRefreshToken(null, NOW), false)
  assert.equal(shouldRefreshToken('garbage', NOW), false)
  assert.equal(shouldRefreshToken(tokenIssuedAt(undefined), NOW), false)
})

test('an iat in the future (clock skew) is not refreshed', () => {
  assert.equal(shouldRefreshToken(tokenIssuedAt(NOW / 1000 + 3600), NOW), false)
})

test('a recent failed attempt backs off, then retries', () => {
  const old = tokenIssuedAt((NOW - 3 * TOKEN_REFRESH_AFTER_MS) / 1000)
  assert.equal(shouldRefreshToken(old, NOW, NOW - 60_000), false)
  assert.equal(shouldRefreshToken(old, NOW, NOW - REFRESH_RETRY_AFTER_MS), true)
  assert.equal(shouldRefreshToken(old, NOW, null), true)
  assert.equal(shouldRefreshToken(old, NOW, undefined), true)
})
