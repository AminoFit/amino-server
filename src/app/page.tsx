import type { Metadata } from "next"
import {
  ArrowRightIcon, ChartBarIcon, ChatBubbleLeftRightIcon, CheckIcon, ChevronDownIcon, DevicePhoneMobileIcon,
  MicrophoneIcon, PhotoIcon, QrCodeIcon, SparklesIcon
} from "@heroicons/react/20/solid"
import { AminoLogo } from "@/components/AminoLogo"
import { SOCIAL } from "./Footer"
import { AppStoreButton, CopyMcpUrl } from "./_home/ClientBits"
import "./theme.css"

// The public homepage. Static (re-rendered daily for the footer's year) and in the app's colours, following the
// visitor's light or dark setting.
export const revalidate = 86400
export const metadata: Metadata = {
  title: "Amino · Food tracking that just listens",
  description: "Snap a photo, say it or type it. Amino works out what you ate and keeps your calories and macros on " +
    "track, on your iPhone, on the web, and in the AI assistants you already use."
}

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-app-border/30 bg-app-bg/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8" aria-label="Main">
        <a href="/" className="shrink-0"><AminoLogo className="h-7 w-auto" /></a>
        <div className="hidden items-center gap-6 text-sm text-app-muted md:flex">
          <a href="#logging" className="transition hover:text-app-text">How it works</a>
          <a href="#web" className="transition hover:text-app-text">On the web</a>
          <a href="#agents" className="transition hover:text-app-text">AI agents</a>
          <a href="#faq" className="transition hover:text-app-text">FAQ</a>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a href="/login" className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-app-text/[0.06]">Log in</a>
          <div className="hidden sm:block"><AppStoreButton small /></div>
        </div>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-18rem] h-[40rem] w-[70rem] -translate-x-1/2 rounded-full bg-app-kcal/20 blur-3xl" />
        <div className="absolute right-[-10rem] top-40 h-96 w-96 rounded-full bg-app-fat/15 blur-3xl" />
        <div className="absolute bottom-0 left-[-8rem] h-80 w-80 rounded-full bg-app-carb/15 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-20">
        <div>
          <a href="#agents" className="app-rise group inline-flex items-center gap-2 rounded-full border border-app-border/70 bg-app-card/70 py-1 pl-1 pr-3 text-sm backdrop-blur">
            <span className="rounded-full bg-[#C4FF46] px-2 py-0.5 text-xs font-semibold text-black">New</span>
            <span className="text-app-muted">Connect Claude &amp; ChatGPT to your log</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-app-muted transition group-hover:translate-x-0.5" aria-hidden />
          </a>
          <h1 className="app-rise mt-7 text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-7xl" style={delay(60)}>
            Food tracking<br />
            <span className="bg-gradient-to-r from-app-kcal via-app-fat to-app-protein bg-clip-text text-transparent">that just listens.</span>
          </h1>
          <p className="app-rise mt-6 max-w-xl text-lg leading-relaxed text-app-muted" style={delay(120)}>
            Snap a photo, say it, or type it like a message. Amino works out what you ate, down to the gram, and keeps
            your calories and macros on track, with no endless food lists to search.
          </p>
          <div className="app-rise mt-9 flex flex-wrap items-center gap-3" style={delay(180)}>
            <AppStoreButton />
            <a href="/login" className="group inline-flex items-center gap-2 rounded-full border border-app-border bg-app-card/60 px-6 py-3.5 text-[15px] font-semibold backdrop-blur transition hover:-translate-y-0.5 hover:border-app-text/30">
              Open your log on the web
              <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </a>
          </div>
          <p className="app-rise mt-5 text-sm text-app-muted" style={delay(240)}>Free for your first week. iPhone, web, and your AI assistant.</p>
        </div>

        <div className="relative mx-auto w-full max-w-[22rem]">
          <div aria-hidden className="absolute inset-8 -z-10 rounded-[3rem] bg-app-kcal/30 blur-3xl" />
          <img src="/amino-app.png" alt="The Amino app's food log, with a day's meals, calories and macros"
            width={440} height={894} className="app-rise relative mx-auto w-[18rem] drop-shadow-2xl sm:w-[20rem]" style={delay(120)} />
          <div className="app-float absolute -left-6 top-24 hidden rounded-2xl border border-white/20 bg-app-card/80 px-4 py-3 shadow-xl backdrop-blur-xl sm:block"
            style={delay(0)}>
            <p className="flex items-center gap-1.5 text-xs text-app-muted"><PhotoIcon className="h-3.5 w-3.5" aria-hidden /> From a photo</p>
            <p className="mt-0.5 text-sm font-semibold">Chicken, rice &amp; broccoli</p>
            <p className="text-xs tabular-nums text-app-muted"><span className="font-semibold text-app-kcal">517</span> cal · <span className="font-semibold text-app-protein">63</span> g protein</p>
          </div>
          <div className="app-float absolute -right-4 bottom-28 hidden rounded-2xl border border-white/20 bg-app-card/80 px-4 py-3 shadow-xl backdrop-blur-xl sm:block"
            style={delay(1800)}>
            <p className="text-xs text-app-muted">Protein today</p>
            <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-app-text/10">
              <div className="h-full w-[89%] rounded-full bg-app-protein" />
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums">142 <span className="font-normal text-app-muted">/ 160 g</span></p>
          </div>
        </div>
      </div>
    </section>
  )
}

