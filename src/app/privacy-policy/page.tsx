import type { ReactNode } from "react"
import Footer from "../Footer"
import Nav from "../MarketingNav"

const CONTACT = "info@amino.fit"

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-10 mb-3 text-xl font-semibold text-gray-900">{children}</h2>
)
const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="mt-6 mb-2 text-base font-semibold text-gray-900">{children}</h3>
)
const P = ({ children }: { children: ReactNode }) => <p className="mb-3">{children}</p>
const List = ({ children }: { children: ReactNode }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>
const Mail = () => (
  <a className="underline" href={`mailto:${CONTACT}`}>
    {CONTACT}
  </a>
)

/** Every outside service that receives personal data, what for, and what it gets. */
const THIRD_PARTIES: { service: string; purpose: string; data: string }[] = [
  {
    service: "Supabase",
    purpose: "Database, sign-in and file storage",
    data: "Everything in your account: profile, meals, photos, weigh-ins and the rest of your log"
  },
  {
    service: "Vercel",
    purpose: "Hosts amino.fit and the Amino API",
    data: "Every request the app or website makes to our servers, including your IP address"
  },
  {
    service: "OpenRouter",
    purpose: "Routes our AI requests to the model providers below",
    data: "Meal text, meal and label photos, and the meal context described under AI processing"
  },
  {
    service: "Anthropic (Claude)",
    purpose: "Reads meals, photos and nutrition labels",
    data: "Meal text, photos and meal context"
  },
  {
    service: "Google (Gemini, through Google AI Studio or Vertex AI)",
    purpose: "Reads meals and photos; Vertex AI can also host Claude when Anthropic is unavailable",
    data: "Meal text, photos and meal context"
  },
  {
    service: "Microsoft Azure",
    purpose: "Can host Claude when Anthropic is unavailable",
    data: "Meal text, photos and meal context"
  },
  {
    service: "TypeSafe (Jev models)",
    purpose: "Picks the matching food from a short list of candidates",
    data: "Meal text, candidate foods and, for photo meals, the photos"
  },
  {
    service: "OpenAI (image model, through OpenRouter)",
    purpose: "Draws the small icon shown next to each food",
    data: "A food’s name only"
  },
  {
    service: "Deepgram",
    purpose: "Turns voice recordings into text",
    data: "Your voice recording, sent straight from your phone"
  },
  {
    service: "Exa",
    purpose: "Web search for nutrition facts about a food",
    data: "Search terms about a food or product, never your account details"
  },
  {
    service: "Cloudflare and DeepInfra",
    purpose: "Food search (turns text into search vectors)",
    data: "Food names and the text you type into food search"
  },
  {
    service: "Brave Search, UPCitemdb, Open Food Facts and USDA FoodData Central",
    purpose: "Look up packaged products and nutrition data",
    data: "Barcode numbers and food names, sent from our servers with no account details"
  },
  {
    service: "Apple",
    purpose: "Sign in with Apple, App Store purchases, push notifications and Apple Health (on your device)",
    data: "What you share with Sign in with Apple (name, email or a private relay address), purchases and notification text"
  },
  {
    service: "Google Sign-In",
    purpose: "Sign in with Google",
    data: "Google tells us your name and email; Google learns that you signed in to Amino"
  },
  {
    service: "RevenueCat",
    purpose: "Manages subscriptions",
    data: "Your Amino account ID, purchase history and basic device information"
  },
  {
    service: "Expo",
    purpose: "Delivers push notifications and app updates",
    data: "Your device’s push token, notification text and app version"
  },
  {
    service: "Amplitude",
    purpose: "Product analytics",
    data: "Your Amino account ID, app events such as signing in, and device and app information"
  },
  {
    service: "Google Analytics for Firebase",
    purpose: "App analytics",
    data: "Your Amino account ID, app events and screens, and device and app-instance identifiers (never the advertising identifier)"
  },
  {
    service: "Meta (Facebook SDK)",
    purpose: "Ad measurement, only if you allow tracking",
    data: "See Tracking and ads"
  },
  {
    service: "Google tag (website only)",
    purpose: "Website analytics and ad conversion measurement on amino.fit",
    data: "Cookies, pages visited, clicks such as App Store link taps, and device and browser information"
  },
  {
    service: "AI assistants you connect",
    purpose: "Read and, if you allow it, change your log on your behalf",
    data: "See Connected AI assistants"
  }
]

export default function PrivacyPolicy() {
  return (
    <div className="bg-white">
      <Nav />
      <main>
        <div className="container mx-auto relative bg-white px-6 py-24 sm:py-32 lg:px-8 gap-2 text-gray-700 leading-7">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Privacy policy</h1>
          <P>
            <em>Effective October 17, 2026</em>
          </P>
          <P>
            Amino is a food and nutrition tracker made by Hedge Labs Inc. (“Hedge Labs”, “we”, “us”). This policy
            explains what we collect when you use the Amino iOS app and amino.fit (including the web dashboard), why, who
            else receives it, and the choices you have. If anything is unclear, email us at <Mail />.
          </P>
          <P>
            The short version: we use your data to run Amino. We don’t sell it. We never use your meals, photos or
            Apple Health data for advertising. Meals are read by third-party AI services, which we name below, and the
            app asks before the first one is sent. Ad measurement only happens if you allow tracking.
          </P>

          <H2>What we collect</H2>
          <H3>Information you give us</H3>
          <List>
            <li>
              <strong>Account:</strong> your email address and, if you sign in with Apple or Google, the name and email
              they share with us (Apple may give us a private relay address instead). If you use a password, it is
              handled by our sign-in provider and we never see it in plain text. If you set a display name, people you
              link with see it.
            </li>
            <li>
              <strong>Profile and goals:</strong> sex, date of birth, height, weight, activity level, fitness goal,
              calorie and macro goals, goal weight, units, timezone and language.
            </li>
            <li>
              <strong>Meals:</strong> what you type, the text of what you say, photos of meals and nutrition labels,
              barcodes you scan, when you ate, and the foods, amounts and nutrients that end up in your log. Also the
              custom foods and recipes you create, your favourites, and any problem you report about a logged food.
            </li>
            <li>
              <strong>Voice recordings:</strong> recorded on your phone and sent from your phone directly to Deepgram to
              be turned into text. We keep the text as your meal. The audio is not stored on our servers, and the app
              deletes its copy once transcription succeeds.
            </li>
            <li>
              <strong>Weight and body:</strong> weigh-ins and body fat readings from Apple Health (if you allow it), the
              app or a connected AI assistant, and any days you leave out of your expenditure estimate.
            </li>
            <li>
              <strong>People and sharing:</strong> the people you link with, the permissions you give them, the foods
              you share, and meals logged for you or by you.
            </li>
            <li>
              <strong>Connected AI assistants:</strong> which assistants you connect, whether you let them make changes,
              and a short record of their requests.
            </li>
            <li>
              <strong>Support:</strong> anything you send when you contact us.
            </li>
          </List>
          <H3>Information collected automatically</H3>
          <List>
            <li>
              <strong>Purchases:</strong> your subscription status and history from Apple, through RevenueCat. We never
              see your card or payment details.
            </li>
            <li>
              <strong>Device and usage:</strong> your push notification token, app version, device model and operating
              system, IP address in server logs, and app usage events sent to our analytics providers.
            </li>
            <li>
              <strong>Meal processing records:</strong> for each meal, a record of how it was worked out (which models
              and lookups ran, what they returned and how long they took). These are deleted after 60 days.
            </li>
            <li>
              <strong>Website:</strong> amino.fit uses a Google tag, which sets cookies to measure visits and App Store
              link taps.
            </li>
          </List>

          <H2>How we use it</H2>
          <List>
            <li>To run Amino: log meals, estimate their nutrition, track your goals, and sync your log between the app and the web dashboard.</li>
            <li>To estimate your energy expenditure from your logged intake and weigh-ins, and to suggest goals.</li>
            <li>To send notifications you’ve allowed, such as reminders or a linked person logging a meal for you.</li>
            <li>
              To check and improve accuracy. Our team may review meal processing records, and the meals and photos
              involved, to fix mistakes in how foods are recognised.
            </li>
            <li>To provide support, keep accounts secure and prevent abuse.</li>
            <li>To understand how the app is used (analytics), so we can improve it.</li>
            <li>To measure our ads, only if you allow tracking (see Tracking and ads).</li>
          </List>
          <P>
            When Amino adds a new food to its shared food catalogue (for example a packaged product you scanned that we
            didn’t know yet), the catalogue entry holds only the food’s name, brand, barcode and nutrition, not who
            logged it.
          </P>
          <P>We don’t sell your personal data, and we don’t use your meals, photos or health data for advertising.</P>

          <H2>AI processing</H2>
          <P>
            Amino uses third-party AI services to work out the foods in a meal. Before you log your first meal by
            text, photo or voice, or read a nutrition label, the app asks for your permission. If you choose “Not now”,
            nothing is sent.
          </P>
          <P>
            What we send is used only to identify foods and estimate nutrition:
          </P>
          <List>
            <li>what you typed, or the text of what you said;</li>
            <li>photos of the meal or nutrition label;</li>
            <li>when you ate, your timezone and language;</li>
            <li>your recent meals and your own foods, so the AI can recognise what you usually eat.</li>
          </List>
          <P>
            We don’t send your name, email or Apple Health data with meals. Photos are sent as the image itself or
            through links that expire after a few minutes.
          </P>
          <P>The AI services we use are:</P>
          <List>
            <li>
              <strong>OpenRouter</strong>, which routes our requests to the model providers below.
            </li>
            <li>
              <strong>Anthropic</strong> (Claude). Claude normally runs on Anthropic’s own service; if that is
              unavailable, the same request can be served by Google Cloud Vertex AI or Microsoft Azure.
            </li>
            <li>
              <strong>Google</strong> (Gemini), through Google AI Studio or Google Cloud Vertex AI.
            </li>
            <li>
              <strong>TypeSafe</strong> (Jev models), which picks the matching food from a short list and may look at
              meal photos to do so.
            </li>
            <li>
              <strong>Deepgram</strong>, which turns voice recordings into text.
            </li>
            <li>
              <strong>OpenAI</strong> image model, through OpenRouter, which draws food icons from a food’s name only.
            </li>
            <li>
              <strong>Exa</strong>, which runs web searches for a food’s nutrition facts. The search terms describe the
              food, not you.
            </li>
            <li>
              <strong>Cloudflare</strong> and <strong>DeepInfra</strong>, which turn food names and food search text
              into vectors for search.
            </li>
          </List>
          <P>
            Each provider processes what we send under its API terms and privacy policy. We don’t send it to them for
            advertising, and we don’t sell it to them. AI estimates can be wrong, so check your log and edit anything
            that looks off.
          </P>

          <H2>Apple Health</H2>
          <P>
            If you connect Apple Health, Amino can read your height, weight, body fat, sex and date of birth, and its
            own food entries (to avoid saving the same meal twice). It can write the food you log, with its calories and
            nutrients. You choose which of these to allow in Apple’s permission sheet and can change it any time in the
            Health app.
          </P>
          <P>
            The weigh-ins and body fat readings Amino reads (value, time and the app that recorded them) are stored on
            our servers so we can show your weight trend, estimate your expenditure and show them on the web dashboard.
            Height, sex and date of birth prefill your setup, and the values you confirm are saved to your profile.
          </P>
          <P>For data from Apple Health:</P>
          <List>
            <li>We never use it for advertising or marketing.</li>
            <li>We never sell it.</li>
            <li>We never send it to advertising or analytics providers, or to the AI services that read your meals.</li>
            <li>
              We don’t share it with third parties, except the infrastructure providers that store it for us (Supabase
              and Vercel), and an AI assistant you choose to connect (see Connected AI assistants).
            </li>
            <li>We don’t store it in iCloud.</li>
          </List>
          <P>People you link with in Amino don’t see your weight, body stats or goals.</P>

          <H2>Third parties</H2>
          <P>These services receive personal data from Amino:</P>
          <div className="mb-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-2 pr-4 font-semibold text-gray-900">Service</th>
                  <th className="py-2 pr-4 font-semibold text-gray-900">Purpose</th>
                  <th className="py-2 font-semibold text-gray-900">Data it receives</th>
                </tr>
              </thead>
              <tbody>
                {THIRD_PARTIES.map(row => (
                  <tr key={row.service} className="border-b border-gray-200 align-top">
                    <td className="py-2 pr-4 font-medium text-gray-900">{row.service}</td>
                    <td className="py-2 pr-4">{row.purpose}</td>
                    <td className="py-2">{row.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            We may also disclose data if the law requires it, to protect people’s safety or our rights, or to a buyer if
            Hedge Labs is merged or sold, in which case this policy continues to apply to your data.
          </P>

          <H2>Tracking and ads</H2>
          <P>
            Amino asks for Apple’s tracking permission once, after your account is set up. You can change your answer
            any time in iOS Settings › Privacy &amp; Security › Tracking.
          </P>
          <P>
            <strong>If you allow tracking</strong>, the Meta (Facebook) SDK receives your Amino account ID, a sign-up
            event, the price of a subscription you buy, automatic app events (such as installs and app opens) and your
            device’s advertising identifier, so Meta can tell us which of our ads led to installs and subscriptions.
            We never send your email, meals,
            photos or health data to Meta or any ad network.
          </P>
          <P>
            <strong>If you don’t allow tracking</strong>, we don’t send Meta any events about you, and no advertising
            identifier is collected. Amplitude and Firebase still receive the app analytics described above, which we
            use to understand and improve Amino.
          </P>

          <H2>Sharing with people you choose</H2>
          <P>
            You can link with other Amino users as friends, partners or trainers. Both people have to accept. A linked
            person sees your display name and initials, the foods and recipes you choose to share with them, and meals
            they log for you if you allow it (shown as “Logged by” them). They don’t see your email, goals, weight or the
            rest of your log. A food link you send lets anyone who opens it save a copy of that food.
          </P>
          <P>
            You can unlink or stop sharing any time. Notifications about linked people (for example, that someone logged
            a meal for you) include their display name.
          </P>

          <H2>Connected AI assistants</H2>
          <P>
            You can connect AI assistants such as Claude or ChatGPT to your Amino account. Nothing is connected unless you
            approve it in the app. Once connected, an assistant can read your profile (including body stats and goals),
            meals, foods, weight history and expenditure estimate. It can log or change meals only if you turn on “Let
            agents make changes”.
          </P>
          <P>
            What an assistant does with your data is governed by that assistant provider’s terms and privacy policy, not
            ours. You can disconnect an assistant any time in Settings › Integrations › AI agents.
          </P>

          <H2>Retention and deletion</H2>
          <List>
            <li>We keep your data while you have an account.</li>
            <li>
              A meal you delete is hidden from your log and can be restored for 30 days (for example by a connected AI
              assistant). Deleted meals are erased for good when you delete your account.
            </li>
            <li>Meal processing records are deleted after 60 days.</li>
            <li>
              You can delete your account in the app (Settings › Delete account). This permanently deletes your account,
              profile, meals, photos, logged foods, weigh-ins, goals, favourites, links with other people and connected
              assistants. Your own foods and recipes are deleted too, except ones a linked person has used in their log,
              which stay as an archived copy so their log isn’t broken.
            </li>
            <li>
              Copies may remain in our providers’ encrypted backups for a limited time before they are overwritten.
              Analytics events already sent to Amplitude or Firebase, and purchase records held by Apple and RevenueCat,
              are kept under those services’ own retention settings. Email us if you want us to ask them to delete yours.
            </li>
          </List>

          <H2>Children</H2>
          <P>
            Amino is for adults. You must be at least 18 to use it, as our terms of service say. We don’t knowingly
            collect data from anyone under 18. If we learn that we have, we delete the account and its data.
          </P>

          <H2>Your rights</H2>
          <P>
            Depending on where you live, you may have the right to access your data, correct it, delete it, get a copy
            in a portable format, object to or restrict how we use it, and withdraw consent. You can correct most data in
            the app and delete your account there; for anything else, email <Mail />. We may need to verify your identity
            first, and we won’t treat you differently for using these rights.
          </P>
          <H3>EEA and UK</H3>
          <P>
            We process your data to provide the service you signed up for (contract), with your consent (AI meal
            processing, Apple Health, tracking and notifications, each of which you can withdraw), and for our
            legitimate interests in securing and improving Amino (analytics and accuracy reviews). Health data is
            processed only with your explicit consent. Our servers and most of our providers are in the United States,
            so your data is transferred there under the safeguards those providers offer. You can complain to your local
            data protection authority.
          </P>
          <H3>California</H3>
          <P>
            We collect the categories described in What we collect: identifiers, commercial information (subscription
            status), health and body information, photos and audio, internet activity (app and website analytics) and
            inferences (goal and expenditure estimates). We don’t sell personal information. If you allow tracking,
            sending app events to Meta for ad measurement may count as “sharing” for cross-context behavioural
            advertising under California law; you can opt out by turning tracking off in iOS Settings. We use sensitive
            personal information (health data, account login) only to provide the service. California residents can
            make requests by emailing <Mail />, directly or through an authorised agent with your signed permission.
          </P>

          <H2>Security</H2>
          <P>
            Data travels over encrypted connections (HTTPS) and is stored with Supabase, which encrypts it at rest. Access
            to your data is limited by account-level database rules, meal photos are kept in private storage, and only
            our team can see data in our admin tools. No system is perfectly secure; if a breach affects your data, we
            will tell you as the law requires.
          </P>

          <H2>Changes</H2>
          <P>
            We’ll update this policy when Amino changes how it handles data, post the new version on this page and change
            the effective date above. If a change affects how we use data you’ve already given us, we’ll ask for your
            consent where the law requires it.
          </P>

          <H2>Contact</H2>
          <P>
            Hedge Labs Inc. · <Mail />
          </P>
        </div>
      </main>

      <Footer />
    </div>
  )
}
