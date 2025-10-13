'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Navigation */}
      <nav className="bg-dark-50/50 backdrop-blur-md border-b border-electric-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🕷️</span>
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Tarantuverse
              </span>
            </div>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-4 py-2 text-gray-300 hover:text-electric-blue-400 font-medium transition"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transform hover:scale-105 transition font-medium"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="mb-8">
          <span className="inline-block px-4 py-2 bg-electric-blue-500/10 border border-electric-blue-500/30 text-electric-blue-300 rounded-full text-sm font-semibold mb-6">
            The Ultimate Tarantula Management Platform
          </span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
          Your Complete Tarantula
          <br />
          Husbandry Companion
        </h1>
        <p className="text-xl text-gray-300 mb-10 max-w-3xl mx-auto">
          Track feedings, log molts, manage your collection, and connect with fellow enthusiasts. 
          Everything you need to be a successful tarantula keeper in one beautiful platform.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-2xl hover:shadow-electric-blue-500/30 transform hover:scale-105 transition font-semibold text-lg"
          >
            Start Free Today 🚀
          </Link>
          <Link
            href="/community"
            className="px-8 py-4 bg-dark-50 border-2 border-electric-blue-500/30 text-electric-blue-300 rounded-xl hover:border-electric-blue-500/50 hover:shadow-lg hover:shadow-electric-blue-500/20 transition font-semibold text-lg"
          >
            Explore Community
          </Link>
        </div>
        <p className="mt-6 text-sm text-gray-400">
          ✨ No credit card required • Free forever plan available
        </p>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-4xl font-bold text-center mb-4 text-gray-100">
          Everything You Need in One Place
        </h2>
        <p className="text-xl text-gray-300 text-center mb-16">
          Powerful features designed for passionate tarantula keepers
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Collection Management</h3>
            <p className="text-gray-300">
              Track all your tarantulas with detailed profiles, photos, and acquisition history. 
              Never forget important details about your collection.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🍴</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Feeding Tracking</h3>
            <p className="text-gray-300">
              Log every feeding with acceptance rates and schedules. Get smart predictions 
              for when to feed next based on your data.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🦋</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Molt Logs & Growth</h3>
            <p className="text-gray-300">
              Record molts with weight and size measurements. Visualize growth patterns 
              with beautiful charts over time.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📈</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Analytics Dashboard</h3>
            <p className="text-gray-300">
              Get insights into your collection with comprehensive analytics. Track species diversity, 
              activity patterns, and more.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📸</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Photo Gallery</h3>
            <p className="text-gray-300">
              Upload unlimited photos to document your tarantulas' growth and beauty. 
              Cloud storage keeps them safe forever.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🌐</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Community</h3>
            <p className="text-gray-300">
              Connect with fellow keepers, share your collection, and learn from the community. 
              Forums, discussions, and keeper profiles.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gradient-primary py-16 shadow-lg shadow-electric-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2 text-white">Growing</div>
              <div className="text-white/80">Active Keepers</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2 text-white">New</div>
              <div className="text-white/80">Community Platform</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2 text-white">Track</div>
              <div className="text-white/80">Your Collection</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2 text-white">Connect</div>
              <div className="text-white/80">With Keepers</div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-dark-50 border border-electric-blue-500/20 rounded-3xl p-12 text-center shadow-lg shadow-electric-blue-500/10">
          <span className="text-5xl mb-4 block">📱</span>
          <h2 className="text-4xl font-bold mb-4 text-gray-100">Mobile App Available</h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Track your collection on the go with our beautiful mobile app. 
            Available for iOS and Android with offline support.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-6 py-3 bg-dark border border-electric-blue-500/30 text-gray-100 rounded-xl hover:border-electric-blue-500/50 hover:shadow-lg hover:shadow-electric-blue-500/20 transition font-medium">
              📱 Download for iOS
            </button>
            <button className="px-6 py-3 bg-dark border border-neon-pink-500/30 text-gray-100 rounded-xl hover:border-neon-pink-500/50 hover:shadow-lg hover:shadow-neon-pink-500/20 transition font-medium">
              🤖 Download for Android
            </button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-primary py-20 shadow-lg shadow-electric-blue-500/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            Ready to Level Up Your Tarantula Keeping?
          </h2>
          <p className="text-xl text-white/80 mb-10">
            Join thousands of keepers who trust Tarantuverse to manage their collections
          </p>
          <Link
            href="/register"
            className="inline-block px-10 py-5 bg-white text-electric-blue-600 rounded-xl hover:shadow-2xl transform hover:scale-105 transition font-bold text-lg"
          >
            Create Your Free Account
          </Link>
          <p className="mt-6 text-white/70 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="underline font-semibold hover:text-white">
              Sign in here
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-dark-500 border-t border-electric-blue-500/10 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🕷️</span>
                <span className="text-white font-bold text-lg">Tarantuverse</span>
              </div>
              <p className="text-sm">
                The ultimate platform for tarantula enthusiasts and breeders worldwide.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/features" className="hover:text-electric-blue-400 transition">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-electric-blue-400 transition">Pricing</Link></li>
                <li><Link href="/species" className="hover:text-electric-blue-400 transition">Species Database</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Community</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/community" className="hover:text-neon-pink-400 transition">Keepers</Link></li>
                <li><Link href="/community/forums" className="hover:text-neon-pink-400 transition">Forums</Link></li>
                <li><Link href="/blog" className="hover:text-neon-pink-400 transition">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/help" className="hover:text-electric-blue-400 transition">Help Center</Link></li>
                <li><Link href="/contact" className="hover:text-electric-blue-400 transition">Contact</Link></li>
                <li><Link href="/privacy" className="hover:text-electric-blue-400 transition">Privacy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-electric-blue-500/10 pt-8 text-center text-sm">
            <p>&copy; 2025 Tarantuverse. Made with ❤️ for tarantula keepers everywhere.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
