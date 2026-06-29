# App Store release — April 2026

Single-doc kit for shipping the next Tarantuverse iOS build with fresh
screenshots and updated marketing copy. Work through top to bottom.

---

## 1. Pre-flight

- [ ] Bump version in `apps/mobile/app.json` from `0.1.7` → `0.2.0`
      (semver minor — the listing rework + many new features warrant
      something bigger than a patch).
- [ ] Bump iOS `buildNumber` (or let EAS auto-increment if configured).
- [ ] Confirm latest mobile work is on `main` and `eas update --branch
      production` is current — JS-only fixes don't need a native rebuild,
      but the screenshots will include those in-app changes.
- [ ] Spot-check the running app on a physical iPhone 16 Pro Max (or
      simulator) for the screenshot session.

---

## 2. Native build + submit

```powershell
# From repo root
cd apps/mobile

# Production build (creates an .ipa for App Store submission)
eas build --platform ios --profile production

# When the build finishes, submit it to App Store Connect
eas submit --platform ios --latest

cd ../..
```

The build takes ~15–25 min on EAS. Submit lands the .ipa in App Store
Connect; from there you fill out the listing fields below and click
"Submit for Review."

---

## 3. Listing copy

Paste into the matching fields in App Store Connect. **Honesty-first
principle applies — no fabricated user counts or testimonials.**

### App Name (30 chars)

```
Tarantuverse
```

### Subtitle (30 chars)

```
Tarantula keeper companion
```

> *Alt options: "Tarantula care, simplified" (29) · "Track every spider
> in your room" (30) · "Husbandry, made easy" (20)*

### Promotional Text (170 chars — editable any time without re-review)

```
New: premolt prediction, QR enclosure labels, achievements, and a
species library now over 100 strong. Free for up to 15 tarantulas.
```

### Description (4000 chars)

```
Tarantuverse is the husbandry companion built specifically for tarantula
keepers — log every feeding, molt, and substrate change, link each
animal to its care sheet, and connect with other keepers in one place.
No more juggling notebooks, spreadsheets, or generic pet apps that
don't understand what an arboreal needs.

— WHAT YOU CAN TRACK —

• Feedings, molts, substrate changes, and free-form care notes
• Photos for every animal, organized by date and event
• Enclosure setup details — size, substrate type, depth, target temp
  and humidity, water dish, misting schedule
• Breeding projects: pairings, egg sacs, and offspring records
• Per-species care sheets with temperature, humidity, enclosure size,
  feeding frequency, safety warnings, and lifespan ranges

— SMART FEATURES —

• Premolt prediction: an algorithm that watches feeding refusal patterns
  and molt-interval history to flag spiders likely entering premolt
• Smart feeding reminders that adjust to each species and life stage
• "Days since last fed" indicators with color-coded urgency
• Growth analytics: weight and leg-span charts across every molt

— SPECIES LIBRARY —

• 100+ species with full husbandry care sheets, photos, and licensed
  attribution from Wikimedia Commons
• Care levels marked beginner / intermediate / advanced
• Safety badges for urticating hairs and medically-significant venom
• Tap any species in the database to add it to your collection in a
  single step — care fields auto-fill from the sheet

— QR ENCLOSURE LABELS —

• Generate a unique QR code for each enclosure, print, and stick on
  the lid. Scan with any phone camera (no app required) to land on a
  guest upload page where anyone you trust can document a feeding or
  molt photo for you. Permanent public profiles available too — share
  your collection with one tap.

— COMMUNITY —

• Public keeper profiles with collection visibility you control
• Forums organized by category (care, breeding, photos, etc.)
• Direct messaging between keepers
• Activity feed of new tarantulas, molts, and feedings from the
  keepers you follow
• Achievements for collection milestones, feeding streaks, molt
  witnesses, and breeding firsts

— BUILT FOR TRUST —

• Your data is yours: export everything (collection, logs, photos,
  forum history) as JSON, CSV, or a full ZIP whenever you want
• Photo storage on Cloudflare R2 — your photos survive even if your
  device doesn't
• Sign in with Apple, Google, or email
• Dark mode throughout
• No ads, ever

— PRICING —

• Free forever for up to 15 tarantulas, with full access to species
  care sheets, photos, feeding/molt tracking, and the community
• Premium ($4.99/mo or $44.99/yr) unlocks unlimited tarantulas,
  unlimited photos, the breeding module, and advanced analytics

Built by keepers, for keepers. 🕷️

Questions, feedback, or species data corrections? Email us at
admin@tarantuverse.com or reach out via the in-app help center.
```

### What's New in this Version (4000 chars)

```
Big update — listing refresh + a wave of features that landed
across April:

• Premolt prediction is now live. Open any tarantula's profile to see
  whether they're likely entering premolt, with a confidence rating
  based on feeding refusals and molt history.
• 100+ species in the care-sheet library, most with curated photos
  from Wikimedia Commons (full attribution included).
• QR enclosure labels — print one per enclosure, scan to upload
  feeding/molt photos without unlocking your phone.
• Achievements: 18 badges to earn across collection size, feeding
  streaks, molt-witness count, breeding milestones, and community
  participation.
• Universal search (tap the magnifier in the tab bar): jump to any
  tarantula, species, keeper, or forum thread instantly.
• Direct messaging is faster — your sent messages appear instantly
  with optimistic delivery, and the conversation no longer scrolls
  away from you when new replies arrive.
• Smart feeding reminders adjust to each species' published feeding
  cadence per life stage, so a sling and an adult get appropriately
  different schedules.
• "Last fed" badges now reflect the last accepted feeding instead of
  the last attempt — a refused offer is tracked as a refusal, not a
  feeding.
• Dark mode polish across collection cards, public keeper profiles,
  and species sheets.
• Cold-start handling on the login screen: when our server has been
  idle, you'll now see a "Waking up" indicator instead of a stuck
  spinner.
• Stability: error boundaries on every main tab so a single render
  bug can't take down the whole app.

Bug fixes:
• Public profile tarantula cards now actually open the spider you
  tapped (previously did nothing on certain links).
• Feeding date math now respects your local timezone, so an evening
  feeding doesn't read as "0 days ago" the next morning.
• Universal search results for keepers now route to the right page.

Thank you to the beta testers who reported these — keep the feedback
coming via the in-app contact form.
```

