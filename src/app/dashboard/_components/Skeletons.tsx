// What each signed-in page shows while its data loads (the pages' loading.tsx), in the pages' own layout.

const Block = ({ className }: { className: string }) => <div className={`app-shimmer rounded-2xl ${className}`} />

const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) =>
  <div className={`rounded-3xl border border-app-border/70 bg-app-card/90 p-3.5 sm:p-6 ${className}`}>{children}</div>

export function LogSkeleton() {
  return (
    <main className="mx-auto max-w-3xl px-3 pb-16 pt-4 sm:px-6 sm:pt-6 lg:pt-8" aria-busy aria-label="Loading your log">
      <Panel>
        <Block className="h-4 w-28" />
        <Block className="mt-2 h-7 w-40" />
        <div className="mt-4 grid grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, i) => <Block key={i} className="h-14" />)}</div>
        <div className="mt-4 space-y-1.5">{Array.from({ length: 4 }, (_, i) => <Block key={i} className="h-8 sm:h-11" />)}</div>
      </Panel>
      <Block className="mt-6 h-5 w-24" />
      <div className="mt-3 space-y-3">{Array.from({ length: 2 }, (_, i) => <Panel key={i}><Block className="h-28" /></Panel>)}</div>
    </main>
  )
}

export function StatsSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8" aria-busy aria-label="Loading your stats">
      <Block className="mb-4 h-8 w-24" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="lg:col-span-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Block key={i} className="h-24" />)}</div></Panel>
        <Panel><Block className="h-52" /></Panel>
        <Panel><Block className="h-52" /></Panel>
      </div>
    </main>
  )
}

export function SettingsSkeleton() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-6 sm:px-6 lg:pt-8" aria-busy aria-label="Loading settings">
      <Block className="h-8 w-32" />
      <Panel><Block className="h-16" /></Panel>
      <Panel><Block className="h-20" /></Panel>
      <Panel><Block className="h-12" /></Panel>
      <Panel><Block className="h-40" /></Panel>
    </main>
  )
}
