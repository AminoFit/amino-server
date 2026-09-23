const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node').register({ transpileOnly: true })
const { createClient } = require('@supabase/supabase-js')
const {
  requestPasswordReset,
  establishPasswordRecoverySession,
  updateRecoveredPassword,
  passwordRecoveryErrorMessage,
} = require('../src/utils/supabase/passwordRecovery.ts')

const baseUrl = 'https://www.amino.fit/password-change'
function authStub(overrides = {}) {
  const calls = []
  const auth = {
    async getSession() { calls.push('getSession'); return { data: { session: { user: { id: 'previous' } } }, error: null } },
    async setSession(tokens) { calls.push(['setSession', tokens]); return { data: { session: { user: { id: 'recovery' } } }, error: null } },
    async updateUser(attributes) { calls.push(['updateUser', attributes]); return { data: { user: { id: 'recovery' } }, error: null } },
    async resetPasswordForEmail(email, options) { calls.push(['resetPasswordForEmail', email, options]); return { error: null } },
    ...overrides,
  }
  return { auth, calls }
}

test('reset trims the address and redirects to the site serving the form', async () => {
  const { auth, calls } = authStub()
  await requestPasswordReset(auth, ' user@example.com ', 'https://www.amino.fit')
  assert.deepEqual(calls, [['resetPasswordForEmail', 'user@example.com', { redirectTo: baseUrl }]])
})

test('invalid email does not send a request', async () => {
  const { auth, calls } = authStub()
  await assert.rejects(requestPasswordReset(auth, 'invalid', 'https://www.amino.fit'), /valid email/)
  assert.deepEqual(calls, [])
})

test('SMTP failure is propagated and shown as a retryable delivery error', async () => {
  const failure = { status: 500, message: 'Error sending recovery email' }
  const { auth } = authStub({ async resetPasswordForEmail() { return { error: failure } } })
  await assert.rejects(requestPasswordReset(auth, 'user@example.com', 'https://www.amino.fit'), error => error === failure)
  assert.match(passwordRecoveryErrorMessage(failure), /couldn't send your reset email/)
  assert.match(passwordRecoveryErrorMessage({ status: 429 }), /wait a few minutes/)
  assert.match(passwordRecoveryErrorMessage(new Error('Failed to fetch')), /connection/)
})

test('a recovery link replaces any previous recovery session before password entry', async () => {
  const { auth, calls } = authStub()
  await establishPasswordRecoverySession(auth, new URL(baseUrl + '#access_token=new-access&refresh_token=new-refresh&type=recovery'))
  assert.deepEqual(calls, [['setSession', { access_token: 'new-access', refresh_token: 'new-refresh' }]])
})

for (const suffix of [
  '#error=access_denied&error_code=otp_expired',
  '?error=access_denied',
  '#access_token=partial&type=recovery',
  '#access_token=access&refresh_token=refresh&type=signup',
  '?code=old-pkce-code',
]) {
  test(`invalid link cannot fall back to an existing session: ${suffix}`, async () => {
    const { auth, calls } = authStub()
    await assert.rejects(establishPasswordRecoverySession(auth, new URL(baseUrl + suffix)), /invalid or has expired/)
    assert.deepEqual(calls, [])
  })
}

test('failed token validation never continues to update a password', async () => {
  const { auth, calls } = authStub({ async setSession() { return { data: { session: null }, error: new Error('expired') } } })
  await assert.rejects(establishPasswordRecoverySession(auth, new URL(baseUrl + '#access_token=a&refresh_token=b&type=recovery')), /invalid or has expired/)
  assert.deepEqual(calls, [])
})

test('reload can resume the isolated recovery session, but a bare link without one fails', async () => {
  await establishPasswordRecoverySession(authStub().auth, new URL(baseUrl))
  const { auth } = authStub({ async getSession() { return { data: { session: null }, error: null } } })
  await assert.rejects(establishPasswordRecoverySession(auth, new URL(baseUrl)), /request a new/i)
})

test('password validation and missing sessions cannot update an account', async () => {
  const { auth, calls } = authStub()
  await assert.rejects(updateRecoveredPassword(auth, 'short', 'short'), /6 characters/)
  await assert.rejects(updateRecoveredPassword(auth, 'test-password', 'different'), /don't match/)
  assert.deepEqual(calls, [])
  auth.getSession = async () => ({ data: { session: null }, error: null })
  await assert.rejects(updateRecoveredPassword(auth, 'test-password', 'test-password'), /invalid or has expired/)
  assert.deepEqual(calls, [])
})

test('returned Supabase update errors are not reported as success', async () => {
  const failure = new Error('New password should be different from the old password.')
  const { auth } = authStub({ async updateUser() { return { data: { user: null }, error: failure } } })
  await assert.rejects(updateRecoveredPassword(auth, 'test-password', 'test-password'), error => error === failure)
})

test('installed Supabase SDK sends the implicit recovery request with the correct redirect', async () => {
  const requests = []
  const client = createClient('https://auth.example.test', 'test-anon-key', {
    auth: { flowType: 'implicit', persistSession: false, detectSessionInUrl: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: new URL(url), body: JSON.parse(options.body) })
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    } },
  })
  await requestPasswordReset(client.auth, 'user@example.com', 'https://www.amino.fit')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url.pathname, '/auth/v1/recover')
  assert.equal(requests[0].url.searchParams.get('redirect_to'), baseUrl)
  assert.equal(requests[0].body.email, 'user@example.com')
  assert.equal(requests[0].body.code_challenge, null)
})

test('the recovery client updates the link account and clears its isolated session after success', async () => {
  const previousFetch = global.fetch
  const previousWindow = global.window
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const storage = new Map()
  const calls = []
  const user = { id: 'recovery-user', aud: 'authenticated', email: 'user@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'mock-signature',
  ].join('.')
  global.window = { sessionStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.example.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname
    calls.push({ path, method: options.method, authorization: new Headers(options.headers).get('authorization'), body: options.body })
    if (path === '/auth/v1/logout') return new Response(null, { status: 204 })
    assert.equal(path, '/auth/v1/user')
    return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const { getPasswordRecoveryClient, clearPasswordRecoverySession } = require('../src/utils/supabase/passwordRecoveryClient.ts')
    const client = getPasswordRecoveryClient()
    await establishPasswordRecoverySession(client.auth, new URL(baseUrl + `#access_token=${token}&refresh_token=mock-refresh&type=recovery`))
    assert.deepEqual([...storage.keys()], ['amino-password-recovery'])
    await updateRecoveredPassword(client.auth, 'mock-new-password', 'mock-new-password')
    const updates = calls.filter(call => call.method === 'PUT')
    assert.equal(updates.length, 1)
    assert.equal(updates[0].authorization, 'Bearer ' + token)
    assert.equal(JSON.parse(updates[0].body).password, 'mock-new-password')
    await clearPasswordRecoverySession()
    assert.equal(storage.size, 0)
    assert.equal((await client.auth.getSession()).data.session, null)
  } finally {
    global.fetch = previousFetch
    if (previousWindow === undefined) delete global.window
    else global.window = previousWindow
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey
  }
})