const WAYS = [
  { Icon: PhotoIcon, title: "Snap it", text: "Take a photo of your plate, a menu or a package. Amino spots each food, estimates the portion and even reads barcodes and labels.", example: "Photo of a burrito bowl", tint: "from-app-kcal/25" },
  { Icon: MicrophoneIcon, title: "Say it", text: "Tap the mic and talk the way you would to a friend. Brands, amounts and \"half of it\" are all understood.", example: "\"Two eggs and half an avocado on sourdough\"", tint: "from-app-protein/25" },
  { Icon: ChatBubbleLeftRightIcon, title: "Type it", text: "Write it like a text message. No searching, no scrolling through fifty kinds of oat milk.", example: "venti oat latte from starbucks", tint: "from-app-carb/25" }
]

function Logging() {
  return (
    <section id="logging" className="scroll-mt-20 border-t border-app-border/40 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="app-reveal text-sm font-semibold uppercase tracking-widest text-app-kcal">How it works</p>
        <h2 className="app-reveal mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Three ways to log. No searching.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {WAYS.map(({ Icon, title, text, example, tint }) => (
            <article key={title} className={`app-reveal relative overflow-hidden rounded-3xl border border-app-border/60 bg-gradient-to-b ${tint} to-app-card to-60% p-7`}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-app-card shadow-sm"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-6 text-xl font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-app-muted">{text}</p>
              <p className="mt-6 inline-block rounded-full bg-app-text/[0.06] px-3 py-1.5 text-xs text-app-muted">{example}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const BARS = [
  { label: "Calories", value: "1,737", unit: "kcal", fill: "79%", pct: "79%", color: "bg-app-kcal/45", goal: "2,200" },
  { label: "Carbs", value: "135", unit: "g", fill: "61%", pct: "61%", color: "bg-app-carb/45", goal: "220" },
  { label: "Protein", value: "162", unit: "g", fill: "100%", pct: "101%", color: "bg-app-protein/45", goal: "160" },
  { label: "Fat", value: "58", unit: "g", fill: "77%", pct: "77%", color: "bg-app-fat/45", goal: "75" }
]

function Web() {
  return (
    <section id="web" className="scroll-mt-20 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <div className="app-reveal order-2 rounded-[2rem] border border-app-border/60 bg-app-card p-5 shadow-2xl shadow-black/10 sm:p-7 lg:order-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-app-muted">Your day</p>
              <p className="text-2xl font-semibold tracking-tight">Today</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-app-carb/20 px-3 py-1 text-xs font-semibold">🔥 12-day streak</span>
          </div>
          <div className="mt-5 space-y-1.5">
            {BARS.map(bar => (
              <div key={bar.label} className="flex h-10 gap-[3px]">
                <div className="relative flex-[4] overflow-hidden rounded-l-2xl rounded-r-md bg-app-text/[0.06]">
                  <div className={`absolute inset-y-0 left-0 ${bar.color}`} style={{ width: bar.fill }} />
                  <div className="relative flex h-full items-center justify-between px-3.5 text-sm">
                    <span><span className="text-app-muted">{bar.label}</span> <span className="ml-1 font-semibold tabular-nums">{bar.value}</span> <span className="text-app-muted">{bar.unit}</span></span>
                    <span className="font-semibold tabular-nums">{bar.pct}</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center rounded-l-md rounded-r-2xl bg-app-text/[0.06] leading-tight">
                  <span className="text-xs font-semibold tabular-nums">{bar.goal}</span>
                  <span className="text-[10px] uppercase tracking-wide text-app-muted">goal</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-12 gap-[3px]" aria-hidden>
            {Array.from({ length: 48 }, (_, i) => (
              <span key={i} className={`aspect-square rounded-[4px] ${["bg-app-kcal", "bg-app-kcal/55", "bg-app-kcal", "bg-app-carb", "bg-app-kcal", "bg-app-kcal/25"][(i * 7) % 6]}`} />
            ))}
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <p className="app-reveal text-sm font-semibold uppercase tracking-widest text-app-fat">On the web</p>
          <h2 className="app-reveal mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Your log, on the big screen.</h2>
          <p className="app-reveal mt-5 text-lg leading-relaxed text-app-muted">
            Sign in at amino.fit by scanning a code with your phone. See every day of your log, how you&apos;re tracking
            against your goals, your streak, and twelve weeks of trends at a glance.
          </p>
          <ul className="app-reveal mt-7 space-y-3">
            {[{ Icon: QrCodeIcon, text: "Scan to sign in. No password needed" },
              { Icon: ChartBarIcon, text: "Averages, days on target and your most-logged foods" },
              { Icon: DevicePhoneMobileIcon, text: "Always in sync with the app" }].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-app-text/[0.06]"><Icon className="h-4 w-4" aria-hidden /></span>{text}
              </li>
            ))}
          </ul>
          <a href="/login" className="app-reveal group mt-8 inline-flex items-center gap-2 font-semibold text-app-link">
            Open the web log <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  )
}

function Agents() {
  return (
    <section id="agents" className="scroll-mt-20 px-3 py-10 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-[#0B1220] px-6 py-16 text-white sm:px-12 lg:py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-32 h-96 w-96 rounded-full bg-[#BE33FF]/25 blur-3xl" />
          <div className="absolute -bottom-40 left-10 h-96 w-96 rounded-full bg-[#2EB4E0]/20 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        </div>
        <div className="relative grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="app-reveal inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#C4FF46]">
              <SparklesIcon className="h-3.5 w-3.5" aria-hidden /> Works with MCP
            </p>
            <h2 className="app-reveal mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Bring your own AI.</h2>
            <p className="app-reveal mt-5 text-lg leading-relaxed text-white/70">
              Amino is an MCP server, so Claude, ChatGPT and any agent that speaks the Model Context Protocol can work
              with your log: spot trends, answer questions about what you ate, and tune your goals.
            </p>
            <ul className="app-reveal mt-7 space-y-2.5 text-white/85">
              {["Reads your meals, foods and nutrition", "Reads daily totals, goals and body stats",
                "Updates your calorie and macro goals when you ask"].map(text => (
                <li key={text} className="flex items-center gap-3"><CheckIcon className="h-5 w-5 text-[#C4FF46]" aria-hidden />{text}</li>
              ))}
            </ul>
            <ol className="app-reveal mt-8 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
              {["Add Amino as a custom connector with this address", "Approve it by scanning a code in the app",
                "Ask away. Disconnect any time"].map((text, i) => (
                <li key={text} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="text-xs font-semibold text-[#C4FF46]">0{i + 1}</span>
                  <p className="mt-1">{text}</p>
                </li>
              ))}
            </ol>
            <div className="app-reveal mt-4"><CopyMcpUrl /></div>
          </div>

          <div className="app-reveal relative mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-white/10 bg-[#151d2e] p-5 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs text-white/50">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" /><span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" /><span className="ml-2">Your AI assistant</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-black">
                  How&apos;s my protein been this week?
                </p>
                <p className="flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
                  <AminoLogo wordmark={false} className="h-3 w-3" /> amino · get_daily_summary
                </p>
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-3 leading-relaxed text-white/90">
                  You averaged <b className="text-[#EF476F]">142 g</b> a day, 89% of your 160 g goal. Tuesday was your best
                  day at 171 g; the weekend dipped under 110 g.
                  <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
                    {[128, 171, 150, 138, 156, 104, 98].map((grams, i) => (
                      <span key={i} className="flex-1 rounded-t bg-[#EF476F]/80" style={{ height: `${(grams / 171) * 100}%` }} />
                    ))}
                  </div>
                  <p className="mt-3">Want me to raise your weekend protein target so the app nudges you?</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const FAQS = [
  { q: "What is Amino?", a: <>An AI food log for iPhone. Log what you eat with a photo, your voice or a quick message, and Amino finds the foods, works out the portions and tracks your calories and macros against your goals.</> },
  { q: "Do I need a subscription?", a: <>Every account starts with a free week. After that a monthly subscription is required.</> },
  { q: "Can I use Amino on my computer?", a: <>Yes. Go to <a href="/login" className="font-medium text-app-link hover:underline">amino.fit/login</a> and scan the code with the app (Settings → Sign in on the web), or sign in with email or Google. The web log shows your days, goals, stats and connected agents.</> },
  { q: "Which AI assistants work with Amino?", a: <>Any assistant that supports MCP connectors, including Claude and ChatGPT. Add <code className="rounded bg-app-text/[0.06] px-1.5 py-0.5 text-sm">www.amino.fit/api/mcp</code> as a custom connector and approve it in the app.</> },
  { q: "Is my data safe with agents?", a: <>An agent only gets access after you approve it on your phone, it only sees your own log, and you can disconnect it at any time from the app or the web.</> },
  { q: "How can I give feedback?", a: <>We&apos;d love to hear it. Email <a href="mailto:info@amino.fit" className="font-medium text-app-link hover:underline">info@amino.fit</a> or post on our <a href="https://aminofit.featurebase.app" className="font-medium text-app-link hover:underline">Featurebase</a>.</> }
]

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <h2 className="app-reveal text-center text-4xl font-semibold tracking-tight sm:text-5xl">Questions</h2>
        <div className="mt-12 space-y-3">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="app-reveal group rounded-2xl border border-app-border/60 bg-app-card px-6 py-5 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDownIcon className="h-5 w-5 shrink-0 text-app-muted transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 leading-relaxed text-app-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="app-reveal relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-app-border/60 bg-app-card px-6 py-14 text-center">
        <div aria-hidden className="absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-app-kcal/25 blur-3xl" />
        <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Your next meal takes five seconds to log.</h2>
        <p className="relative mt-3 text-app-muted">Try Amino free for a week.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <AppStoreButton />
          <a href="/login" className="inline-flex items-center gap-2 rounded-full border border-app-border px-6 py-3.5 text-[15px] font-semibold transition hover:-translate-y-0.5">Log in on the web</a>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-app-border/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <AminoLogo className="h-6 w-auto" />
          <p className="text-xs text-app-muted">&copy; {new Date().getFullYear()} Hedge Labs. All rights reserved.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-app-muted" aria-label="Footer">
          <a href="/pricing" className="hover:text-app-text">Pricing</a>
          <a href="/privacy-policy" className="hover:text-app-text">Privacy</a>
          <a href="/terms-of-service" className="hover:text-app-text">Terms</a>
          <a href="/login" className="hover:text-app-text">Log in</a>
          <a href="mailto:info@amino.fit" className="hover:text-app-text">Contact</a>
        </nav>
        <div className="flex gap-4">
          {SOCIAL.map(item => (
            <a key={item.name} href={item.href} className="text-app-muted transition hover:text-app-text">
              <span className="sr-only">{item.name}</span>
              <item.icon className="h-5 w-5" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <div className="app-theme min-h-screen overflow-x-hidden bg-app-bg text-app-text">
      <Nav />
      <main>
        <Hero />
        <Logging />
        <Web />
        <Agents />
        <Faq />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
