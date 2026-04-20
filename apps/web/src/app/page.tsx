'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { TarantuverseLogoTransparent } from '@/components/TarantuverseLogo'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      router.replace('/dashboard')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <div className="text-center">
          <TarantuverseLogoTransparent className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-dark">

      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav className="bg-dark-50/50 backdrop-blur-md border-b border-electric-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <TarantuverseLogoTransparent className="w-10 h-10" />
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Tarantuverse
              </span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <a href="#keepers" className="hover:text-electric-blue-400 transition">For Keepers</a>
              <a href="#breeders" className="hover:text-electric-blue-400 transition">For Breeders</a>
              <a href="#feeders" className="hover:text-amber-400 transition">Feeders</a>
              <a href="#community" className="hover:text-electric-blue-400 transition">Community</a>
              <a href="#pricing" className="hover:text-electric-blue-400 transition">Pricing</a>
            </div>
            <div className="flex gap-3">
              <Link href="/login" className="px-4 py-2 text-gray-300 hover:text-electric-blue-400 font-medium transition">
                Login
              </Link>
              <Link href="/register" className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transform hover:scale-105 transition font-medium">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <div>
            <div className="flex flex-wrap gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-electric-blue-500/10 border border-electric-blue-500/30 text-electric-blue-300 rounded-full text-xs font-semibold">
                🕷️ Keepers
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neon-pink-500/10 border border-neon-pink-500/30 text-neon-pink-300 rounded-full text-xs font-semibold">
                🧬 Breeders
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-300 rounded-full text-xs font-semibold">
                🏷️ Sellers
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-full text-xs font-semibold">
                🦗 Feeder Colonies
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-primary bg-clip-text text-transparent">One App</span>
              <br />
              <span className="text-gray-100">for Every Part</span>
              <br />
              <span className="text-gray-100">of the Hobby</span>
            </h1>

            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Track feedings, predict molts, manage breeding projects, and connect with
              the keeper community — all in one place. Built by keepers who got tired of
              juggling spreadsheets.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link href="/register" className="px-8 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-2xl hover:shadow-electric-blue-500/30 transform hover:scale-105 transition font-semibold text-lg text-center">
                Start Free 🚀
              </Link>
              <Link href="#keepers" className="px-8 py-4 bg-dark-50 border-2 border-electric-blue-500/30 text-electric-blue-300 rounded-xl hover:border-electric-blue-500/50 hover:shadow-lg transition font-semibold text-lg text-center">
                See the Features
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span><span>Free for up to 15 tarantulas</span></div>
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span><span>Web & iOS / Android</span></div>
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span><span>No credit card needed</span></div>
            </div>
          </div>

          {/* Right: Live demo cards */}
          <div className="relative">
            <div className="bg-dark-50 border-2 border-electric-blue-500/20 rounded-2xl p-6 shadow-2xl shadow-electric-blue-500/10 space-y-3">

              {/* Feeding card */}
              <div className="bg-dark border border-neon-pink-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-neon-pink-500 to-electric-blue-500 rounded-lg flex items-center justify-center text-xl">🕷️</div>
                    <div>
                      <div className="font-semibold text-gray-100 text-sm">Brachypelma hamorii</div>
                      <div className="text-xs text-orange-400">⚠ Due for feeding</div>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-lg text-xs font-medium">14 days</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-400">Accept</div>
                    <div className="font-bold text-green-400 text-sm">89%</div>
                  </div>
                  <div className="bg-electric-blue-500/10 border border-electric-blue-500/20 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-400">Molts</div>
                    <div className="font-bold text-electric-blue-400 text-sm">12</div>
                  </div>
                  <div className="bg-neon-pink-500/10 border border-neon-pink-500/20 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-400">Size</div>
                    <div className="font-bold text-neon-pink-400 text-sm">5.2″</div>
                  </div>
                </div>
              </div>

              {/* Breeding card */}
              <div className="bg-dark border border-electric-blue-500/30 rounded-xl p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">🧬 Active Breeding Project</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-100 text-sm">P. metallica pairing</div>
                    <div className="text-xs text-electric-blue-400">Egg sac confirmed · Day 38</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Est. hatch</div>
                    <div className="text-sm font-bold text-neon-pink-400">~30 days</div>
                  </div>
                </div>
              </div>

              {/* Community activity */}
              <div className="bg-dark border border-green-500/20 rounded-xl p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">🌐 Community Activity</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                    <span><strong>SpiderKeeper_TX</strong> posted a molt photo</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="w-2 h-2 rounded-full bg-neon-pink-400 flex-shrink-0"></span>
                    <span><strong>ArachnoBreeder</strong> listed 12 P. metallica slings</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <div className="absolute -top-4 -right-4 bg-neon-pink-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg shadow-neon-pink-500/50 transform rotate-12">
              Free to Start
            </div>
            <div className="absolute -bottom-4 -left-4 bg-electric-blue-600 text-white px-3 py-1.5 rounded-full font-semibold text-xs shadow-lg">
              📱 Web + Mobile
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────── */}
      <section className="bg-dark-50/50 border-y border-electric-blue-500/10 py-8 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-electric-blue-400">100+</div>
              <div className="text-xs md:text-sm text-gray-400 mt-1">Species Care Sheets</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-neon-pink-400">Web + Mobile</div>
              <div className="text-xs md:text-sm text-gray-400 mt-1">Track Anywhere</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-green-400">Free</div>
              <div className="text-xs md:text-sm text-gray-400 mt-1">To Start, Forever</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-amber-400">11</div>
              <div className="text-xs md:text-sm text-gray-400 mt-1">Feeder Colony Species</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── For Keepers ─────────────────────────────────────────── */}
      <section id="keepers" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🕷️</span>
          <span className="text-electric-blue-400 font-bold text-lg uppercase tracking-widest">For Keepers</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-100">
          Every animal,<br />
          <span className="bg-gradient-primary bg-clip-text text-transparent">fully accounted for</span>
        </h2>
        <p className="text-xl text-gray-300 mb-16 max-w-2xl">
          Stop worrying about who ate last, who's in premolt, or when you last changed substrate.
          Tarantuverse keeps the whole picture in one dashboard.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-6 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/10 transition">
            <div className="text-3xl mb-3">🍴</div>
            <h3 className="text-lg font-bold mb-2 text-gray-100">Feeding Tracker & Predictions</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Log every feeding in seconds. Tarantuverse learns each animal's pattern and tells
              you exactly when they're ready to eat again — and flags refusals that signal premolt.
            </p>
            <div className="mt-4 bg-dark rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Chromatopelma cyaneopubescens</span>
                <span className="text-green-400 font-semibold">Feed today</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Poecilotheria metallica</span>
                <span className="text-orange-400 font-semibold">In premolt</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Grammostola pulchripes</span>
                <span className="text-electric-blue-400 font-semibold">Feed in 3 days</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-6 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/10 transition">
            <div className="text-3xl mb-3">📈</div>
            <h3 className="text-lg font-bold mb-2 text-gray-100">Growth & Molt Analytics</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Log weight and leg span after every molt. Beautiful charts show exactly how fast
              your slings and juveniles are developing over their entire life with you.
            </p>
            <div className="mt-4 bg-dark rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-2">Leg Span Growth</div>
              <div className="flex items-end gap-1 h-10">
                {[20, 30, 45, 50, 65, 75, 90, 100].map((h, i) => (
                  <div key={i} className="flex-1 bg-gradient-to-t from-neon-pink-500 to-electric-blue-500 rounded-sm" style={{height: `${h}%`, opacity: 0.6 + i * 0.05}}></div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.5″</span><span>→ 4.2″</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-50 border-2 border-neon-pink-500/30 rounded-2xl p-6 hover:border-neon-pink-500/50 hover:shadow-lg hover:shadow-neon-pink-500/10 transition relative">
            <div className="absolute top-4 right-4 bg-neon-pink-500/20 text-neon-pink-300 px-2 py-1 rounded-full text-xs font-bold">UNIQUE</div>
            <div className="text-3xl mb-3">🏜️</div>
            <h3 className="text-lg font-bold mb-2 text-gray-100">Substrate & Husbandry Logs</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              The only platform with dedicated substrate change tracking. Log rehouse dates,
              substrate type, and depth. Know exactly when each enclosure is due for maintenance.
            </p>
            <div className="mt-4 bg-dark rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-gray-300">
                <span>Last change</span><span className="text-neon-pink-400">6 weeks ago</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Substrate</span><span className="text-gray-100">Coco fiber 4″</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Next rehouse</span><span className="text-orange-400">Overdue ⚠</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-6 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/10 transition">
            <div className="text-3xl mb-3">📚</div>
            <h3 className="text-lg font-bold mb-2 text-gray-100">100+ Species Care Sheets</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Link any tarantula to our species database and get instant care requirements —
              temperature, humidity, enclosure size, feeding frequency, and safety warnings
              for OW species.
            </p>
          </div>

          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-6 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/10 transition">
            <div className="text-3xl mb-3">📸</div>
            <h3 className="text-lg font-bold mb-2 text-gray-100">Photo Timeline</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Build a visual record of every molt and growth stage. Cloud storage means your
              photos survive even if your device doesn't. Upload from your phone or desktop.
            </p>
          </div>

          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-6 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/10 transition">
            <div className="text-3xl mb-3">🔔</div>
            <h3 className="text-lg font-bold mb-2 text-gray-100">Smart Reminders</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Push notifications when an animal is overdue to feed, a substrate change is needed,
              or molt probability hits 70%. Your phone does the remembering so you don't have to.
            </p>
          </div>
        </div>

        {/* Real screenshot showcase */}
        <div className="mt-20">
          <p className="text-center text-sm text-gray-500 uppercase tracking-widest font-semibold mb-8">The real app — no mockups</p>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Dashboard screenshot */}
            <div className="bg-dark-50 rounded-2xl overflow-hidden border border-electric-blue-500/20 shadow-xl hover:border-electric-blue-500/40 transition">
              <div className="bg-dark px-4 py-2.5 flex items-center gap-2 border-b border-electric-blue-500/10">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"></div>
                </div>
                <div className="flex-1 bg-dark-50 rounded px-3 py-0.5 text-xs text-gray-500 text-center">tarantuverse.com/dashboard</div>
              </div>
              <img src="/screenshots/dashboard.png" alt="Tarantuverse dashboard showing feeding alerts and collection stats" className="w-full h-auto" />
            </div>
            {/* Tarantula detail screenshot */}
            <div className="bg-dark-50 rounded-2xl overflow-hidden border border-neon-pink-500/20 shadow-xl hover:border-neon-pink-500/40 transition">
              <div className="bg-dark px-4 py-2.5 flex items-center gap-2 border-b border-neon-pink-500/10">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"></div>
                </div>
                <div className="flex-1 bg-dark-50 rounded px-3 py-0.5 text-xs text-gray-500 text-center">tarantuverse.com/dashboard/tarantulas/…</div>
              </div>
              <img src="/screenshots/tarantula-hero.png" alt="Green Bottle Blue tarantula detail page with purple gradient and care info" className="w-full h-auto" />
            </div>
          </div>
          {/* Analytics screenshot full-width */}
          <div className="mt-6 bg-dark-50 rounded-2xl overflow-hidden border border-electric-blue-500/20 shadow-xl hover:border-electric-blue-500/40 transition">
            <div className="bg-dark px-4 py-2.5 flex items-center gap-2 border-b border-electric-blue-500/10">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"></div>
              </div>
              <div className="flex-1 bg-dark-50 rounded px-3 py-0.5 text-xs text-gray-500 text-center">tarantuverse.com/dashboard/analytics</div>
            </div>
            <img src="/screenshots/analytics.png" alt="Collection analytics showing sex distribution, species breakdown, and notable tarantulas" className="w-full h-auto" />
          </div>
        </div>
      </section>

      {/* ── QR Upload Callout ────────────────────────────────────── */}
      <section className="bg-dark-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-neon-pink-500/10 border border-neon-pink-500/30 text-neon-pink-300 rounded-full text-xs font-semibold mb-6">
                ✨ NEW FEATURE
              </div>
              <h2 className="text-4xl font-bold mb-6 text-gray-100">
                Scan a QR code.<br />
                <span className="bg-gradient-primary bg-clip-text text-transparent">Photo uploaded.</span>
              </h2>
              <p className="text-lg text-gray-300 mb-8 leading-relaxed">
                Stick a QR code on each enclosure. Scan it with any phone — no app needed —
                and you're instantly on that animal's upload page. Take the photo, hit send.
                Done. Every molt documented without hunting through menus.
              </p>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <span className="text-neon-pink-400 font-bold mt-0.5">→</span>
                  <span>Generate unique QR codes for each tarantula from the web app</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neon-pink-400 font-bold mt-0.5">→</span>
                  <span>Scan with any camera — opens a dedicated mobile upload page</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neon-pink-400 font-bold mt-0.5">→</span>
                  <span>Choose a photo or take one directly — it syncs to your collection</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neon-pink-400 font-bold mt-0.5">→</span>
                  <span>Works for guests too — let someone else document a feeding</span>
                </li>
              </ul>
            </div>

            {/* QR screenshot */}
            <div className="flex justify-center">
              <div className="relative max-w-xs w-full">
                <div className="bg-dark-50 border-2 border-electric-blue-500/20 rounded-2xl overflow-hidden shadow-2xl shadow-electric-blue-500/10">
                  <img
                    src="/screenshots/qr-label.png"
                    alt="QR label modal for Mexican Golden Red Rump enclosure"
                    className="w-full h-auto"
                  />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-neon-pink-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg shadow-neon-pink-500/40 transform rotate-6">
                  Print & stick!
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feeder Module ────────────────────────────────────────── */}
      <section id="feeders" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🦗</span>
          <span className="text-amber-400 font-bold text-lg uppercase tracking-widest">Feeder Module</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-full text-xs font-bold">
            NEW
          </span>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-100">
          Track the food chain too —<br />
          <span className="bg-gradient-to-r from-amber-400 to-neon-pink-400 bg-clip-text text-transparent">never run out of feeders</span>
        </h2>
        <p className="text-xl text-gray-300 mb-16 max-w-2xl">
          Raising your own crickets, roaches, or mealworms? Tarantuverse is now the only
          keeper app that tracks feeder colonies with life-stage inventory, care logs,
          and low-stock alerts — so you never open an empty cricket bin on feeding night.
        </p>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: feature cards */}
          <div className="space-y-4">
            <div className="bg-dark-50 border border-amber-500/20 rounded-2xl p-6 hover:border-amber-500/40 transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📦</div>
                <div>
                  <h3 className="text-lg font-bold mb-2 text-gray-100">Colony Inventory by Life Stage</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Track pinheads, small, medium, large, and adults as separate counts. Know
                    exactly which sizes you have for slings vs. adult females — at a glance.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-dark-50 border border-amber-500/20 rounded-2xl p-6 hover:border-amber-500/40 transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">⚠️</div>
                <div>
                  <h3 className="text-lg font-bold mb-2 text-gray-100">Low-Stock Alerts</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Set a threshold per colony and get flagged the moment you dip below it.
                    No more Friday-night "wait, am I out of mediums?" panic.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-dark-50 border border-amber-500/20 rounded-2xl p-6 hover:border-amber-500/40 transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
                <div>
                  <h3 className="text-lg font-bold mb-2 text-gray-100">Quick-Log Care Actions</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    One-tap logging for feeding the colony, watering, cleaning the enclosure,
                    or recording a die-off. Your whole feeder operation stays accountable.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-dark-50 border border-amber-500/20 rounded-2xl p-6 hover:border-amber-500/40 transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📚</div>
                <div>
                  <h3 className="text-lg font-bold mb-2 text-gray-100">11 Feeder Species, Pre-Seeded</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Crickets (banded & house), dubias, red runners, discoids, superworms,
                    mealworms, hornworms, BSFL, and isopods — all with care defaults baked in.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: colony card mock */}
          <div className="relative">
            <div className="bg-dark-50 border-2 border-amber-500/20 rounded-2xl p-6 shadow-2xl shadow-amber-500/10">
              <div className="flex items-center justify-between mb-5 pb-5 border-b border-amber-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-2xl">🦗</div>
                  <div>
                    <div className="font-bold text-gray-100">Banded Cricket Colony</div>
                    <div className="text-xs text-gray-400"><em>Gryllodes sigillatus</em> · Breeding mode</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-green-500/20 text-green-300 rounded-lg text-xs font-bold">Stocked</span>
              </div>

              {/* Life-stage inventory */}
              <div className="mb-5">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Life-Stage Inventory</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-dark border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Pinheads</div>
                    <div className="font-bold text-amber-300 text-lg">240</div>
                  </div>
                  <div className="bg-dark border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Small</div>
                    <div className="font-bold text-amber-300 text-lg">180</div>
                  </div>
                  <div className="bg-dark border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Medium</div>
                    <div className="font-bold text-amber-300 text-lg">95</div>
                  </div>
                  <div className="bg-dark border border-red-500/30 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Large</div>
                    <div className="font-bold text-red-400 text-lg">12 ⚠</div>
                  </div>
                  <div className="bg-dark border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Adults</div>
                    <div className="font-bold text-amber-300 text-lg">40</div>
                  </div>
                  <div className="bg-dark border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Total</div>
                    <div className="font-bold text-gray-100 text-lg">567</div>
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Quick Log</div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-dark border border-amber-500/20 rounded-lg py-3 text-center text-xs text-amber-200 hover:border-amber-500/40 transition cursor-default">🍽️ Feed</div>
                  <div className="bg-dark border border-electric-blue-500/20 rounded-lg py-3 text-center text-xs text-electric-blue-200 hover:border-electric-blue-500/40 transition cursor-default">💧 Water</div>
                  <div className="bg-dark border border-green-500/20 rounded-lg py-3 text-center text-xs text-green-200 hover:border-green-500/40 transition cursor-default">🧹 Clean</div>
                  <div className="bg-dark border border-red-500/20 rounded-lg py-3 text-center text-xs text-red-200 hover:border-red-500/40 transition cursor-default">💀 Die-off</div>
                </div>
              </div>

              {/* Low stock alert */}
              <div className="mt-5 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-red-300">Large crickets low</div>
                  <div className="text-xs text-gray-400">12 remaining · threshold 25</div>
                </div>
              </div>
            </div>

            <div className="absolute -top-4 -right-4 bg-amber-500 text-gray-900 px-4 py-2 rounded-full font-bold text-sm shadow-lg shadow-amber-500/40 transform rotate-6">
              Industry First
            </div>
          </div>
        </div>

        <div className="mt-12 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <p className="text-gray-300">
            <strong className="text-amber-300">No other keeper app tracks feeders.</strong>{' '}
            If you breed your own, this replaces three spreadsheets and a wall calendar.
          </p>
          <Link href="/register" className="px-6 py-3 bg-amber-500 text-gray-900 rounded-xl hover:bg-amber-400 transition font-bold whitespace-nowrap">
            Start Tracking Free
          </Link>
        </div>
      </section>

      {/* ── For Breeders ────────────────────────────────────────── */}
      <section id="breeders" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🧬</span>
          <span className="text-neon-pink-400 font-bold text-lg uppercase tracking-widest">For Breeders</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-100">
          Manage your projects<br />
          <span className="bg-gradient-primary bg-clip-text text-transparent">from pairing to sale</span>
        </h2>
        <p className="text-xl text-gray-300 mb-16 max-w-2xl">
          Stop tracking breeding projects in notebooks and spreadsheets.
          The Tarantuverse breeding module handles pairings, egg sac incubation,
          and offspring records — all in one place.
        </p>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-dark-50 border border-neon-pink-500/20 rounded-2xl p-6 hover:border-neon-pink-500/40 hover:shadow-lg hover:shadow-neon-pink-500/10 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">💑</div>
            <h3 className="text-lg font-bold mb-3 text-gray-100">Pairing Logs</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              Record every pairing attempt with date, type (natural / assisted), and outcome.
              Link to the male and female from your collection or another keeper's.
            </p>
            <div className="bg-dark rounded-xl p-3 text-xs space-y-2">
              <div className="flex justify-between text-gray-300">
                <span>Paired</span><span className="text-gray-100">Mar 12, 2026</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Type</span><span className="text-gray-100">Natural</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Outcome</span><span className="text-green-400 font-semibold">Successful ✓</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-50 border border-neon-pink-500/20 rounded-2xl p-6 hover:border-neon-pink-500/40 hover:shadow-lg hover:shadow-neon-pink-500/10 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">🥚</div>
            <h3 className="text-lg font-bold mb-3 text-gray-100">Egg Sac Monitoring</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              Log egg sac production, track incubation conditions, and record development stages.
              Know at a glance how many projects are active and their estimated hatch dates.
            </p>
            <div className="bg-dark rounded-xl p-3 text-xs space-y-2">
              <div className="flex justify-between text-gray-300">
                <span>Egg sac pulled</span><span className="text-gray-100">Day 28</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Incubation temp</span><span className="text-gray-100">78°F</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Est. hatch</span><span className="text-neon-pink-400 font-semibold">~30 days</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-50 border border-neon-pink-500/20 rounded-2xl p-6 hover:border-neon-pink-500/40 hover:shadow-lg hover:shadow-neon-pink-500/10 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">🕷️</div>
            <h3 className="text-lg font-bold mb-3 text-gray-100">Offspring Records</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              Track every sling individually — or by count. Mark each as available, sold, kept,
              or deceased. Your breeding history becomes a searchable record for future projects.
            </p>
            <div className="bg-dark rounded-xl p-3 text-xs space-y-2">
              <div className="flex justify-between text-gray-300">
                <span>Total offspring</span><span className="text-gray-100">87 slings</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Available</span><span className="text-green-400 font-semibold">42</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Sold / Traded</span><span className="text-electric-blue-400">31</span>
              </div>
            </div>
          </div>
        </div>

        {/* Breeding screenshot */}
        <div className="mb-12 bg-dark-50 rounded-2xl overflow-hidden border border-neon-pink-500/20 shadow-xl">
          <div className="bg-dark px-4 py-2.5 flex items-center gap-2 border-b border-neon-pink-500/10">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"></div>
            </div>
            <div className="flex-1 bg-dark-50 rounded px-3 py-0.5 text-xs text-gray-500 text-center">tarantuverse.com/dashboard/breeding</div>
          </div>
          <img src="/screenshots/breeding.png" alt="Breeding Records showing pairings, egg sacs, and offspring tabs" className="w-full h-auto" />
        </div>

        <div className="bg-gradient-to-r from-neon-pink-500/10 to-electric-blue-500/10 border border-neon-pink-500/20 rounded-2xl p-8 text-center">
          <p className="text-lg text-gray-300 mb-4">
            The breeding module is included in <strong className="text-neon-pink-300">Premium</strong>.
            Start a free account and upgrade when your first pairing is ready.
          </p>
          <Link href="/register" className="inline-block px-8 py-3 bg-gradient-brand text-white rounded-xl hover:shadow-lg hover:shadow-neon-pink-500/30 transition font-semibold">
            Start Free → Upgrade for Breeding
          </Link>
        </div>
      </section>

      {/* ── Community & Sellers ──────────────────────────────────── */}
      <section id="community" className="bg-dark-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🌐</span>
            <span className="text-green-400 font-bold text-lg uppercase tracking-widest">Community & Sellers</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-100">
            Your collection,<br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">seen by the right people</span>
          </h2>
          <p className="text-xl text-gray-300 mb-16 max-w-2xl">
            Public profiles, keeper forums, and direct messaging — everything you need to
            connect, share, and find homes for your offspring.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-dark border border-green-500/20 rounded-2xl p-6 hover:border-green-500/40 transition">
              <div className="text-3xl mb-3">👤</div>
              <h3 className="font-bold mb-2 text-gray-100">Keeper Profiles</h3>
              <p className="text-gray-300 text-sm">Public profiles with your collection, experience level, specialties, and social links. Let buyers and the community find you.</p>
            </div>
            <div className="bg-dark border border-green-500/20 rounded-2xl p-6 hover:border-green-500/40 transition">
              <div className="text-3xl mb-3">💬</div>
              <h3 className="font-bold mb-2 text-gray-100">Forums</h3>
              <p className="text-gray-300 text-sm">Category-based discussion boards for care questions, introductions, and species deep-dives. Moderated by keepers.</p>
            </div>
            <div className="bg-dark border border-green-500/20 rounded-2xl p-6 hover:border-green-500/40 transition">
              <div className="text-3xl mb-3">📩</div>
              <h3 className="font-bold mb-2 text-gray-100">Direct Messages</h3>
              <p className="text-gray-300 text-sm">Private conversations with other keepers. Arrange trades, ask care questions, or coordinate pickups for local sales.</p>
            </div>
            <div className="bg-dark border border-green-500/20 rounded-2xl p-6 hover:border-green-500/40 transition">
              <div className="text-3xl mb-3">📢</div>
              <h3 className="font-bold mb-2 text-gray-100">Activity Feed</h3>
              <p className="text-gray-300 text-sm">Follow other keepers and see their molt photos, new additions, and breeding updates in a live activity feed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Also New ────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12">
          <div>
            <div className="text-electric-blue-400 font-bold text-sm uppercase tracking-widest mb-2">Also new this quarter</div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100">
              Small wins that make a big difference
            </h2>
          </div>
          <p className="text-gray-400 max-w-md text-sm">
            Polish, security, and quality-of-life upgrades that shipped alongside the
            headline features.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-6 hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/10 transition">
            <div className="w-12 h-12 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">🏆</div>
            <h3 className="font-bold mb-2 text-gray-100">18 Achievements</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Earn badges for collection milestones, feeding streaks, molt witnesses,
              breeding firsts, and community posts.
            </p>
          </div>

          <div className="bg-dark-50 border border-neon-pink-500/20 rounded-2xl p-6 hover:border-neon-pink-500/40 hover:shadow-lg hover:shadow-neon-pink-500/10 transition">
            <div className="w-12 h-12 bg-neon-pink-500/10 border border-neon-pink-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">🔍</div>
            <h3 className="font-bold mb-2 text-gray-100">Global Search (⌘K)</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Press Cmd/Ctrl+K from anywhere to jump to any tarantula, species,
              keeper, or forum thread instantly.
            </p>
          </div>

          <div className="bg-dark-50 border border-green-500/20 rounded-2xl p-6 hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/10 transition">
            <div className="w-12 h-12 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">🌟</div>
            <h3 className="font-bold mb-2 text-gray-100">Discover Page</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Trending threads, active keepers, popular species, and new members —
              your gateway into the community.
            </p>
          </div>

          <div className="bg-dark-50 border border-amber-500/20 rounded-2xl p-6 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10 transition">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-2xl mb-4">📦</div>
            <h3 className="font-bold mb-2 text-gray-100">GDPR Data Export</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Download everything — collection, logs, photos, forum history —
              as JSON, CSV, or a full ZIP whenever you want.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-gray-100">Up and running in minutes</h2>
          <p className="text-xl text-gray-300">No setup fee, no tutorial required</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center font-bold text-white text-xl shadow-lg">1</div>
            <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 pt-12 h-full">
              <div className="text-4xl mb-4">➕</div>
              <h3 className="text-xl font-bold mb-3 text-gray-100">Add Your Collection</h3>
              <p className="text-gray-300 text-sm leading-relaxed">Create a profile for each tarantula. Search our species database to auto-fill care requirements. Add a photo from your camera roll.</p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center font-bold text-white text-xl shadow-lg">2</div>
            <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 pt-12 h-full">
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-xl font-bold mb-3 text-gray-100">Log as You Go</h3>
              <p className="text-gray-300 text-sm leading-relaxed">Tap to log a feeding, molt, or substrate change in under 10 seconds. Use QR codes on your enclosures for even faster photo uploads.</p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center font-bold text-white text-xl shadow-lg">3</div>
            <div className="bg-dark-50 border border-electric-blue-500/20 rounded-2xl p-8 pt-12 h-full">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold mb-3 text-gray-100">Let the Data Work</h3>
              <p className="text-gray-300 text-sm leading-relaxed">Predictions, reminders, growth charts, and breeding records — Tarantuverse surfaces the insights so you can focus on the hobby.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison ──────────────────────────────────────────── */}
      <section className="bg-dark-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-gray-100">Why not just use a spreadsheet?</h2>
            <p className="text-xl text-gray-300">We asked ourselves the same thing</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-red-900/10 border-2 border-red-500/30 rounded-2xl p-8">
              <h3 className="font-bold text-gray-100 mb-6 text-xl flex items-center gap-2">
                <span className="text-2xl">📊</span> Spreadsheets & Notebooks
              </h3>
              <ul className="space-y-3 text-gray-300 text-sm">
                {['Manual date math every feeding', 'No push notification reminders', 'No photo storage or organization', 'Can\'t predict premolt or next feeding', 'Lost when your device dies', 'No mobile app — awkward at the enclosure', 'Impossible to share with the community', 'No breeding project tracking'].map(text => (
                  <li key={text} className="flex items-start gap-2">
                    <span className="text-red-400 flex-shrink-0 font-bold">✗</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-green-900/10 border-2 border-green-500/30 rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">BETTER</div>
              <h3 className="font-bold text-gray-100 mb-6 text-xl flex items-center gap-2">
                <span className="text-2xl">🕷️</span> Tarantuverse
              </h3>
              <ul className="space-y-3 text-gray-300 text-sm">
                {['Automatic feeding predictions per animal', 'Push reminders when feedings are overdue', 'Cloud photo storage with QR scan upload', 'Premolt detection from feeding patterns', 'Cloud sync — always backed up', 'Full-featured iOS & Android app', 'Public profiles, forums & direct messages', 'Complete breeding module (premium)'].map(text => (
                  <li key={text} className="flex items-start gap-2">
                    <span className="text-green-400 flex-shrink-0 font-bold">✓</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <section id="pricing" className="bg-dark-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-gray-100">Simple, honest pricing</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Start free. Upgrade when you're ready. No tricks, no hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free */}
            <div className="bg-dark border-2 border-electric-blue-500/30 rounded-2xl p-6">
              <h3 className="text-2xl font-bold mb-2 text-gray-100">Free Forever</h3>
              <div className="mb-4"><span className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">$0</span></div>
              <p className="text-gray-400 mb-6 text-sm">Perfect for casual keepers</p>
              <ul className="space-y-3 mb-6 text-sm">
                {['Up to 15 tarantulas', '5 photos per tarantula', 'Feeding & molt tracking', 'Growth analytics', 'Web + mobile apps', 'Species care database', 'Community access'].map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-electric-blue-400 font-bold">✓</span>
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block w-full py-3 text-center border-2 border-electric-blue-500/50 text-electric-blue-300 rounded-xl hover:bg-electric-blue-500/10 transition font-semibold">
                Start Free
              </Link>
            </div>

            {/* Monthly */}
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 border-2 border-neon-pink-500/50 rounded-2xl p-6 transform scale-105 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-block px-3 py-1 bg-gradient-brand text-white rounded-full text-xs font-bold shadow-lg">MOST POPULAR</span>
              </div>
              <h3 className="text-2xl font-bold mb-2 text-gray-100 mt-2">Premium</h3>
              <div className="mb-4">
                <span className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">$4.99</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-neon-pink-300 mb-6 text-sm font-semibold">Cancel anytime</p>
              <ul className="space-y-3 mb-6 text-sm">
                {['Everything in Free, plus:', 'Unlimited tarantulas', 'Unlimited photos', 'Breeding module (pairings, egg sacs, offspring)', 'Advanced analytics & predictions', 'Priority support'].map((f, i) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-neon-pink-400 font-bold">{i === 0 ? '→' : '✓'}</span>
                    <span className={i === 0 ? 'text-gray-200 font-semibold' : 'text-gray-200'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block w-full py-3 text-center bg-gradient-brand text-white rounded-xl hover:shadow-lg hover:shadow-neon-pink-500/50 transition font-bold">
                Go Premium
              </Link>
            </div>

            {/* Yearly */}
            <div className="bg-dark border-2 border-electric-blue-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold text-gray-100">Yearly</h3>
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">SAVE 25%</span>
              </div>
              <div className="mb-4">
                <span className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">$44.99</span>
                <span className="text-gray-400">/year</span>
              </div>
              <p className="text-gray-400 mb-6 text-sm"><strong className="text-green-400">$3.75/mo</strong> — 2 months free</p>
              <ul className="space-y-3 mb-6 text-sm">
                {['All Premium features', '2 months free vs monthly', 'Best value for serious keepers'].map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-electric-blue-400 font-bold">✓</span>
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block w-full py-3 text-center border-2 border-electric-blue-500/50 text-electric-blue-300 rounded-xl hover:bg-electric-blue-500/10 transition font-semibold">
                Get Yearly
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────── */}
      <section className="bg-gradient-primary py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            Your collection deserves better than a spreadsheet
          </h2>
          <p className="text-xl text-white/80 mb-10 leading-relaxed">
            Join keepers, breeders, and sellers who track their animals the right way.
            Free to start, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="px-10 py-4 bg-white text-gray-900 rounded-xl font-bold text-lg hover:shadow-2xl transform hover:scale-105 transition">
              Start Free — No Card Needed 🚀
            </Link>
            <Link href="/login" className="px-10 py-4 bg-white/10 border-2 border-white/30 text-white rounded-xl font-semibold text-lg hover:bg-white/20 transition">
              Log In
            </Link>
          </div>
          <p className="mt-6 text-white/60 text-sm">Free forever for up to 15 tarantulas · Premium from $4.99/mo</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="bg-dark border-t border-electric-blue-500/10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TarantuverseLogoTransparent className="w-8 h-8" />
                <span className="font-bold text-gray-100">Tarantuverse</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">Built by keepers, for keepers. The only app built specifically for tarantula enthusiasts.</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-100 mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/features" className="hover:text-electric-blue-400 transition">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-electric-blue-400 transition">Pricing</Link></li>
                <li><Link href="/species" className="hover:text-electric-blue-400 transition">Species Database</Link></li>
                <li><a href="#breeders" className="hover:text-electric-blue-400 transition">Breeding Module</a></li>
                <li><a href="#feeders" className="hover:text-amber-400 transition">Feeder Module</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-100 mb-3">Community</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/community/forums" className="hover:text-electric-blue-400 transition">Forums</Link></li>
                <li><Link href="/community/board" className="hover:text-electric-blue-400 transition">Activity Board</Link></li>
                <li><Link href="/blog" className="hover:text-electric-blue-400 transition">Blog</Link></li>
                <li><Link href="/help" className="hover:text-electric-blue-400 transition">Help Center</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-100 mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/privacy" className="hover:text-electric-blue-400 transition">Privacy Policy</Link></li>
                <li><Link href="/contact" className="hover:text-electric-blue-400 transition">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-electric-blue-500/10 pt-8 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Tarantuverse. Built by keepers, for keepers. 🕷️
          </div>
        </div>
      </footer>

    </div>
  )
}
