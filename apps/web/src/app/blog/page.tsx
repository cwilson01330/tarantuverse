'use client'

import Link from 'next/link'

export default function BlogPage() {
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
          Tarantuverse Blog
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Tips, guides, and updates from the world of tarantula keeping
        </p>
      </section>

      {/* Featured Post */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-3xl overflow-hidden shadow-2xl">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-12 text-white">
              <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-sm font-semibold mb-4">
                FEATURED
              </span>
              <h2 className="text-4xl font-bold mb-4">
                Welcome to Tarantuverse: Your New Husbandry Companion
              </h2>
              <p className="text-purple-100 mb-6 text-lg">
                Discover how Tarantuverse is revolutionizing the way tarantula keepers manage their collections, 
                track growth, and connect with fellow enthusiasts worldwide.
              </p>
              <div className="flex items-center gap-4 text-sm text-purple-100 mb-6">
                <span>October 7, 2025</span>
                <span>•</span>
                <span>5 min read</span>
              </div>
              <Link
                href="#"
                className="inline-block px-6 py-3 bg-white text-purple-600 rounded-xl hover:shadow-xl transition font-semibold"
              >
                Read More
              </Link>
            </div>
            <div className="bg-purple-700/30 flex items-center justify-center p-12">
              <span className="text-9xl">🕷️</span>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Blog Post 1 */}
          <article className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
            <div className="bg-gradient-to-br from-purple-100 to-blue-100 h-48 flex items-center justify-center">
              <span className="text-6xl">📊</span>
            </div>
            <div className="p-6">
              <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold mb-3">
                GUIDE
              </span>
              <h3 className="text-xl font-bold mb-2">
                Getting Started: Setting Up Your First Collection
              </h3>
              <p className="text-gray-600 mb-4">
                A comprehensive guide to adding your first tarantulas and organizing your collection in Tarantuverse.
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                <span>Oct 5, 2025</span>
                <span>•</span>
                <span>3 min read</span>
              </div>
              <Link href="#" className="text-purple-600 font-semibold hover:underline">
                Read More →
              </Link>
            </div>
          </article>

          {/* Blog Post 2 */}
          <article className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
            <div className="bg-gradient-to-br from-green-100 to-blue-100 h-48 flex items-center justify-center">
              <span className="text-6xl">🦋</span>
            </div>
            <div className="p-6">
              <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold mb-3">
                TIPS
              </span>
              <h3 className="text-xl font-bold mb-2">
                Understanding Molt Cycles: A Keeper's Guide
              </h3>
              <p className="text-gray-600 mb-4">
                Learn how to recognize molt signs, track cycles, and use analytics to predict your tarantula's next molt.
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                <span>Oct 3, 2025</span>
                <span>•</span>
                <span>4 min read</span>
              </div>
              <Link href="#" className="text-purple-600 font-semibold hover:underline">
                Read More →
              </Link>
            </div>
          </article>

          {/* Blog Post 3 */}
          <article className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
            <div className="bg-gradient-to-br from-pink-100 to-purple-100 h-48 flex items-center justify-center">
              <span className="text-6xl">📸</span>
            </div>
            <div className="p-6">
              <span className="inline-block px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-semibold mb-3">
                PHOTOGRAPHY
              </span>
              <h3 className="text-xl font-bold mb-2">
                Tips for Taking Better Tarantula Photos
              </h3>
              <p className="text-gray-600 mb-4">
                Master the art of tarantula photography with these simple tips for capturing stunning images of your collection.
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                <span>Oct 1, 2025</span>
                <span>•</span>
                <span>5 min read</span>
              </div>
              <Link href="#" className="text-purple-600 font-semibold hover:underline">
                Read More →
              </Link>
            </div>
          </article>

          {/* Blog Post 4 */}
          <article className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
            <div className="bg-gradient-to-br from-yellow-100 to-orange-100 h-48 flex items-center justify-center">
              <span className="text-6xl">🍴</span>
            </div>
            <div className="p-6">
              <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold mb-3">
                CARE
              </span>
              <h3 className="text-xl font-bold mb-2">
                Feeding Schedules: Finding What Works Best
              </h3>
              <p className="text-gray-600 mb-4">
                Discover how to establish optimal feeding schedules and use data to improve your husbandry practices.
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                <span>Sep 28, 2025</span>
                <span>•</span>
                <span>4 min read</span>
              </div>
              <Link href="#" className="text-purple-600 font-semibold hover:underline">
                Read More →
              </Link>
            </div>
          </article>

          {/* Blog Post 5 */}
          <article className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
            <div className="bg-gradient-to-br from-indigo-100 to-purple-100 h-48 flex items-center justify-center">
              <span className="text-6xl">🌐</span>
            </div>
            <div className="p-6">
              <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold mb-3">
                COMMUNITY
              </span>
              <h3 className="text-xl font-bold mb-2">
                Building Connections in the Keeper Community
              </h3>
              <p className="text-gray-600 mb-4">
                Learn how to make the most of community features, share your collection, and connect with fellow keepers.
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                <span>Sep 25, 2025</span>
                <span>•</span>
                <span>3 min read</span>
              </div>
              <Link href="#" className="text-purple-600 font-semibold hover:underline">
                Read More →
              </Link>
            </div>
          </article>

          {/* Blog Post 6 */}
          <article className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
            <div className="bg-gradient-to-br from-blue-100 to-cyan-100 h-48 flex items-center justify-center">
              <span className="text-6xl">📈</span>
            </div>
            <div className="p-6">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-3">
                ANALYTICS
              </span>
              <h3 className="text-xl font-bold mb-2">
                Making Sense of Your Collection Analytics
              </h3>
              <p className="text-gray-600 mb-4">
                Unlock insights from your data with our comprehensive analytics dashboard and growth tracking tools.
              </p>
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                <span>Sep 22, 2025</span>
                <span>•</span>
                <span>6 min read</span>
              </div>
              <Link href="#" className="text-purple-600 font-semibold hover:underline">
                Read More →
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* Newsletter Signup */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-3xl p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
          <p className="text-gray-600 mb-8">
            Subscribe to our newsletter for the latest tips, guides, and platform updates
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
            />
            <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:shadow-lg transition font-semibold">
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
