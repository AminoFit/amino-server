import { isAuthorizationId } from "@/utils/supabase/oauthServer"

// The QR code's link. With Amino installed on the iPhone it opens the app (a universal link) and never reaches this
// page; otherwise it lands here.
export const metadata = { title: "Approve in Amino" }

export default function ApprovePage({ searchParams }: { searchParams: { authorization_id?: string } }) {
  const id = isAuthorizationId(searchParams.authorization_id) ? searchParams.authorization_id : null
  return (
    <div className="flex min-h-full flex-1 flex-col justify-center bg-gray-50 px-6 py-12">
      <div className="mx-auto w-full max-w-md bg-white px-6 py-8 shadow sm:rounded-lg">
        <img className="mx-auto h-10 w-auto" src="/logos/amino.svg" alt="Amino" />
        <h1 className="mt-6 text-xl font-bold text-gray-900">Open this in the Amino app</h1>
        <p className="mt-3 text-sm text-gray-600">
          Approving an agent happens in Amino on your iPhone. If the app is installed, open it here:
        </p>
        {id ? <a href={`fit.amino://oauth/approve?authorization_id=${id}`}
          className="mt-6 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
          Open Amino</a>
          : <p className="mt-6 text-sm text-gray-600">This link isn&apos;t complete. Start connecting again from your agent.</p>}
      </div>
    </div>
  )
}
