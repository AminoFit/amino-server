const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const { NextRequest, NextResponse } = require('next/server')

function loadMiddleware(createServerClient) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils/supabase/middleware.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, process,
    require: name => ({ '@supabase/ssr': { createServerClient }, 'next/server': { NextResponse } })[name] ?? {}
  })
  return module.exports
}

test('a refreshed session split over two cookies reaches the browser whole', async () => {
  const chunks = [{ name: 'sb-ref-auth-token.0', value: 'new-access-and-refresh-token' },
    { name: 'sb-ref-auth-token.1', value: 'new-user' }]
  const { updateSession } = loadMiddleware((_url, _key, { cookies }) => ({
    auth: { getUser: async () => {
      // Supabase refreshes the expired token and rewrites every chunk in one call.
      assert.equal(cookies.getAll().find(c => c.name === 'sb-ref-auth-token.0').value, 'old')
      cookies.setAll(chunks.map(c => ({ ...c, options: { path: '/', sameSite: 'lax' } })))
      return { data: { user: { id: 'u' } }, error: null }
    } }
  }))
  const request = new NextRequest('https://www.amino.fit/log', { headers: {
    cookie: 'sb-ref-auth-token.0=old; sb-ref-auth-token.1=old-user' } })
  const response = await updateSession(request)
  for (const chunk of chunks) assert.equal(response.cookies.get(chunk.name)?.value, chunk.value)
  // The page rendering this request sees the new session too.
  assert.equal(request.cookies.get('sb-ref-auth-token.0')?.value, 'new-access-and-refresh-token')
})

test('a request whose session needs no refresh sets no cookies', async () => {
  const { updateSession } = loadMiddleware(() => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }))
  const response = await updateSession(new NextRequest('https://www.amino.fit/'))
  assert.equal(response.cookies.getAll().length, 0)
})
