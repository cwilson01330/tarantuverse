'use client'

import Link from 'next/link'
import { TarantuverseLogoTransparent } from '@/components/TarantuverseLogo'

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">Terms of Service</h1>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            <strong>Last Updated:</strong> December 10, 2024
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">1. Acceptance of Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              By creating an account and using Tarantuverse, you agree to comply with these Terms of Service and Community Guidelines. If you do not agree with any part of these terms, you may not use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">2. Zero Tolerance Policy</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              <strong>Tarantuverse has a zero-tolerance policy for objectionable content and abusive behavior.</strong> Any violation of our community guidelines will result in immediate content removal and account suspension or termination.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">3. Prohibited Content</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">Users are strictly prohibited from posting, sharing, or transmitting:</p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Hate speech, harassment, threats, or bullying of any kind</li>
              <li>Illegal content, including but not limited to illegal animal trade, drugs, or weapons</li>
              <li>Sexually explicit, pornographic, or obscene material</li>
              <li>Spam, scams, phishing attempts, or fraudulent content</li>
              <li>Content that promotes animal cruelty or mistreatment</li>
              <li>Personal information of others without their explicit consent</li>
              <li>Content that infringes on intellectual property rights</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">4. User Responsibilities</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">As a member of the Tarantuverse community, you agree to:</p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Treat all community members with respect and kindness</li>
              <li>Report any objectionable content or abusive users immediately</li>
              <li>Use blocking features to manage your experience</li>
              <li>Provide accurate information in your profile and listings</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">5. Content Moderation</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We actively monitor user-generated content to ensure compliance with these guidelines. <strong>All reports of objectionable content will be reviewed and acted upon within 24 hours.</strong> Actions may include:
            </p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Immediate removal of violating content</li>
              <li>Temporary or permanent account suspension</li>
              <li>Content filtering and user blocking</li>
              <li>Reporting to law enforcement when necessary</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">6. Reporting & Blocking</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Users can report inappropriate content or users directly from forums, messages, and profiles. When you block a user:
            </p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Their content will be immediately hidden from your feed</li>
              <li>You will not receive messages from them</li>
              <li>Our moderation team will be notified for review</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">7. Subscriptions and Payments</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Tarantuverse offers optional premium subscriptions with additional features. By subscribing:
            </p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Payment will be charged to your Apple ID or Google Play account at confirmation of purchase</li>
              <li>Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period</li>
              <li>You can manage and cancel your subscription in your App Store or Google Play account settings</li>
              <li>No refunds will be provided for partial subscription periods</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">8. Account Termination</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We reserve the right to suspend or terminate your account at any time for violations of these terms. Serious or repeated violations will result in permanent ban without warning.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">9. Privacy</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your privacy is important to us. Please review our <Link href="/privacy-policy" className="text-purple-600 dark:text-purple-400 hover:underline">Privacy Policy</Link> to understand how we collect, use, and protect your personal information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">10. Changes to Terms</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              We may update these Terms of Service from time to time. Continued use of Tarantuverse after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">11. Contact</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you have questions about these terms or need to report a violation, please contact us at <a href="mailto:support@tarantuverse.com" className="text-purple-600 dark:text-purple-400 hover:underline">support@tarantuverse.com</a>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 dark:bg-gray-800 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 dark:text-gray-400">
          <p>&copy; 2024 Tarantuverse. All rights reserved.</p>
          <div className="mt-4 space-x-4">
            <Link href="/privacy-policy" className="hover:text-purple-600 dark:hover:text-purple-400">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-purple-600 dark:hover:text-purple-400">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
