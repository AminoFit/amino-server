import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { renderSVG } from "uqr"
import { createClient } from "@/utils/supabase/server"
import { getAuthorizationRequest, isAuthorizationId, type AuthorizationRequest } from "@/utils/supabase/oauthServer"
import { WaitForApp, WebDecision } from "./ConsentClient"

// Supabase Auth sends an agent's user here to approve the connection (the OAuth server's authorization path).
// Most users sign in to Amino with Apple on their phone, so the page shows a QR code that opens the approval in the
// app; someone already signed in on the web can decide here instead.
export const dynamic = "force-dynamic"
export const metadata = { title: "Connect an agent to Amino" }

const AGENT_ACCESS = ["Read your meals, the foods in them and their nutrition",
  "Read your daily totals, goals and body stats", "Change your calorie and macro goals and your body stats"]

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col justify-center bg-gray-50 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <img className="mx-auto h-10 w-auto" src="/logos/amino.svg" alt="Amino" />
        <div className="mt-8 bg-white px-6 py-8 shadow sm:rounded-lg sm:px-10">{children}</div>
      </div>
    </div>
  )
}

const Message = ({ title, text }: { title: string; text: string }) =>
  <Shell><h1 className="text-xl font-bold text-gray-900">{title}</h1><p className="mt-3 text-sm text-gray-600">{text}</p></Shell>

export default async function ConsentPage({ searchParams }: { searchParams: { authorization_id?: string } }) {
  const authorizationId = searchParams.authorization_id
  if (!isAuthorizationId(authorizationId))
    return <Message title="This link isn't complete" text="Start connecting again from your agent." />

  const { data: { session } } = await createClient().auth.getSession()
  if (session) {
    let request: AuthorizationRequest
    try {
      request = await getAuthorizationRequest(authorizationId, session.access_token)
    } catch {
      return <Message title="This request has expired" text="Start connecting again from your agent." />
    }
    if (request.status === "decided") redirect(request.redirectUrl)
    return (
      <Shell>
        <h1 className="text-xl font-bold text-gray-900">Connect {request.client.name} to Amino?</h1>
        <p className="mt-2 text-sm text-gray-600">It will be able to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {AGENT_ACCESS.map(line => <li key={line}>{line}</li>)}
        </ul>
        <p className="mt-4 text-xs text-gray-500">
          It returns to {request.redirectHost || "the app that asked"}. You can disconnect it any time in the Amino app
          under Settings → Connected agents.
        </p>
        <div className="mt-6"><WebDecision authorizationId={authorizationId} /></div>
      </Shell>
    )
  }

  const host = headers().get("x-forwarded-host") ?? headers().get("host") ?? "amino.fit"
  const approveUrl = `https://${host}/oauth/approve?authorization_id=${authorizationId}`
  const appUrl = `fit.amino://oauth/approve?authorization_id=${authorizationId}`
  const signInUrl = `/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`
  const primary = "flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"

  // An agent on a phone (ChatGPT's app, say) opens this in its own browser, where a QR code can't be scanned: on an
  // iPhone the app approves and this page carries on once it has; on other phones signing in here is the way.
  const userAgent = headers().get("user-agent") ?? ""
  if (/iPhone|iPad|iPod/.test(userAgent)) return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-900">Approve in the Amino app</h1>
      <p className="mt-2 text-sm text-gray-600">Amino opens to ask you, then brings you back here.</p>
      <a className={`mt-6 ${primary}`} href={appUrl}>Open Amino</a>
      <div className="mt-6 text-center"><WaitForApp authorizationId={authorizationId} /></div>
      <p className="mt-8 border-t border-gray-100 pt-6 text-center text-sm">
        <a className="text-gray-600 hover:text-gray-900" href={signInUrl}>Sign in with email or Google instead</a></p>
    </Shell>
  )
  if (/Android|Mobi/.test(userAgent)) return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-900">Sign in to Amino</h1>
      <p className="mt-2 text-sm text-gray-600">Sign in to choose whether to connect this agent.</p>
      <a className={`mt-6 ${primary}`} href={signInUrl}>Sign in</a>
    </Shell>
  )

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-900">Approve in the Amino app</h1>
      <p className="mt-2 text-sm text-gray-600">
        Scan this code with your iPhone&apos;s camera, or in Amino go to Settings → Connected agents → Scan code.
      </p>
      <div className="mx-auto mt-6 w-56" aria-label="QR code that opens the approval in Amino"
        dangerouslySetInnerHTML={{ __html: renderSVG(approveUrl, { border: 1 }) }} />
      <div className="mt-6 text-center"><WaitForApp authorizationId={authorizationId} /></div>
      <div className="mt-8 space-y-2 border-t border-gray-100 pt-6 text-center text-sm">
        <p><a className="font-semibold text-indigo-600 hover:text-indigo-500"
          href={appUrl}>On your iPhone? Open Amino</a></p>
        <p><a className="text-gray-600 hover:text-gray-900" href={signInUrl}>
          Sign in with email or Google instead</a></p>
      </div>
    </Shell>
  )
}
