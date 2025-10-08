'use client'

import Link from 'next/link'

export default function HelpPage() {
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
          How Can We Help?
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10">
          Find answers to common questions and learn how to get the most out of Tarantuverse
        </p>
        <div className="max-w-2xl mx-auto">
          <input
            type="search"
            placeholder="Search for help articles..."
            className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg"
          />
        </div>
      </section>

      {/* Help Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Getting Started */}
          <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🚀</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Getting Started</h3>
            <ul className="space-y-2 text-gray-600">
              <li><Link href="#" className="hover:text-purple-600">Creating your account</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Adding your first tarantula</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Navigating the dashboard</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Mobile app setup</Link></li>
            </ul>
          </div>

          {/* Collection Management */}
          <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Collection Management</h3>
            <ul className="space-y-2 text-gray-600">
              <li><Link href="#" className="hover:text-purple-600">Editing tarantula profiles</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Organizing your collection</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Adding species information</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Collection privacy settings</Link></li>
            </ul>
          </div>

          {/* Tracking & Logging */}
          <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📝</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Tracking & Logging</h3>
            <ul className="space-y-2 text-gray-600">
              <li><Link href="#" className="hover:text-purple-600">Logging feedings</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Recording molts</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Substrate changes</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Understanding analytics</Link></li>
            </ul>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
            <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📸</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Photos & Media</h3>
            <ul className="space-y-2 text-gray-600">
              <li><Link href="#" className="hover:text-purple-600">Uploading photos</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Managing your gallery</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Photo requirements</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Sharing photos</Link></li>
            </ul>
          </div>

          {/* Community */}
          <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🌐</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Community</h3>
            <ul className="space-y-2 text-gray-600">
              <li><Link href="#" className="hover:text-purple-600">Setting up your profile</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Following other keepers</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Message boards</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Direct messaging</Link></li>
            </ul>
          </div>

          {/* Account & Billing */}
          <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">💳</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Account & Billing</h3>
            <ul className="space-y-2 text-gray-600">
              <li><Link href="#" className="hover:text-purple-600">Managing your subscription</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Updating payment methods</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Account settings</Link></li>
              <li><Link href="#" className="hover:text-purple-600">Canceling your account</Link></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-3xl p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Still Need Help?</h2>
          <p className="text-gray-600 mb-8">
            Can't find what you're looking for? Our support team is here to help!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:shadow-lg transition font-semibold"
            >
              Contact Support
            </Link>
            <a
              href="mailto:support@tarantuverse.com"
              className="px-8 py-3 border-2 border-purple-600 text-purple-600 rounded-xl hover:bg-purple-50 transition font-semibold"
            >
              Email Us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
