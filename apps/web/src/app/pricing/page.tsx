'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navigation */}
      <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo-transparent.png" alt="Tarantuverse" width={40} height={40} />
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Tarantuverse
              </span>
            </Link>
            <div className="flex gap-3">
              <Link href="/login" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 font-medium transition">
                Login
              </Link>
              <Link href="/register" className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          Start free with generous limits. Upgrade for unlimited tracking and breeding features.
        </p>
      </section>

      {/* Pricing Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-lg border-2 border-gray-200 dark:border-gray-700">
            <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Free</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900 dark:text-white">$0</span>
              <span className="text-gray-600 dark:text-gray-400">/forever</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Perfect for casual keepers with small collections</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Up to 15 tarantulas</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">5 photos per tarantula</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Feeding & molt tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Basic analytics</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Community access</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Mobile app access</span>
              </li>
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 text-center border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold"
            >
              Get Started Free
            </Link>
          </div>

          {/* Monthly Plan */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-lg border-2 border-gray-200 dark:border-gray-700">
            <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Monthly</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900 dark:text-white">$4.99</span>
              <span className="text-gray-600 dark:text-gray-400">/month</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Perfect for trying premium features</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300 font-semibold">Everything in Free, plus:</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Unlimited tarantulas</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Unlimited photos</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Full breeding module</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Advanced analytics</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Priority support</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">Cancel anytime</span>
              </li>
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 text-center border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold"
            >
              Choose Monthly
            </Link>
          </div>

          {/* Yearly Plan - Most Popular */}
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-3xl p-8 shadow-2xl transform scale-105 relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="inline-block px-4 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full text-sm font-bold shadow-lg">
                MOST POPULAR
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-2 mt-4">Yearly</h3>
            <div className="mb-2">
              <span className="text-5xl font-bold">$44.99</span>
              <span className="text-purple-100">/year</span>
            </div>
            <p className="text-green-200 font-semibold mb-6">Save $15/year (25% off)</p>
            <p className="text-purple-100 mb-6">Best value for serious keepers</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-semibold">Everything in Monthly, plus:</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>2 months FREE</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Save $15 per year</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>All premium features</span>
              </li>
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 text-center bg-white text-purple-600 rounded-xl hover:shadow-xl transition font-semibold"
            >
              Choose Yearly
            </Link>
          </div>
        </div>

        {/* Lifetime Plan - Standalone */}
        <div className="max-w-3xl mx-auto mt-12">
          <div className="bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-600 text-white rounded-3xl p-8 shadow-2xl relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="inline-block px-4 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full text-sm font-bold shadow-lg">
                BEST DEAL
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-center mt-4">
              <div>
                <h3 className="text-3xl font-bold mb-2">Lifetime Access</h3>
                <div className="mb-4">
                  <span className="text-6xl font-bold">$149.99</span>
                </div>
                <p className="text-yellow-100 text-lg mb-2">Pay once, own forever</p>
                <p className="text-white/90">No recurring fees. All future features included.</p>
              </div>
              <div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Everything in Premium</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Lifetime access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>All future features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>No recurring fees</span>
                  </li>
                </ul>
                <Link
                  href="/register"
                  className="block w-full py-3 text-center bg-white text-orange-600 rounded-xl hover:shadow-xl transition font-semibold text-lg"
                >
                  Get Lifetime Access
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">Feature Comparison</h2>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-purple-50 dark:bg-purple-900/20">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Feature</th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 dark:text-white">Free</th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-purple-600 dark:text-purple-400">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-white">Tarantulas</td>
                <td className="px-6 py-4 text-center text-gray-600 dark:text-gray-400">15</td>
                <td className="px-6 py-4 text-center text-purple-600 dark:text-purple-400 font-semibold">Unlimited</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-700/30">
                <td className="px-6 py-4 text-gray-900 dark:text-white">Photos per tarantula</td>
                <td className="px-6 py-4 text-center text-gray-600 dark:text-gray-400">5</td>
                <td className="px-6 py-4 text-center text-purple-600 dark:text-purple-400 font-semibold">Unlimited</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-white">Breeding module</td>
                <td className="px-6 py-4 text-center text-gray-400">-</td>
                <td className="px-6 py-4 text-center text-green-500">✓</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-700/30">
                <td className="px-6 py-4 text-gray-900 dark:text-white">Analytics</td>
                <td className="px-6 py-4 text-center text-gray-600 dark:text-gray-400">Basic</td>
                <td className="px-6 py-4 text-center text-purple-600 dark:text-purple-400 font-semibold">Advanced</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-white">Priority support</td>
                <td className="px-6 py-4 text-center text-gray-400">-</td>
                <td className="px-6 py-4 text-center text-green-500">✓</td>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-700/30">
                <td className="px-6 py-4 text-gray-900 dark:text-white">Data export (CSV/PDF)</td>
                <td className="px-6 py-4 text-center text-gray-400">-</td>
                <td className="px-6 py-4 text-center text-green-500">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Can I change plans later?</h3>
            <p className="text-gray-600 dark:text-gray-400">Yes! You can upgrade at any time. If you have a promo code, you can redeem it in your settings.</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">What happens if I exceed my plan limits?</h3>
            <p className="text-gray-600 dark:text-gray-400">We'll show you a friendly upgrade prompt when you hit your limit. Your data is never deleted, and you can upgrade anytime.</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Do you offer promo codes?</h3>
            <p className="text-gray-600 dark:text-gray-400">Yes! Early adopters may receive promo codes for free premium access. If you have a code, you can redeem it in your account settings.</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Can I cancel my monthly subscription?</h3>
            <p className="text-gray-600 dark:text-gray-400">Absolutely! Monthly plans can be canceled anytime from your account settings. No long-term contracts.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-purple-600 to-pink-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Start Your Journey?</h2>
          <p className="text-xl text-purple-100 mb-10">Join the community of tarantula keepers today</p>
          <Link
            href="/register"
            className="inline-block px-10 py-5 bg-white text-purple-600 rounded-xl hover:shadow-2xl transform hover:scale-105 transition font-bold text-lg"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  )
}
