'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Navigation */}
      <nav className="bg-dark-50/50 backdrop-blur-md border-b border-electric-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img
                src="/logo-transparent.png"
                alt="Tarantuverse"
                className="w-10 h-10 object-contain"
              />
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
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <div>
            <div className="mb-6">
              <span className="inline-block px-4 py-2 bg-electric-blue-500/10 border border-electric-blue-500/30 text-electric-blue-300 rounded-full text-sm font-semibold">
                Built by Keepers, for Keepers
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
              Never Forget to Feed Again
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Stop juggling spreadsheets and notebooks. Track feedings, predict molts,
              and watch your collection thrive with smart analytics built specifically
              for tarantula keepers.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link
                href="/register"
                className="px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-2xl hover:shadow-electric-blue-500/30 transform hover:scale-105 transition font-semibold text-lg text-center"
              >
                Start Tracking Free 🚀
              </Link>
              <Link
                href="#how-it-works"
                className="px-8 py-4 bg-dark-50 border-2 border-electric-blue-500/30 text-electric-blue-300 rounded-xl hover:border-electric-blue-500/50 hover:shadow-lg hover:shadow-electric-blue-500/20 transition font-semibold text-lg text-center"
              >
                See How It Works
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Up to 15 tarantulas free</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Free tier forever</span>
              </div>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="relative">
            <div className="bg-dark-50 border-2 border-electric-blue-500/20 rounded-2xl p-8 shadow-2xl shadow-electric-blue-500/10">
              <div className="space-y-4">
                {/* Preview Card 1 */}
                <div className="bg-dark border border-neon-pink-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-neon-pink-500 to-electric-blue-500 rounded-lg flex items-center justify-center text-2xl">
                      🕷️
                    </div>
                    <div>
                      <div className="font-semibold text-gray-100">Chilean Rose Hair</div>
                      <div className="text-sm text-gray-400">Last fed 4 days ago</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-center">
                      <div className="text-xs text-gray-400">Acceptance</div>
                      <div className="font-bold text-green-400">94%</div>
                    </div>
                    <div className="flex-1 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-lg px-3 py-2 text-center">
                      <div className="text-xs text-gray-400">Molts</div>
                      <div className="font-bold text-electric-blue-400">7</div>
                    </div>
                  </div>
                </div>

                {/* Preview Card 2 */}
                <div className="bg-dark border border-electric-blue-500/30 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-2">Next Feeding Prediction</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-100">Mexican Red Knee</div>
                      <div className="text-sm text-electric-blue-400">Feed in 2 days</div>
                    </div>
                    <div className="px-4 py-2 bg-electric-blue-500/20 text-electric-blue-300 rounded-lg text-sm font-medium">
                      📅 Remind Me
                    </div>
                  </div>
                </div>

                {/* Preview Card 3 */}
                <div className="bg-gradient-to-r from-neon-pink-500/10 to-electric-blue-500/10 border border-neon-pink-500/30 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-2">Growth Tracking</div>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">📈</div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 mb-1">Leg Span Growth</div>
                      <div className="h-2 bg-dark rounded-full overflow-hidden">
                        <div className="h-full w-3/4 bg-gradient-primary"></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">2.5cm → 7.8cm</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -top-4 -right-4 bg-neon-pink-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg shadow-neon-pink-500/50 transform rotate-12">
              Free to Start
            </div>
          </div>
        </div>
      </section>

      {/* Honest Stats Section */}
      <section className="bg-gradient-primary py-16 shadow-lg shadow-electric-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2 text-white">Start Free</div>
              <div className="text-white/80">15 Tarantulas Included</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2 text-white">$4.99/mo</div>
              <div className="text-white/80">For Unlimited Access</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2 text-white">Web + Mobile</div>
              <div className="text-white/80">Track Anywhere</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2 text-white">Built by Keepers</div>
              <div className="text-white/80">For Keepers</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-gray-100">
            How It Works
          </h2>
          <p className="text-xl text-gray-300">
            Get started in 3 simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center font-bold text-white text-xl shadow-lg">
              1
            </div>
            <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 pt-12 h-full">
              <div className="text-4xl mb-4">➕</div>
              <h3 className="text-xl font-bold mb-3 text-gray-100">Add Your Collection</h3>
              <p className="text-gray-300 mb-4">
                Create profiles for each tarantula with photos, species info, and acquisition details.
                Link to our species database for instant care requirements.
              </p>
              <div className="bg-dark border border-electric-blue-500/20 rounded-lg p-3 text-sm text-gray-400">
                <div className="flex justify-between mb-2">
                  <span>Name:</span>
                  <span className="text-gray-200">Rosie</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Species:</span>
                  <span className="text-gray-200">G. rosea</span>
                </div>
                <div className="flex justify-between">
                  <span>Sex:</span>
                  <span className="text-gray-200">Female</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center font-bold text-white text-xl shadow-lg">
              2
            </div>
            <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 pt-12 h-full">
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-xl font-bold mb-3 text-gray-100">Log Daily Care</h3>
              <p className="text-gray-300 mb-4">
                Quick-log feedings, molts, and substrate changes. Track acceptance rates and get
                smart predictions for when to feed next.
              </p>
              <div className="space-y-2">
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <div className="text-sm">
                    <div className="text-gray-200">Fed cricket (medium)</div>
                    <div className="text-gray-400 text-xs">2 days ago</div>
                  </div>
                </div>
                <div className="bg-electric-blue-900/20 border border-electric-blue-500/30 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-electric-blue-400">🦋</span>
                  <div className="text-sm">
                    <div className="text-gray-200">Molted successfully</div>
                    <div className="text-gray-400 text-xs">1 week ago</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center font-bold text-white text-xl shadow-lg">
              3
            </div>
            <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 pt-12 h-full">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold mb-3 text-gray-100">Watch Them Thrive</h3>
              <p className="text-gray-300 mb-4">
                Visualize growth with beautiful charts. See feeding patterns, track molting cycles,
                and share your collection with the community.
              </p>
              <div className="bg-dark border border-neon-pink-500/20 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-2">Feeding Acceptance Rate</div>
                <div className="flex items-end gap-1 h-16">
                  <div className="flex-1 bg-gradient-to-t from-neon-pink-500 to-electric-blue-500 rounded opacity-60" style={{height: '40%'}}></div>
                  <div className="flex-1 bg-gradient-to-t from-neon-pink-500 to-electric-blue-500 rounded opacity-70" style={{height: '60%'}}></div>
                  <div className="flex-1 bg-gradient-to-t from-neon-pink-500 to-electric-blue-500 rounded opacity-90" style={{height: '80%'}}></div>
                  <div className="flex-1 bg-gradient-to-t from-neon-pink-500 to-electric-blue-500 rounded" style={{height: '100%'}}></div>
                </div>
                <div className="text-center mt-2 text-sm font-bold text-neon-pink-400">94% Success</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Tarantuverse */}
      <section className="bg-dark-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-gray-100">
              Why Choose Tarantuverse?
            </h2>
            <p className="text-xl text-gray-300">
              Built specifically for tarantula keepers, not adapted from generic pet trackers
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Spreadsheets */}
            <div className="bg-red-900/10 border-2 border-red-500/30 rounded-2xl p-8">
              <h3 className="font-bold text-gray-100 mb-6 text-xl flex items-center gap-2">
                <span className="text-2xl">📊</span>
                Spreadsheets & Notebooks
              </h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span>Manual date calculations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span>No photo storage or organization</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span>Can't predict feeding schedules</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span>Lost when your phone dies</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span>No mobile access</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span>Difficult to share collection</span>
                </li>
              </ul>
            </div>

            {/* Tarantuverse */}
            <div className="bg-green-900/10 border-2 border-green-500/30 rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                BETTER
              </div>
              <h3 className="font-bold text-gray-100 mb-6 text-xl flex items-center gap-2">
                <span className="text-2xl">🕷️</span>
                Tarantuverse
              </h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Automatic analytics & predictions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Cloud photo storage (5 per T on free, unlimited with premium)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Smart feeding schedules & reminders</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Cloud backup - never lose your data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Web + mobile apps</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 flex-shrink-0">✓</span>
                  <span>Share with keeper community</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid - Benefits Focused */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-4xl font-bold text-center mb-4 text-gray-100">
          Everything You Need in One Place
        </h2>
        <p className="text-xl text-gray-300 text-center mb-16">
          Powerful features designed by keepers who understand your needs
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🍴</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Never Miss a Feeding</h3>
            <p className="text-gray-300">
              Smart predictions learn from your data and tell you exactly when each T is ready to eat.
              Track acceptance rates to spot premolt behavior early.
            </p>
          </div>

          {/* Feature 2 - UNIQUE */}
          <div className="bg-dark-50 border-2 border-neon-pink-500/40 rounded-2xl p-8 hover:border-neon-pink-500/60 hover:shadow-lg hover:shadow-neon-pink-500/20 transition relative">
            <div className="absolute top-4 right-4 bg-neon-pink-500/20 text-neon-pink-300 px-2 py-1 rounded-full text-xs font-bold">
              UNIQUE
            </div>
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🏜️</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Substrate Change Tracking</h3>
            <p className="text-gray-300">
              The only platform with dedicated substrate logs. Track maintenance schedules,
              monitor for mold, and never forget when you last rehoused.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📈</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Watch Your Slings Grow</h3>
            <p className="text-gray-300">
              Beautiful growth charts show weight and size progression over time.
              Track molting patterns and see exactly how fast your babies are growing.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📸</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Document Every Molt</h3>
            <p className="text-gray-300">
              Upload unlimited photos to track color changes and growth. Cloud storage keeps
              your memories safe even if you lose your phone.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">📚</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Species Care Database</h3>
            <p className="text-gray-300">
              Link your tarantulas to comprehensive care sheets. Get instant access to temperature,
              humidity, and enclosure requirements for any species.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🌐</span>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-100">Connect with Keepers</h3>
            <p className="text-gray-300">
              Share your collection, join discussions, and learn from experienced keepers.
              Public profiles make it easy to show off your beauties.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section - Transparent & Honest */}
      <section className="bg-dark-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-gray-100">
              Simple, Honest Pricing
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Start free with plenty of space. Upgrade anytime for unlimited tracking and breeding features.
              No tricks, no hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
            {/* Free Tier */}
            <div className="bg-dark border-2 border-electric-blue-500/30 rounded-2xl p-6">
              <h3 className="text-2xl font-bold mb-2 text-gray-100">Free Forever</h3>
              <div className="mb-4">
                <span className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">$0</span>
              </div>
              <p className="text-gray-400 mb-6 text-sm">Perfect for casual keepers</p>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300"><strong>15 tarantulas</strong></span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300"><strong>5 photos</strong> per tarantula</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300">Feeding & molt tracking</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300">Growth analytics</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300">Web + mobile apps</span>
                </li>
              </ul>

              <Link
                href="/register"
                className="block w-full py-3 text-center border-2 border-electric-blue-500/50 text-electric-blue-300 rounded-xl hover:bg-electric-blue-500/10 transition font-semibold"
              >
                Start Free
              </Link>
            </div>

            {/* Monthly - Most Popular */}
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 border-2 border-neon-pink-500/50 rounded-2xl p-6 transform scale-105 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-block px-3 py-1 bg-gradient-brand text-white rounded-full text-xs font-bold shadow-lg">
                  MOST POPULAR
                </span>
              </div>
              <h3 className="text-2xl font-bold mb-2 text-gray-100 mt-2">Premium</h3>
              <div className="mb-4">
                <span className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">$4.99</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-neon-pink-300 mb-6 text-sm font-semibold">Cancel anytime, no commitment</p>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-neon-pink-400 text-lg">✓</span>
                  <span className="text-gray-200 font-semibold">Everything in Free, plus:</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-neon-pink-400 text-lg">✓</span>
                  <span className="text-gray-200"><strong>Unlimited tarantulas</strong></span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-neon-pink-400 text-lg">✓</span>
                  <span className="text-gray-200"><strong>Unlimited photos</strong></span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-neon-pink-400 text-lg">✓</span>
                  <span className="text-gray-200"><strong>Breeding module</strong> (pairings, egg sacs, offspring)</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-neon-pink-400 text-lg">✓</span>
                  <span className="text-gray-200">Advanced analytics</span>
                </li>
              </ul>

              <Link
                href="/register"
                className="block w-full py-3 text-center bg-gradient-brand text-white rounded-xl hover:shadow-lg hover:shadow-neon-pink-500/50 transition font-bold"
              >
                Go Premium
              </Link>
            </div>

            {/* Yearly - Best Value */}
            <div className="bg-dark border-2 border-electric-blue-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold text-gray-100">Yearly</h3>
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">
                  SAVE 25%
                </span>
              </div>
              <div className="mb-4">
                <span className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">$44.99</span>
                <span className="text-gray-400">/year</span>
              </div>
              <p className="text-gray-400 mb-6 text-sm"><strong className="text-green-400">$3.75/mo</strong> - Save $15/year</p>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300 font-semibold">All Premium features</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300">2 months free</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-electric-blue-400 text-lg">✓</span>
                  <span className="text-gray-300">Best value for serious keepers</span>
                </li>
              </ul>

              <Link
                href="/register"
                className="block w-full py-3 text-center border-2 border-electric-blue-500/50 text-electric-blue-300 rounded-xl hover:bg-electric-blue-500/10 transition font-semibold"
              >
                Choose Yearly
              </Link>
            </div>
          </div>

          {/* Lifetime Option - Special Mention */}
          <div className="max-w-3xl mx-auto">
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-2 border-yellow-500/30 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl font-bold text-gray-100">Lifetime Access</h3>
                    <span className="px-3 py-1 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-full text-xs font-bold">
                      BEST DEAL
                    </span>
                  </div>
                  <p className="text-gray-300 mb-3">
                    <span className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">$149.99</span>
                    <span className="text-gray-400 ml-2">one time</span>
                  </p>
                  <p className="text-gray-400 text-sm">
                    Pay once, own forever. All future features included. No recurring fees, ever.
                  </p>
                </div>
                <div>
                  <Link
                    href="/register"
                    className="block px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-xl hover:shadow-lg hover:shadow-yellow-500/50 transition font-bold text-center whitespace-nowrap"
                  >
                    Get Lifetime Access
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Honest FAQ */}
          <div className="mt-16 max-w-3xl mx-auto">
            <h3 className="text-2xl font-bold text-gray-100 mb-6 text-center">Common Questions</h3>
            <div className="space-y-4">
              <details className="bg-dark border border-electric-blue-500/20 rounded-xl p-4 hover:border-electric-blue-500/40 transition">
                <summary className="font-semibold text-gray-100 cursor-pointer">
                  What happens when I hit my free tier limits?
                </summary>
                <p className="text-gray-400 mt-3 text-sm">
                  We'll show you a friendly upgrade prompt. Your data is never deleted - you can keep using what you have
                  or upgrade anytime to add more tarantulas and photos.
                </p>
              </details>
              <details className="bg-dark border border-electric-blue-500/20 rounded-xl p-4 hover:border-electric-blue-500/40 transition">
                <summary className="font-semibold text-gray-100 cursor-pointer">
                  Can I cancel my subscription?
                </summary>
                <p className="text-gray-400 mt-3 text-sm">
                  Absolutely. Monthly plans can be canceled anytime from your settings. Your account drops back to the free
                  tier and you keep all your data. No hassle, no questions asked.
                </p>
              </details>
              <details className="bg-dark border border-electric-blue-500/20 rounded-xl p-4 hover:border-electric-blue-500/40 transition">
                <summary className="font-semibold text-gray-100 cursor-pointer">
                  Do you have promo codes?
                </summary>
                <p className="text-gray-400 mt-3 text-sm">
                  Yes! Early adopters and community contributors may receive promo codes for free premium access.
                  You can redeem codes in your account settings.
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>

      {/* Early Access Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-electric-blue-500/10 to-neon-pink-500/10 border-2 border-electric-blue-500/30 rounded-3xl p-12 text-center">
          <div className="inline-block px-4 py-2 bg-electric-blue-500/20 text-electric-blue-300 rounded-full text-sm font-bold mb-6">
            🚀 EARLY ACCESS
          </div>
          <h2 className="text-4xl font-bold text-gray-100 mb-6">
            Join as a Founding Member
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Built by tarantula keepers, for tarantula keepers. We're just getting started
            and we'd love your feedback to make this the best platform possible.
          </p>
          <Link
            href="/register"
            className="inline-block px-10 py-5 bg-gradient-primary text-white rounded-xl hover:shadow-2xl hover:shadow-electric-blue-500/30 transform hover:scale-105 transition font-bold text-lg"
          >
            Create Free Account
          </Link>
          <p className="text-sm text-gray-400 mt-6">
            Early users get lifetime access to all premium features when they launch 🎁
          </p>
        </div>
      </section>

      {/* Mobile App Section - Honest */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-dark-50 border border-electric-blue-500/20 rounded-3xl p-12 text-center">
          <span className="text-5xl mb-4 block">📱</span>
          <h2 className="text-4xl font-bold mb-4 text-gray-100">Track on the Go</h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Native mobile apps for iOS and Android. Log feedings right at the enclosure,
            upload photos instantly, and sync across all your devices.
          </p>
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-dark border border-electric-blue-500/30 text-gray-300 rounded-xl">
            <span className="text-2xl">🚧</span>
            <div className="text-left">
              <div className="font-semibold">Mobile Apps in Beta</div>
              <div className="text-sm text-gray-400">Coming to App Store & Play Store soon</div>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-6">
            Sign up now and we'll notify you when apps are ready for download
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-primary py-20 shadow-lg shadow-electric-blue-500/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            Ready to Level Up Your Tarantula Keeping?
          </h2>
          <p className="text-xl text-white/80 mb-10">
            Join the community of keepers who are done with messy spreadsheets
          </p>
          <Link
            href="/register"
            className="inline-block px-10 py-5 bg-white text-electric-blue-600 rounded-xl hover:shadow-2xl transform hover:scale-105 transition font-bold text-lg"
          >
            Start Tracking Free Today
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
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/logo-transparent.png"
                  alt="Tarantuverse"
                  className="w-8 h-8 object-contain"
                />
                <span className="text-white font-bold text-lg">Tarantuverse</span>
              </div>
              <p className="text-sm">
                The ultimate platform for tarantula enthusiasts and breeders worldwide.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#how-it-works" className="hover:text-electric-blue-400 transition">How It Works</Link></li>
                <li><Link href="/species" className="hover:text-electric-blue-400 transition">Species Database</Link></li>
                <li><Link href="/register" className="hover:text-electric-blue-400 transition">Sign Up Free</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Community</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/community" className="hover:text-neon-pink-400 transition">Keepers</Link></li>
                <li><Link href="/community/forums" className="hover:text-neon-pink-400 transition">Forums</Link></li>
                <li><Link href="/community/board" className="hover:text-neon-pink-400 transition">Message Board</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="https://github.com/yourusername/tarantuverse" className="hover:text-electric-blue-400 transition">GitHub</a></li>
                <li><Link href="/privacy" className="hover:text-electric-blue-400 transition">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-electric-blue-400 transition">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-electric-blue-500/10 pt-8 text-center text-sm">
            <p>&copy; 2025 Tarantuverse. Made with ❤️ by tarantula keepers, for tarantula keepers.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
