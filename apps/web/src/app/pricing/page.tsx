'use client'

import Link from 'next/link'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-3xl">🕷️</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Tarantuverse
              </span>
            </Link>
            <div className="flex gap-3">
              <Link href="/login" className="px-4 py-2 text-gray-700 hover:text-purple-600 font-medium transition">
                Login
              </Link>
              <Link href="/register" className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transform hover:scale-105 transition font-medium">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Choose the plan that's right for you. All plans include our core features.
        </p>
      </section>

      {/* Pricing Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold mb-2">Hobbyist</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold">$0</span>
              <span className="text-gray-600">/month</span>
            </div>
            <p className="text-gray-600 mb-6">Perfect for casual keepers with small collections</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Up to 10 tarantulas</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Basic feeding & molt tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>50 photo uploads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Community access</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Mobile app access</span>
              </li>
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 text-center border-2 border-purple-600 text-purple-600 rounded-xl hover:bg-purple-50 transition font-semibold"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro Plan */}
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-3xl p-8 shadow-2xl transform scale-105">
            <div className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-semibold mb-4">
              MOST POPULAR
            </div>
            <h3 className="text-2xl font-bold mb-2">Enthusiast</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold">$9</span>
              <span className="text-purple-100">/month</span>
            </div>
            <p className="text-purple-100 mb-6">For serious keepers with growing collections</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <span className="mt-1">✓</span>
                <span>Unlimited tarantulas</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">✓</span>
                <span>Advanced analytics dashboard</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">✓</span>
                <span>Unlimited photo uploads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">✓</span>
                <span>Growth charts & visualizations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">✓</span>
                <span>Feeding predictions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">✓</span>
                <span>Priority support</span>
              </li>
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 text-center bg-white text-purple-600 rounded-xl hover:shadow-xl transition font-semibold"
            >
              Start 14-Day Free Trial
            </Link>
          </div>

          {/* Breeder Plan */}
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold mb-2">Breeder</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold">$19</span>
              <span className="text-gray-600">/month</span>
            </div>
            <p className="text-gray-600 mb-6">For professional breeders and large collections</p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Everything in Enthusiast</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Breeding project tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Sac logs & spiderling management</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Sales tracking & inventory</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>Custom branding on public profile</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>API access</span>
              </li>
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 text-center border-2 border-purple-600 text-purple-600 rounded-xl hover:bg-purple-50 transition font-semibold"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2">Can I change plans later?</h3>
            <p className="text-gray-600">Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2">Is there a free trial?</h3>
            <p className="text-gray-600">Yes! All paid plans include a 14-day free trial. No credit card required to start.</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2">What happens if I exceed my plan limits?</h3>
            <p className="text-gray-600">We'll notify you and give you the option to upgrade. Your data is never deleted.</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <h3 className="font-bold text-lg mb-2">Can I cancel anytime?</h3>
            <p className="text-gray-600">Absolutely! No long-term contracts. Cancel anytime from your account settings.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Start Your Journey?</h2>
          <p className="text-xl text-purple-100 mb-10">Try any plan free for 14 days</p>
          <Link
            href="/register"
            className="inline-block px-10 py-5 bg-white text-purple-600 rounded-xl hover:shadow-2xl transform hover:scale-105 transition font-bold text-lg"
          >
            Start Free Trial
          </Link>
        </div>
      </section>
    </div>
  )
}