### Keywords (100 chars, comma-separated, no spaces after commas)

```
tarantula,spider,arachnid,husbandry,keeper,molt,feeding,exotic,inverts,breeder,care sheet,enclosure
```

> *Note: Apple counts the field as 100 chars. The line above is 99.
> Avoid duplicating words from the App Name + Subtitle since Apple
> already indexes those. "Tarantuverse" is automatic.*

### Support URL

```
https://tarantuverse.com/help
```

### Marketing URL

```
https://tarantuverse.com
```

### Privacy Policy URL

```
https://tarantuverse.com/privacy
```

### Category

- **Primary:** Lifestyle (recommended for niche-hobby tracking apps)
- **Secondary:** Reference (the species database)

### Age Rating

- 4+ (no objectionable content; tarantulas are not adult content)
- One thing to flag in the rating questionnaire: the app has user-
  generated content (forums, DMs). Apple will downgrade the rating
  unless you confirm moderation tooling is in place — which it is
  (block, report, content reports queue, admin moderation panel).

---

## 4. Screenshots — capture plan

Apple requires screenshots at the **6.9" iPhone display** size
(1320 × 2868 portrait, e.g. iPhone 16 Pro Max). One set covers all
iPhone sizes if the others are not provided. Capture **6 to 8** —
quality matters more than count.

For each, populate the device with **realistic-looking data** before
capturing. Don't use lorem-ipsum or empty states.

### Recommended shot list (in order)

1. **Collection grid (Tarantulas tab)**
   - Show 4–6 tarantulas with photos, sex badges, and "days since fed"
     pills. Mix of overdue (red) and on-track (green) for visual
     interest.
   - Headline overlay (added in design tool): *"Every spider, accounted for."*

2. **Tarantula detail page**
   - Hero photo, sex/scientific name, feeding stats card, growth
     chart visible.
   - Headline: *"Track feedings, molts, and growth in one tap."*

3. **Premolt prediction card**
   - The premolt alert section on the tarantula detail OR the
     dashboard premolt watch-list.
   - Headline: *"Know when they're about to molt — before they do."*

4. **Species care sheet**
   - With image, care-level badge, climate values, and safety badges
     (urticating / venom) visible.
   - Headline: *"100+ species, fully detailed care sheets."*

5. **QR enclosure label modal**
   - The label-design view with size picker + preview.
   - Headline: *"Print a label, scan to upload photos."*

6. **Activity feed / community tab**
   - Mix of feedings, molts, and follow events from other keepers.
   - Headline: *"A community of keepers in your pocket."*

7. **Achievements gallery**
   - Show a row of earned badges + locked silhouettes.
   - Headline: *"Earn badges as your collection grows."*

8. **Dark mode dashboard** (optional 8th)
   - Demonstrates polish; Apple reviewers like seeing this.
   - Headline: *"Beautiful in light or dark."*

### Capture method

```
Settings → Developer → ⌘+S in Simulator OR
Side button + Volume Up on a device
```

For consistent device frames + headline overlays, run the raw shots
through **fastlane frameit**, **Mockuuups Studio**, or **Picsew**.
Keep the headline copy under 8 words; Apple compresses small text
in the App Store gallery.

---

## 5. Final checklist before "Submit for Review"

- [ ] Build uploaded and processed in App Store Connect (~15 min after
      `eas submit`).
- [ ] Version bumped, build number unique.
- [ ] All 6+ screenshots uploaded at 1320 × 2868.
- [ ] Description, subtitle, promo text, what's new, keywords filled.
- [ ] Privacy questionnaire answered (data collected: email, photos,
      usage analytics via PostHog; not linked to identity for
      analytics; not used for ads).
- [ ] Sign in with Apple toggle confirmed enabled in capabilities.
- [ ] App Review notes (use the field in App Store Connect):

> ```
> Tarantuverse is a tarantula husbandry tracker. To test the full
> experience, please use the demo account:
>     email: reviewer@tarantuverse.com
>     password: <SET ONE BEFORE SUBMITTING>
>
> The app links to a backend API at tarantuverse-api.onrender.com.
> If you experience a 20–30 second delay on the first request, the
> server is waking up from idle (Render free tier). The login
> screen displays a "Waking up our server" indicator in this case.
> ```

- [ ] Hit Submit. Apple review usually takes 24–48 hours.

---

## 6. After approval

- [ ] Reply to your beta testers in TestFlight letting them know the
      App Store version is live.
- [ ] Post a brief release note to the in-app announcements feed
      (admin → announcements) so existing users see the update list
      without leaving the app.
- [ ] Add a TASKS entry to circle back on the App Store reviews after
      one week — early reviews shape the listing's ranking.
