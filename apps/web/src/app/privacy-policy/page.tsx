'use client'

import Link from 'next/link'
import { TarantuverseLogoTransparent } from '@/components/TarantuverseLogo'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2">
              <TarantuverseLogoTransparent className="w-10 h-10" />
              <span className="text-2xl font-bold text-gradient-brand">
                Tarantuverse
              </span>
            </Link>
            <div className="flex gap-3">
              <Link href="/login" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 font-medium transition">
                Login
              </Link>
              <Link href="/register" className="px-6 py-2 bg-gradient-brand text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">Privacy Policy</h1>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            <strong>Effective Date:</strong> December 9, 2024<br />
            <strong>Last Updated:</strong> December 9, 2024
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">1. Introduction</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Welcome to Tarantuverse ("we," "our," or "us"). We are committed to protecting your privacy and ensuring you have a positive experience on our platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Services").
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              By using Tarantuverse, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our Services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">2.1 Information You Provide</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">We collect information that you voluntarily provide when using our Services:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Account Information:</strong> Email address, username, password (encrypted), display name</li>
              <li><strong>Profile Information:</strong> Bio, location, experience level, years keeping, specialties, social media links, avatar image</li>
              <li><strong>Collection Data:</strong> Information about your tarantulas including names, species, photos, husbandry details, feeding logs, molt records, substrate changes</li>
              <li><strong>Breeding Records:</strong> Pairing information, egg sac data, offspring records (if using premium features)</li>
              <li><strong>Community Content:</strong> Forum posts, messages, comments, reactions, photos you upload</li>
              <li><strong>Payment Information:</strong> Processed securely through third-party payment processors (we do not store payment card details)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">2.2 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers</li>
              <li><strong>Usage Data:</strong> Features used, pages viewed, time spent, interactions with the app</li>
              <li><strong>Log Data:</strong> IP address, browser type, access times, referring pages</li>
              <li><strong>Push Notification Tokens:</strong> If you enable notifications (can be disabled in settings)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">2.3 Information from Third Parties</h3>
            <p className="text-gray-700 dark:text-gray-300">
              If you sign in using OAuth providers (Google, Apple, GitHub), we receive basic profile information such as your name, email address, and profile picture from those services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">3. How We Use Your Information</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Provide, maintain, and improve our Services</li>
              <li>Create and manage your account</li>
              <li>Enable you to track your tarantula collection and husbandry data</li>
              <li>Facilitate community features (forums, messaging, profiles)</li>
              <li>Send you notifications about feeding reminders, messages, and community activity (if enabled)</li>
              <li>Process payments and manage subscriptions</li>
              <li>Respond to your comments, questions, and customer service requests</li>
              <li>Analyze usage patterns to improve user experience</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">4. Information Sharing and Disclosure</h2>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">4.1 What We Share</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">We do NOT sell your personal information. We may share your information in the following circumstances:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Public Profile Information:</strong> If you set your collection to "public," other users can view your profile, collection, and activity. You control this in settings.</li>
              <li><strong>Community Features:</strong> Forum posts, messages, and public comments are visible to other users</li>
              <li><strong>Service Providers:</strong> We work with third-party service providers (hosting, analytics, payment processing) who need access to your information to perform services on our behalf. They are bound by confidentiality obligations.</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law, court order, or government request</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred</li>
              <li><strong>With Your Consent:</strong> We may share information for any other purpose with your explicit consent</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">4.2 What We NEVER Share</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Your email address (kept private)</li>
              <li>Prices you paid for tarantulas</li>
              <li>Private notes on your collection</li>
              <li>Direct messages (except to the intended recipient)</li>
              <li>Payment information (handled by third-party processors)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">5. Data Storage and Security</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We implement appropriate technical and organizational security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Passwords are encrypted using industry-standard bcrypt hashing</li>
              <li>Data transmitted over HTTPS/TLS encryption</li>
              <li>Secure cloud infrastructure (Neon PostgreSQL, Cloudflare R2)</li>
              <li>Regular security updates and monitoring</li>
              <li>Access controls and authentication requirements</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">6. Your Privacy Rights and Choices</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">You have the following rights regarding your information:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>Access:</strong> View and download your data at any time through your account settings</li>
              <li><strong>Correction:</strong> Update or correct your information in your profile settings</li>
              <li><strong>Deletion:</strong> Delete your account and all associated data (this action is permanent)</li>
              <li><strong>Privacy Controls:</strong> Set your collection to private or public</li>
              <li><strong>Notification Preferences:</strong> Control which notifications you receive</li>
              <li><strong>Email Preferences:</strong> Opt out of promotional emails (account-related emails may still be sent)</li>
              <li><strong>Data Portability:</strong> Export your data in standard formats (available in settings)</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              To exercise these rights, visit your account settings or contact us at privacy@tarantuverse.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">7. Children's Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Our Services are not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at privacy@tarantuverse.com and we will delete such information from our systems.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">8. International Data Transfers</h2>
            <p className="text-gray-700 dark:text-gray-300">
              Your information may be transferred to and maintained on servers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ. By using our Services, you consent to the transfer of your information to the United States and other countries where we operate.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">9. Data Retention</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We retain your information for as long as your account is active or as needed to provide Services. If you delete your account, we will delete your personal information within 30 days, except where we are required to retain it for legal, regulatory, or security purposes. Anonymous, aggregated data may be retained for analytics purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">10. Third-Party Services</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">Our Services may contain links to third-party websites or integrate with third-party services:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li><strong>OAuth Providers:</strong> Google, Apple, GitHub (subject to their own privacy policies)</li>
              <li><strong>Payment Processors:</strong> Stripe, PayPal (we do not handle payment card data directly)</li>
              <li><strong>Cloud Services:</strong> Neon (database), Cloudflare (storage, CDN), Render (hosting)</li>
              <li><strong>Analytics:</strong> Vercel Analytics (anonymized usage data)</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              We are not responsible for the privacy practices of these third parties. We encourage you to read their privacy policies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">11. California Privacy Rights (CCPA)</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Right to know what personal information is collected, used, shared, or sold</li>
              <li>Right to delete personal information</li>
              <li>Right to opt-out of the sale of personal information (we do not sell personal information)</li>
              <li>Right to non-discrimination for exercising your rights</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              To exercise these rights, contact us at privacy@tarantuverse.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">12. European Privacy Rights (GDPR)</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you are in the European Economic Area (EEA), you have rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Right of access to your personal data</li>
              <li>Right to rectification of inaccurate data</li>
              <li>Right to erasure ("right to be forgotten")</li>
              <li>Right to restrict processing</li>
              <li>Right to data portability</li>
              <li>Right to object to processing</li>
              <li>Right to withdraw consent</li>
            </ul>
            <p className="text-gray-700 dark:text-gray-300">
              To exercise these rights or make a complaint to a supervisory authority, contact us at privacy@tarantuverse.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">13. Changes to This Privacy Policy</h2>
            <p className="text-gray-700 dark:text-gray-300">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. For material changes, we will provide additional notice (such as an email notification or in-app alert). Your continued use of the Services after changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">14. Contact Us</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>Email:</strong> <a href="mailto:privacy@tarantuverse.com" className="text-purple-600 dark:text-purple-400 hover:underline">privacy@tarantuverse.com</a>
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>Support:</strong> <a href="mailto:support@tarantuverse.com" className="text-purple-600 dark:text-purple-400 hover:underline">support@tarantuverse.com</a>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                <strong>Tarantuverse</strong><br />
                Tarantula Husbandry Tracking Platform<br />
                Website: <a href="https://tarantuverse.vercel.app" className="text-purple-600 dark:text-purple-400 hover:underline">tarantuverse.vercel.app</a>
              </p>
            </div>
          </section>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-8 mt-8">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              By using Tarantuverse, you acknowledge that you have read and understood this Privacy Policy and agree to its terms.
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-gradient-brand text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium"
          >
            Back to Home
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
            <p className="mb-2">© 2024 Tarantuverse. All rights reserved.</p>
            <div className="flex justify-center gap-4">
              <Link href="/privacy-policy" className="hover:text-purple-600 dark:hover:text-purple-400">
                Privacy Policy
              </Link>
              <span>•</span>
              <Link href="/contact" className="hover:text-purple-600 dark:hover:text-purple-400">
                Contact
              </Link>
              <span>•</span>
              <Link href="/help" className="hover:text-purple-600 dark:hover:text-purple-400">
                Help
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
