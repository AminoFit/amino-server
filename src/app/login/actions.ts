'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'
import { safeNextPath } from './nextPath'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL

export type LoginState = { error?: string } | null

/** Email and password (useFormState): an error message to show, or a redirect to where the user was going. */
export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email'), password = formData.get('password')
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password)
    return { error: 'Enter your email and password.' }

  const { error } = await createClient().auth.signInWithPassword({ email, password })
  if (error) {
    return { error: error.status === 400 ? "That email and password don't match." : "Signing in didn't work. Try again." }
  }

  revalidatePath('/', 'layout')
  redirect(safeNextPath(formData.get('next')) ?? '/log')
}

export async function loginWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get('next')) ?? '/log'
  const { data, error } = await createClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${BASE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error || !data.url) redirect('/login?error=google')
  redirect(data.url)
}

export async function logout() {
  await createClient().auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
