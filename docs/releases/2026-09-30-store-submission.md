# Store submission — Tarantuverse 1.8.0 / Herpetoverse 1.1.0 (2026-09-30)

Last store releases: Tarantuverse 1.7 (2026-07-13), Herpetoverse 1.0 (2026-08-09).
Notes cover everything since then. App Store "What's New" allows 4,000 characters;
Google Play release notes allow **500 per language**, so Play gets the short versions.

---

## Tarantuverse 1.8.0

### App Store — What's New

```
Share cards
Turn any animal, or a fresh molt, into a clean specimen card for Instagram, TikTok, Discord or your group chat. You pick exactly which details appear. Sharing never changes who can see your collection, and if you make a link to a card you can turn it off at any time.

Keep together
- Co-keepers (Premium): invite someone to help with your collection as a viewer, logger or keeper. Every entry shows who logged it.
- Sitter links: give a pet sitter a care card for the days you're away. With Premium they can log feedings using a PIN.

Walk your room
Tag animals and colonies with a room, rack or shelf, then view Collection and Feeding Day in the order you actually walk them.

Colonies and isopods
Track isopods, roaches and communal setups as one colony with per-stage counts and a population chart built from your own logs.

One screen for every animal
- A single history timeline for feedings, molts, substrate and events
- Water logging and one-tap refusals
- Record how a molt went, and mark an ultimate molt
- Mark an animal as died, with an archive to look back on

Breeding for every group
Pairings, egg sacs and offspring now use each group's own terms, with bulk offspring entry.

Photos
Location and camera details are now removed from every photo you upload. The free plan includes up to 5 photos per animal; Premium is unlimited.

Fixes
Dates showing a day early, delete on Android, unreadable registration errors, and many smaller fixes.
```

### Google Play — Release notes (≤500 characters)

```
New: share cards. Turn an animal or a fresh molt into a clean card for Instagram, TikTok or Discord. You choose what's shown, and sharing never changes your collection's privacy.
Also new: co-keepers and sitter links, room/rack/shelf locations for Collection and Feeding Day, colonies with population charts, isopods, one history timeline per animal, and location data removed from uploaded photos. Plus many fixes.
```

---

## Herpetoverse 1.1.0

### App Store — What's New

```
Share cards
Turn any animal into a clean specimen card for Instagram, TikTok, Discord or your group chat. You pick exactly which details appear. Sharing never changes who can see your collection, and if you make a link to a card you can turn it off at any time.

Keep together
- Co-keepers (Premium): invite someone to help with your collection as a viewer, logger or keeper. Every entry shows who logged it.
- Sitter links: give a pet sitter a care card for the days you're away. With Premium they can log feedings using a PIN.

Redesigned
- New Home, Collection and Breeding screens
- Animal detail rebuilt around one feeding card and a quick stat strip
- Profile tab reorganized, with everything in one place

Better records
- Set your own feeding schedule per animal
- Add genetics when you add an animal, starting from the species
- Crested Gecko Diet is only offered for species that eat it
- Mark an animal as died, with an archive to look back on

Account and privacy
- Verify your email from inside the app
- Location and camera details are now removed from every photo you upload

Plus fixes, including readable registration errors.
```

### Google Play — Release notes (≤500 characters)

```
New: share cards. Turn any animal into a clean card for Instagram, TikTok or Discord. You choose what's shown, and sharing never changes your collection's privacy.
Also new: co-keepers and sitter links, redesigned Home, Collection, Breeding and animal screens, your own feeding schedules, genetics in the add flow, and an archive for animals that have died. Location data is now removed from uploaded photos. Plus fixes.
```

---

## App Review notes (paste into "Notes" for both apps)

```
New in this version: share cards. From any animal's detail screen, tap the share icon to build an image card of that animal. The keeper chooses which fields appear. "Save" writes the image to the photo library, which is why the app now requests add-only photo library access (NSPhotoLibraryAddUsageDescription). The app does not read the library for this feature.

Optionally, "Make a link to this card" creates an unlisted web page that shows only that card image. Links can be turned off from Profile > Sharing > Shared cards. Making a card never changes whether the collection is public.

Co-keeper invites and sitter logging are Premium features; sitter links are available on the free plan. Premium is offered as auto-renewing subscriptions and a one-time lifetime purchase through In-App Purchase.

Demo account: [use the existing reviewer login in App Review Information].
```

---

## Checklist for this submission

- [ ] **Version numbers** — app.json now TV 1.8.0 / HV 1.1.0. In App Store Connect, create the new version with the same number before attaching the build.
- [ ] **App Privacy (App Store)** — no new data types. Photos now have location stripped. Co-keeper invites use an email you already declare. Only change your answers if your current label doesn't already cover "User Content" and "Email Address".
- [ ] **Data safety (Google Play)** — same answers as last time.
- [ ] **Android photo permissions** — the build declares only `READ_MEDIA_VISUAL_USER_SELECTED` and legacy `READ/WRITE_EXTERNAL_STORAGE`, not `READ_MEDIA_IMAGES`/`VIDEO`, so the Photo and Video permissions declaration shouldn't be triggered. If Play asks anyway, answer: the app only saves images the user creates and uses the system picker to choose photos.
- [ ] **Play track** — `eas submit` sends Android to the **internal** track (eas.json). Promote it to Production in the Play Console afterwards.
- [ ] **Screenshots (optional)** — a share card and the Feeding Day "By location" view are the most visual new features, if you refresh screenshots.
- [ ] **Reviewer account** — confirm the demo login in App Review Information still works and has a few animals, so the share card has something to show.
