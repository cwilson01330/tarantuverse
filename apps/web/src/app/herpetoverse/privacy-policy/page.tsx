'use client'

import Link from 'next/link'

// Herpetoverse Privacy Policy
// Appalachian Tarantulas, LLC is the data controller for both brands.
// Placement and brand-styling notes: see comment in /herpetoverse/terms/page.tsx.
export default function HerpetoversePrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/herpetoverse" className="flex items-center gap-2">
              <span className="text-3xl" aria-hidden="true">🐍</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-amber-700 bg-clip-text text-transparent">
                Herpetoverse
              </span>
            </Link>
            <div className="flex gap-3">
              <Link href="/herpetoverse/login" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition">
                Login
              </Link>
              <Link href="/herpetoverse/register" className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-amber-700 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Privacy Policy</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          <strong>Last Updated:</strong> April 21, 2026 &nbsp;·&nbsp; <strong>Effective:</strong> upon public launch of Herpetoverse
        </p>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">1. Who We Are</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Herpetoverse is operated by <strong>Appalachian Tarantulas, LLC</strong>, a Tennessee limited liability company (&ldquo;Appalachian Tarantulas,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). Appalachian Tarantulas, LLC also operates the sibling platform Tarantuverse. For purposes of the EU and UK General Data Protection Regulation, Appalachian Tarantulas, LLC is the &ldquo;controller&rdquo; of personal data collected through the Service.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              This Privacy Policy describes how we collect, use, disclose, and safeguard personal information when you use the Herpetoverse website, mobile applications, and related services (collectively, the &ldquo;Service&rdquo;). It should be read together with our <Link href="/herpetoverse/terms" className="text-emerald-600 dark:text-emerald-400 hover:underline">Terms of Service</Link>.
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              Questions? Contact us at <a href="mailto:privacy@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">privacy@tarantuverse.com</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Account information:</strong> email address, username, password (stored only as a bcrypt hash), display name.</li>
              <li><strong>Profile information:</strong> bio, location (free-text, not precise geolocation), experience level, years keeping, specialties, social-media links, avatar image.</li>
              <li><strong>Collection data:</strong> your snakes and other reptiles, including names, species associations, photos, husbandry details, feeding logs, shed logs, weight records, enclosure details, and any free-text notes you add.</li>
              <li><strong>Breeding and genetics records:</strong> pairing information, clutch data, gene/morph annotations for individual animals, and offspring records.</li>
              <li><strong>Community content:</strong> forum posts, direct messages, comments, reactions, and photos you choose to share.</li>
              <li><strong>Species submissions:</strong> if you submit species data or care-sheet corrections to the community database.</li>
              <li><strong>Support communications:</strong> the contents of messages you send us (email, contact form).</li>
              <li><strong>Payment information:</strong> if and when we enable paid Subscriptions, card details are handled by our third-party payment processor; we receive limited billing metadata (such as last four digits, brand, and transaction IDs) but do not store full card numbers.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Device and connection information:</strong> device type, operating system, app version, browser type, IP address, and approximate location derived from IP.</li>
              <li><strong>Usage information:</strong> pages and screens you view, features you use, actions you take, timestamps, and referring URLs.</li>
              <li><strong>Log data:</strong> server logs including request paths, status codes, and error traces, used for debugging, security, and abuse prevention.</li>
              <li><strong>Push notification tokens:</strong> if you enable notifications on mobile, we store the Expo push token associated with your device so we can send notifications you&rsquo;ve opted in to.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">2.3 Information From Third Parties</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you sign in using an OAuth provider such as Google, Apple, or GitHub, we receive a limited profile payload from that provider (typically your name, email address, and profile picture). We do not receive passwords from these providers.
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              If you link a Tarantuverse account to your Herpetoverse account, we associate the two accounts so you can sign in to both with the same credentials. Data in each platform remains logically separated; we do not commingle your Tarantuverse collection into your Herpetoverse profile or vice versa, except for shared profile fields such as display name and avatar.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">3. How We Use Your Information</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Provide, operate, and maintain the Service, including creating and managing your account;</li>
              <li>Enable you to record and track husbandry data for animals in your care;</li>
              <li>Power community features (forums, profiles, follows, direct messages, activity feed);</li>
              <li>Generate algorithmic features such as shed prediction, feeding reminders, and morph-calculator output from your own records and our gene catalog;</li>
              <li>Send transactional and service-related communications (password resets, receipts, security alerts, reminders you opted in to);</li>
              <li>Process payments and manage Subscriptions;</li>
              <li>Respond to support requests and feedback;</li>
              <li>Measure and analyze usage to fix bugs, improve performance, and develop new features;</li>
              <li>Detect, investigate, and prevent abuse, fraud, and security incidents;</li>
              <li>Comply with legal obligations and enforce our Terms of Service.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">4. Legal Bases for Processing (EU/UK Users)</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you are in the European Economic Area, United Kingdom, or Switzerland, we rely on the following legal bases under GDPR/UK GDPR:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Performance of a contract</strong> — to provide the Service you signed up for and fulfill our Terms.</li>
              <li><strong>Legitimate interests</strong> — to operate, secure, and improve the Service, prevent abuse, and communicate with users about the Service, balanced against your rights.</li>
              <li><strong>Consent</strong> — for optional features such as push notifications, marketing emails, or any future use of non-essential cookies. You can withdraw consent at any time.</li>
              <li><strong>Legal obligation</strong> — to comply with applicable laws, respond to lawful requests, and meet regulatory requirements.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">5. How We Share Information</h2>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">5.1 We Do Not Sell Personal Information</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We do not sell your personal information and we do not share it for cross-context behavioral advertising, as those terms are defined under the California Consumer Privacy Act (CCPA/CPRA).
            </p>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">5.2 When We Share</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Public profile content:</strong> if you set your collection to public, your profile, collection, and activity are visible to other users and may be indexed by search engines. You control this in Settings.</li>
              <li><strong>Community features:</strong> forum posts, public comments, and community submissions are visible to other users. Direct messages are visible only to you and the recipient.</li>
              <li><strong>Service providers:</strong> we use the vendors listed in Section 10 to host, store, secure, and operate the Service. They may process personal data on our behalf under written agreements limiting how they use it.</li>
              <li><strong>Legal and safety:</strong> we may disclose information if we believe in good faith it is necessary to comply with law, legal process, or enforceable government request (including wildlife-enforcement requests), to enforce our Terms, or to protect the rights, property, or safety of any person.</li>
              <li><strong>Business transfers:</strong> if Appalachian Tarantulas, LLC is involved in a merger, acquisition, financing, or sale of assets, your information may be transferred as part of that transaction; we will provide notice before personal data becomes subject to a different privacy policy.</li>
              <li><strong>With your consent:</strong> we may share information for any other purpose with your explicit consent.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">5.3 What We Never Share</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Your email address with other users (kept private on your profile);</li>
              <li>Prices you paid for your animals;</li>
              <li>Private notes on your collection;</li>
              <li>Contents of your direct messages (beyond the intended recipient);</li>
              <li>Payment card numbers (handled directly by our payment processor).</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">6. Analytics and Cookies</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We use cookies and similar technologies (such as local storage on the web and secure device storage on mobile) to keep you signed in, remember your preferences (for example, theme), and measure how the Service is used.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We use product-analytics tooling (currently PostHog) to understand aggregate usage and improve the Service. Where required by law, we will request your consent before loading non-essential analytics or cookies. You can generally block or delete cookies through your browser settings; doing so may affect core Service functionality such as staying signed in.
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              We do not currently respond to Do Not Track (DNT) signals because there is no industry consensus on how to interpret them. We do honor applicable Global Privacy Control (GPC) signals as opt-out-of-sale requests.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">7. Data Security</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We use commercially reasonable technical and organizational measures to protect personal information, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Passwords stored as bcrypt hashes, never in plaintext;</li>
              <li>JWT authentication with short token lifetimes and server-side revocation on logout;</li>
              <li>HTTPS/TLS in transit;</li>
              <li>Rate limiting, input validation, and content-type verification on uploads;</li>
              <li>Managed cloud infrastructure with ongoing security updates;</li>
              <li>Role-based access controls for administrative functions.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              No method of transmission or storage is perfectly secure. While we work to protect your information, we cannot guarantee absolute security. If we become aware of a personal-data breach affecting you, we will notify you as required by applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">8. Data Retention</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We retain your information for as long as your account is active or as needed to provide the Service. If you delete your account through <Link href="/herpetoverse/delete-account" className="text-emerald-600 dark:text-emerald-400 hover:underline">/herpetoverse/delete-account</Link>, we permanently remove your personal data within thirty (30) days, except where we are required to keep it longer to comply with legal, tax, regulatory, or security obligations, to resolve disputes, or to enforce our agreements.
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              Aggregated or de-identified information that can no longer reasonably be linked to you may be retained and used indefinitely. Log data and backups are rotated on normal operational schedules.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">9. International Data Transfers</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Appalachian Tarantulas, LLC is based in the United States and our infrastructure is primarily located in the United States. If you access the Service from outside the U.S., your information will be transferred to, stored, and processed in the U.S. and other countries where our service providers operate. Where required, we rely on appropriate safeguards (such as the European Commission&rsquo;s Standard Contractual Clauses) for cross-border transfers of personal data from the EEA, UK, or Switzerland.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">10. Third-Party Service Providers</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We rely on the following categories of service providers. Each processes only the personal data needed to perform its function and is bound by contractual confidentiality obligations.
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Hosting and compute:</strong> Render (API hosting), Vercel (web hosting).</li>
              <li><strong>Database:</strong> Neon (PostgreSQL).</li>
              <li><strong>Object storage / CDN:</strong> Cloudflare R2 (photos, thumbnails, file storage).</li>
              <li><strong>Email delivery:</strong> Resend (password resets, notifications, transactional email).</li>
              <li><strong>Push notifications:</strong> Expo Push Notification Service (mobile notifications).</li>
              <li><strong>OAuth providers:</strong> Google, Apple, GitHub (optional sign-in).</li>
              <li><strong>Product analytics:</strong> PostHog.</li>
              <li><strong>Payment processing:</strong> to be announced when paid Subscriptions launch; updates will be reflected in this policy.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              These providers have their own privacy policies governing how they process information on their infrastructure. We are not responsible for their acts or omissions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">11. Your Choices and Rights</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">You can exercise many rights directly in the Service:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Access and portability:</strong> download your data from <Link href="/herpetoverse/dashboard/settings/data-export" className="text-emerald-600 dark:text-emerald-400 hover:underline">Settings → Data Export</Link> in JSON, CSV, or a full ZIP including photos.</li>
              <li><strong>Correction:</strong> edit your profile, animals, logs, and other records from the dashboard.</li>
              <li><strong>Deletion:</strong> permanently delete your account and personal data at <Link href="/herpetoverse/delete-account" className="text-emerald-600 dark:text-emerald-400 hover:underline">/herpetoverse/delete-account</Link>.</li>
              <li><strong>Visibility:</strong> set your collection to private or public in Settings.</li>
              <li><strong>Notifications:</strong> manage push, email, and in-app notifications from <Link href="/herpetoverse/dashboard/settings/notifications" className="text-emerald-600 dark:text-emerald-400 hover:underline">Settings → Notifications</Link>.</li>
              <li><strong>Marketing email:</strong> you can opt out of promotional messages using the unsubscribe link in any marketing email; transactional messages (security, account, billing) will continue to be sent.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              You can also email <a href="mailto:privacy@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">privacy@tarantuverse.com</a> to exercise any privacy right. We will respond within the timeframes required by applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">12. California Privacy Rights (CCPA/CPRA)</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you are a California resident, you have the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Know what personal information we collect, the sources and purposes of collection, and the categories of third parties we share it with;</li>
              <li>Request a copy of the specific pieces of personal information we hold about you;</li>
              <li>Request correction of inaccurate personal information;</li>
              <li>Request deletion of your personal information, subject to certain exceptions;</li>
              <li>Limit the use and disclosure of &ldquo;sensitive personal information,&rdquo; although we do not use such information for any purpose beyond what is permitted without the right to limit;</li>
              <li>Opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal information — we do not sell or share personal information for cross-context behavioral advertising;</li>
              <li>Be free from retaliation for exercising your rights.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              To exercise these rights, email <a href="mailto:privacy@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">privacy@tarantuverse.com</a>. You may designate an authorized agent to act on your behalf; we will verify the agent&rsquo;s authority before processing the request.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">13. EEA / UK / Swiss Privacy Rights (GDPR)</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you are in the EEA, UK, or Switzerland, you have the following rights under GDPR and UK GDPR:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Right of access to your personal data;</li>
              <li>Right to rectification of inaccurate data;</li>
              <li>Right to erasure (&ldquo;right to be forgotten&rdquo;);</li>
              <li>Right to restrict processing;</li>
              <li>Right to data portability;</li>
              <li>Right to object to processing based on legitimate interests;</li>
              <li>Right to withdraw consent at any time, without affecting the lawfulness of processing based on consent before its withdrawal;</li>
              <li>Right to lodge a complaint with your local supervisory authority.</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              Email <a href="mailto:privacy@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">privacy@tarantuverse.com</a> to exercise any of these rights.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">14. Children&rsquo;s Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300">
              The Service is not directed to children under 13, and we do not knowingly collect personal information from children under 13. Users between 13 and the age of majority in their jurisdiction may use the Service only with the involvement and consent of a parent or legal guardian. If you believe a child under 13 has provided personal information to us, please contact <a href="mailto:privacy@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">privacy@tarantuverse.com</a> and we will delete the information promptly.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">15. Changes to This Policy</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We may update this Privacy Policy from time to time. When we do, we will update the &ldquo;Last Updated&rdquo; date at the top. For material changes that affect your rights, we will provide additional notice such as an in-app alert or email to the address associated with your account. Your continued use of the Service after the changes take effect means you accept the updated policy. If you do not agree to the updated policy, you should stop using the Service and may delete your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">16. Contact Us</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              For privacy questions, complaints, or to exercise your rights, contact us at:
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>Privacy:</strong> <a href="mailto:privacy@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">privacy@tarantuverse.com</a>
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>Support:</strong> <a href="mailto:support@tarantuverse.com" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@tarantuverse.com</a>
              </p>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                <strong>Appalachian Tarantulas, LLC</strong><br />
                Tennessee, USA
              </p>
            </div>
          </section>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-8 mt-8">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              By using Herpetoverse, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-12 text-center">
          <Link
            href="/herpetoverse"
            className="inline-block px-8 py-3 bg-gradient-to-r from-emerald-600 to-amber-700 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium"
          >
            Back to Home
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
            <p className="mb-2">&copy; 2026 Appalachian Tarantulas, LLC. All rights reserved.</p>
            <div className="flex justify-center gap-4 flex-wrap">
              <Link href="/herpetoverse/privacy-policy" className="hover:text-emerald-600 dark:hover:text-emerald-400">
                Privacy Policy
              </Link>
              <span>&bull;</span>
              <Link href="/herpetoverse/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400">
                Terms of Service
              </Link>
              <span>&bull;</span>
              <Link href="/herpetoverse/contact" className="hover:text-emerald-600 dark:hover:text-emerald-400">
                Contact
              </Link>
              <span>&bull;</span>
              <a href="https://tarantuverse.com" className="hover:text-emerald-600 dark:hover:text-emerald-400">
                Tarantuverse
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
