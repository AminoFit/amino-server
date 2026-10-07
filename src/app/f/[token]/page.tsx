// A food or recipe someone shared as a copy link. With Amino installed on the iPhone the link opens the app (a universal link) and never reaches this page;
// otherwise it lands here. Nothing about the food is shown: only the app, signed in, reads it.
export const metadata = { title: "A food shared on Amino", robots: { index: false, follow: false } }

const TOKEN = /^[A-Za-z0-9_-]{16,80}$/

export default function FoodCopyLinkPage({ params }: { params: { token: string } }) {
  const token = TOKEN.test(params.token) ? params.token : null
  return (
    <div className="flex min-h-full flex-1 flex-col justify-center bg-gray-50 px-6 py-12">
      <div className="mx-auto w-full max-w-md bg-white px-6 py-8 shadow sm:rounded-lg">
        <img className="mx-auto h-10 w-auto" src="/logos/amino.svg" alt="Amino" />
        <h1 className="mt-6 text-xl font-bold text-gray-900">Open this in the Amino app</h1>
        <p className="mt-3 text-sm text-gray-600">Someone shared a food or recipe with you. Open it in Amino to see it and add your own copy.</p>
        {token ? <>
          <a href={`fit.amino://f/${token}`}
            className="mt-6 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
            Open Amino</a>
          <a href={`fit.amino.personal://f/${token}`} className="mt-3 block text-center text-xs text-gray-500">Open the test build</a>
        </> : <p className="mt-6 text-sm text-gray-600">This link isn&apos;t complete. Ask for a new one.</p>}
      </div>
    </div>
  )
}
