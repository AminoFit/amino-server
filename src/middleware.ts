import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/mcp and .well-known (bearer-token and public endpoints; no cookie session to refresh)
     * - api/web (the web log's data routes: the database checks the session's token, and the Supabase client refreshes
     *   an expired one itself, so the middleware's extra round trip to Supabase Auth is skipped)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/mcp|api/web/|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}