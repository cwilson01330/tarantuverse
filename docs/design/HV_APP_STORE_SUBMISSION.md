# Herpetoverse — App Store submission copy (v1.0.0)

Everything here is written to be true of the app as it actually ships. Nothing
claims a user base, a track record, or a feature that isn't in the build.

---

## App Review notes

Updated 2026-10-12 for 1.2.0 (runtime 1.3.0). Everything that used to live on
a separate Settings screen is now on the **You** tab (`/settings` only
redirects there), so the paths below changed.

Paste into **App Review Information → Notes**. Fill the two credential lines
before submitting — the app is fully gated behind login and a reviewer with no
account cannot see anything past the sign-in screen.

**Use a NON-premium demo account.** On a premium account the Premium row reads
"active" and the plans sheet never opens, so the reviewer can't see the
paywall or the subscription terms — a 2.1 / 3.1.2 bounce.
Keep it at or under 5 animals with a few feeding and shed logs.

```
DEMO ACCOUNT
Email:    <fill in>
Password: <fill in>

This account contains a few animals with feeding and shed logs, so the main
screens are populated on first launch. It is on the free plan so the
subscription screen is visible.

ABOUT THE APP
Herpetoverse is a husbandry tracker for reptile and amphibian keepers. Keepers
log feedings, weights, sheds and photos per animal, browse species care sheets,
and track breeding projects. It shares an account system with our existing app,
Tarantuverse (App Store ID <fill in>) — the same login works on both.

FREE TIER AND IN-APP PURCHASE
The app is free to use. Feeding, weight, shed, photo and health logs are free
on every plan. Herpetoverse Premium (In-App Purchase only) adds: more than 5 animals, breeding
(pairings, clutches, offspring), feeder inventory, co-keepers, and sitter
logging. There is no external purchase path or link in the app.

To review the plans and subscription terms: You tab → Premium. The same sheet
opens when a free keeper tries to add a 6th animal, start a pairing, or add a
feeder. Restore purchases: You tab → Premium section → Restore purchases.

SIGN IN
Email/password, Sign in with Apple, and Google are all offered. Sign in with
Apple does not collect data beyond name and email.

ACCOUNT DELETION
You tab → Delete account (bottom of the screen). Requires typing DELETE to
confirm, then permanently removes the account and all associated records.

NOTIFICATIONS
An optional daily feeding digest. Permission is requested in context, and it
can be turned off (or its hour and quiet hours changed) in
You tab → Notification settings.
```

---

## App description

Fact-checked against the shipping build 2026-07-26. Two claims were removed
from an earlier draft because they aren't true of Herpetoverse:

- *"enclosure and substrate changes"* — HV mobile has no enclosure screens and
  no substrate-change logging. That's a Tarantuverse feature.
- *"keeper-verified"* care sheets — implies a verification process that doesn't
  exist. The sourcing sentence that follows is the honest version.

```
Herpetoverse is a husbandry tracker for reptile and amphibian keepers. Log your
collection, stay on top of feedings and sheds, and keep every animal's history
in one place — from a single ball python to a full rack room.

WHAT YOU CAN TRACK
- Snakes, lizards, turtles, tortoises, frogs & toads, salamanders & newts —
  plus an "Other" catch-all for anything else you keep.
- Feeding logs, with a Feeding Day view to log a whole room at once.
- Shed logs, weights and growth over time, photos, and notes on each animal.

CARE SHEETS
Browse care sheets for commonly kept species — temperature, humidity, enclosure
and diet. Every entry is backed by multiple independent sources and written
honestly, with ranges instead of false precision.

FEEDER KEEPING
Keep frozen or live feeders? Track what's in your freezer — mice, rats, fish,
insects, chicks — by size, and get a heads-up when you're running low. No more
thawing your last pinky by surprise.

BREEDING
Log pairings and clutches and plan projects, with a morph and genetics
calculator for ball pythons and leopard geckos.

STAY ON SCHEDULE
Optional reminders and a daily digest help you keep feedings and maintenance on
track — without nagging.

BRING YOUR DATA
- Import an existing collection from a spreadsheet.
- Export everything — JSON, CSV, or a full archive with photos — anytime.
  Your data is yours.
- Hand off or sell an animal, with its full history, to another keeper via a
  transfer link.

SHARE, IF YOU WANT
Turn on a public keeper profile to share your collection, or keep everything
private. Your call.

FREE TO START
Herpetoverse is free to use, with no ads. The free plan covers up to 5 animals.

ONE ACCOUNT
Also keep tarantulas or other inverts? Your Herpetoverse login is the same
account you use for Tarantuverse — one profile across both apps.

Built by a keeper, for keepers. We're a small, honest project just getting
started — tell us what you'd like to see next.
```

---

## Promotional text (170 char limit)

```
A husbandry tracker for reptile and amphibian keepers. Feedings, sheds, weights,
feeder stock and breeding — with care sheets that admit what isn't known.
```

## Google Play short description (80 char limit)

```
Husbandry tracker for reptile and amphibian keepers. Feedings, sheds, breeding.
```

---

## Keywords (100 char limit, comma separated, no spaces)

```
reptile,herp,snake,gecko,lizard,husbandry,feeding,shed,tracker,breeding,morph,tortoise,frog
```

---

## Support / marketing URLs

- Support URL: https://herpetoverse.com  (confirm a support or contact route exists)
- Marketing URL: https://herpetoverse.com
- Privacy Policy URL: https://herpetoverse.com/privacy-policy
- Terms of Use: https://herpetoverse.com/terms

**Verify all four load before submitting.** A dead legal link is a soft
rejection, and Terms is linked from the You tab, the plans sheet and the registration screen.

---

## Age rating

Nothing in the app warrants a raised rating. Note during the questionnaire that
the app contains user-generated content only in the sense of species
submissions and keeper profiles; there is no open messaging or public feed on
mobile at v1.0.0.

---

## Pre-submit checklist

- [ ] Demo credentials filled into the review notes above, account populated, account is NOT premium
- [ ] Apple sign-in button renders and completes a sign-in on the new build
- [ ] Terms checkbox blocks "Create account" until ticked
- [ ] You tab profile header + avatar upload work
- [ ] All four URLs above load
- [ ] Screenshots for 6.7" and 6.5"
- [ ] Subscription disclosure visible on the paywall (You → Premium) — only renders when the store returns products, so the IAPs must be attached to this version
