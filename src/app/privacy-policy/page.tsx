import {
  ArrowPathIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  LockClosedIcon,
  ServerIcon
} from "@heroicons/react/20/solid"
import Footer from "../Footer"
import Nav from "../MarketingNav"

export default function PrivacyPolicy() {
  return (
    <div className="bg-white">
      {/* Header */}
      <Nav />
      <main>
        <div className="container mx-auto relative bg-white px-6 py-24 sm:py-32 lg:px-8 gap-2">
          <h1>Privacy Policy</h1>
          <p className="mb-3">
            <em>Last updated: February 19th, 2024</em>
          </p>
          <p className="mb-3">
            Your privacy is really important to us when using Amino. You are trusting us with your thoughts and we want
            to make sure they’re safe, secure, and you know exactly what we do with them. Below is the privacy policy
            that we (Amino Intelligence, inc.) commit to which outlines what information we collect and how it is used.
            We reserve the right to update this policy and will post any changes here. If you have any questions, please
            reach out to us by emailing <a href="mailto:info@amino.fit">info@amino.fit</a>.
          </p>
          <h2>1. Collection and use of information</h2>
          <p className="mb-3">
            When using Amino, we collect information including the following potentially personally identifiable
            information:
          </p>
          <ul>
            <li>
              <strong>Email</strong>: This is used as your account login and we may occasionally send emails
              communicating to you. We will not share this with any third party that's not necessary for the product to
              function (e.g. it would be shared with our authentication provider). We will not share your information or
              email to any 3p that is not necessary.
            </li>
            <li>
              <strong>Entries and Conversations</strong>: when you put down thoughts or talk with the AI coach - that is
              information that is ultimately stored and used in the product. In terms of security of these entries - we
              encrypt the entries in storage using a unique key per each user. At any time you can delete all of your
              entries and related artifacts by reaching out to support or{" "}
              <a href="mailto:info@amino.fit">info@amino.fit</a>.
            </li>
            <li>
              <strong>AI Artifacts</strong>: there are likely artifacts that are generated from your entries and
              conversations (e.g. summary, questions, themes); we treat artifacts such as summaries the same as your raw
              entries and conversations and treat with the same encryption method.
            </li>
            <li>
              <strong>Phone Number</strong>: If you optionally setup text message reminders or other phone
              functionality, your phone number will be stored. We will not shre your phone number to any 3p that is not
              neccessary for the product to function.
            </li>
          </ul>
          <p className="mb-3">
            This information is stored securely on servers that we have hosted with industry standard cloud providers.
            We do not share your entries with any third party services that are not neccessary for the product to
            function and will never sell your data.
          </p>
          <p className="mb-3">
            In addition to this information, we may collect information such as browser metadata and how often you log
            in, what features you use in the product etc. in order to help us understand high level analytics of how the
            product is used.
          </p>
          <h2>2. Security of information</h2>
          <p className="mb-3">
            We commit to using best practices for information security to help prevent unwarranted access or use of your
            information. However, due to the nature of transmitting information over the internet, there is no way to
            guarantee that the information is completely secure. In the event that a security issue arises, we will
            disclose any relevant information via email or our social media channels.
          </p>
          <h2>3. Use of third party services</h2>
          <p className="mb-3">
            The use of third party services and software libraries is necessary to help power features of Amino
            including AI providers where raw entries and conversations may be sent in order to power functionality like
            the talking with AI coaching and deriving AI artifacts. By using Amino - you are effectively agreeing to
            the privacy policy of our AI providers including OpenAI and Anthropic. We will do our best to remove any
            identifiable information before sending to our AI providers but because we do not control the content that
            is input, we cannot fully guarantee that identifiable information is not sent to our AI providers.
          </p>
          <h2>4. Deletion of data</h2>
          <p className="mb-3">
            If you want to delete your data associated with your account or your account entirely, please email{" "}
            <a href="mailto:info@amino.fit">info@amino.fit</a> and we’ll be happy to delete all of it from our servers.
          </p>
          <h2>5. Use of Amino by Children</h2>
          <p className="mb-3">
            Amino is not intended for use by anyone under the age of 18 (“children”) and we do not knowingly collect
            data from children. If we learn we have collected data from anyone under the age of 18 the account and all
            data associated with the account will be deleted.
          </p>
          <h2>6. Country and Location Specific Rights</h2>
          <p className="mb-3">
            Amino is not intended as of the last updated date on this document to be used outside of the United States.
            If you are a user outside of the United States - you are using this software willingly-as-is and we are
            happy to delete all of your data if asked.
          </p>
          <p className="mb-3">For users within California, there are different categories of information:</p>
          <ul>
            <li>
              Identifiers, such as your contact details: we use emails as your login and may use phone numbers if you
              sign up for reminders
            </li>
            <li>
              Commercial Information, such as your transaction history: we do not ask for nor store any transaction
              information
            </li>
            <li>
              Network Activity Information, such as Content and how you interact with our Services: we do not explicitly
              take in network activity information but users may generate content that is stored within the service
            </li>
            <li>Geolocation Data: we do not take in geolocation data</li>
            <li>
              Your account login credentials (sensitive personal information): we leverage a third party for
              authentication (AWS)
            </li>
          </ul>
          <p className="mb-3">
            To the extent provided for by law and subject to applicable exceptions, California residents have the
            following privacy rights in relation to their Personal Information:
          </p>
          <ul>
            <li>
              The right to know information about our processing of your Personal Information, including the specific
              pieces of Personal Information that we have collected from you;
            </li>
            <li>The right to request deletion of your Personal Information;</li>
            <li>The right to correct your Personal Information; and</li>
            <li>The right to be free from discrimination relating to the exercise of any of your privacy rights.</li>
          </ul>
          <p className="mb-3">
            We don’t sell or share Personal Information as defined by the California Consumer Privacy Act, as amended by
            the California Privacy Rights Act. We also don’t process sensitive personal information for the purposes of
            inferring characteristics about a consumer.
          </p>
          <p className="mb-3">
            California residents can exercise their CCPA privacy rights by sending their request to{" "}
            <a href="mailto:info@amino.fit">info@amino.fit</a>.
          </p>
          <p className="mb-3">
            Verification. In order to protect your Personal Information from unauthorized access or deletion, we may
            require you to verify your credentials before you can submit a request to know or delete Personal
            Information. If you do not have an account with us, or if we suspect fraudulent or malicious activity, we
            may ask you to provide additional Personal Information and proof of residency for verification. If we cannot
            verify your identity, we will not provide or delete your Personal Information as applicable.
          </p>
          <p className="mb-3">
            Authorized Agent. You may submit a request to know or a request to delete your Personal Information through
            an authorized agent. If you do so, the agent must present signed written permission to act on your behalf
            and you may also be required to independently verify your identity and submit proof of your residency.
          </p>
          <h2>7. Contact Us</h2>
          <p className="mb-3">
            If you have any questions about our privacy policy or information practices, please feel free to contact us
            at <a href="mailto:info@amino.fit">info@amino.fit</a>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
