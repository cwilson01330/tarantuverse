# Share cards — design

**Date:** 2026-09-29 · **Status:** awaiting review · **Apps:** Tarantuverse + Herpetoverse (API, web, mobile)

## 1. Intent

Keepers share things that are cool *because they're different* — data no plain
photo can show. Growth that happens through molts. Day counts. Sizes. The goal
is the Strava/Wrapped effect: people post because they're proud of the card,
followers ask "what's that?", and the app is discovered without ever
advertising itself.

**Must feel like:** the keeper's own content, in a naturalist register.
**Must not feel like:** an ad, a template, a call to action, "Download Tarantuverse!".
**Must never expose:** location (photo GPS), prices paid, or anything the keeper
didn't choose for that card.
**Must never change:** anything in the keeper's collection, profile, or who can
see their animals. Sharing is outward only (Cory, 2026-09-29): a card goes where
the keeper sends it and nowhere else — never into the in-app feed or profile.

**Success:** keepers share cards unprompted; shared links unfold into rich
previews; no private data appears on any card or page the keeper didn't pick.

Channels (all four, per Cory): Instagram/TikTok stories + reels, Facebook
groups, Reddit/Arachnoboards, Discord/group chats. That means three shapes per
card: story 9:16 (1080×1920), post 4:5 (1080×1350), and link preview 1.91:1
(1200×630). Square 1:1 (1080×1080) is offered as a post variant.

## 2. Scope

**Phase 1 (this spec)**
1. Prerequisite: strip EXIF (GPS) from stored photos.
2. Card renderer on the web app (one renderer for every card and every shape).
3. Two cards: **Fresh molt** and **Animal profile**.
4. **Card links** — optional, unlisted, frozen, revocable `/c/<code>` pages that
   show one card and nothing else (§6).
5. Link previews (`og:image`) on animal pages that are *already* public.
6. Share composer in both mobile apps; also reachable on the TV + HV websites.

**Phase 2:** Year-in-the-hobby wrap-up (target: early December 2026).
**Phase 3:** Growth story (photo strip), before/after molt, short video.
**Deferred until the data exists:** breeding milestone (0 egg sacs logged today),
colony curve (6 colonies, 3 events).

Why this order — production data, 2026-09-29, 118 keepers: 474 animals have a
hero photo; 219 molts in the last 90 days (the most frequent milestone); only
53/438 molts have measurements and 0 have a molt photo; 90 animals have 3+
photos. Phase 1 cards therefore must look complete with **no measurements and
one photo**.

## 3. Visual language — "specimen label" (direction A)

Museum/naturalist tag. Warm paper ground, serif type, a hairline rule, a small
ruler motif. The animal's photo inset at the top with a thin paper margin.

- **Header line:** `Specimen · molt no. 9` (molt card) or `Specimen · female` (profile; sex only when recorded — there is no life-stage field to draw on).
- **Name** (serif, large) — only if the keeper toggled it on.
- **Scientific name** (serif italic), common name beneath (profile card).
- **Rule + facts:** only rows with data. Molt card: size change (`3.2 → 4.1 in`), days in care. Profile: in care (`1 yr, 1 mo`), molts, current size.
- **Ruler motif** under the facts (decorative, constant).
- **Wordmark** bottom-left: `tarantuverse` / `herpetoverse`. No QR on digital cards (viewers are on the same phone), no URL, no slogan.
- **No empty rows ever.** A missing value removes its row; the label shortens.
- Herpetoverse uses the same template with reptile facts (weight, length, sheds) and its own wordmark.
- The card is an image, so its palette is fixed (paper light) regardless of the app's theme — it must read well on both light and dark feeds.

Layout reflows per shape: story stacks photo over label; post 4:5 same with a
shorter photo; square and link preview put photo left, label right.

## 4. Architecture

```
mobile / web  ──(1) POST /share-cards  {animal_id, kind, fields[], shape, link?}──▶  API
              ◀──(2) {image_url: https://<web>/api/card/<token>.png, card_link?}──
mobile        ──(3) GET image_url ──▶ Web renderer (next/og) ──(4) GET /share-cards/<token>/data──▶ API
                                                 ◀── card payload (only chosen fields) ──
mobile        ──(5) save file → share sheet / save to Photos
Discord/FB    ──GET /c/<code> (og:image = /api/card-link/<code>.png) ──▶ same renderer, frozen snapshot
Discord/FB    ──GET /i/<id>  (already-public animal; og:image = /api/og/...) ──▶ same renderer
```

### 4.1 API (FastAPI)
- **`POST /api/v1/share-cards`** (auth; owner or co-keeper with keeper role, via
  the existing resolver). Body: `animal_id`, `app` (tarantuverse|herpetoverse),
  `kind` (`molt`|`profile`), `molt_id?`, `fields` (allow-listed set per kind),
  `shape`, `link` (bool, default false). Creates a short-lived render token
  (15 min, single animal, stores the chosen field list) and returns the image
  URL. When `link` is true it also creates a card link (§6) and returns
  `card_link`. Nothing about the animal or its visibility is modified.
- **`GET /api/v1/share-cards/{token}/data`** (no auth; token is the capability).
  Returns ONLY the fields in the token's list, computed server-side — the client
  never supplies values, only which fields to show. Photo is served as a URL to
  the stripped image (§5). Expired/unknown token → 404.
- **`GET /api/v1/card-links/{code}`** (no auth) — the frozen snapshot for a card
  link; 410 when revoked, 404 when unknown.
- **`GET /api/v1/card-links/`** + **`DELETE /api/v1/card-links/{code}`** (auth) —
  "Your shared cards" list and revoke. Deleting the animal or the account
  revokes its card links.
- **`GET /api/v1/public-card/{app}/{animal_id}`** (no auth) — the fixed
  public-safe payload for link previews of animals that are *already* public
  under today's rules; 404 otherwise. Never changes visibility.
- Field allow-lists live in one module with tests. Never includable: price
  paid, source, notes, enclosure, location, owner email.
- Remembered defaults: `users.share_defaults` JSONB (per kind), updated when a
  card is shared. Migration required.

### 4.2 Web renderer (TV web app, Next 15, `next/og` `ImageResponse`)
- `app/api/card/[token]/route.tsx` — fetches `/share-cards/{token}/data`,
  renders the specimen template at the requested shape, returns PNG.
- `app/api/card-link/[code]/route.tsx` — renders a card link's frozen snapshot
  (link-preview shape). Long cache; revocation returns a neutral "no longer
  shared" image.
- `app/c/[code]/page.tsx` on BOTH websites — a bare page: the card image and
  nothing else (no nav into the app, no keeper name beyond what's on the card,
  no link to the animal). `robots: noindex, nofollow`. Server metadata sets
  `og:image` so the link unfolds when pasted. Revoked → "This card is no longer
  shared."
- `app/api/og/[app]/[id]/route.tsx` — fetches `/public-card/...`, renders the
  1.91:1 preview. Cached (`Cache-Control: public, s-maxage=3600`), keyed on
  animal `updated_at` so a new molt refreshes it.
- One template module (`lib/share-card/SpecimenCard.tsx`) shared by both routes,
  with the serif font bundled (subset) so rendering is deterministic.
- Hosted on the TV web app for both products; the wordmark comes from `app`.
  (HV web links point `og:image` at the TV renderer URL — one renderer.)
- Public pages gain server metadata: `/i/[id]`, `/t/[id]` (TV) and `/a/[id]`
  (HV) get a server `generateMetadata` wrapper (they're client pages today) that
  sets `og:title`, `og:description`, `og:image`, `twitter:card=summary_large_image`.

### 4.3 Mobile (both apps)
- **Composer screen** `share/[animalId]` (TV) / equivalent HV route: live
  preview (debounced re-request), shape chips (Story / Post / Square), field
  toggles, "Make a link to this card" toggle (§6), Save and Share buttons.
- "Your shared cards" list (You tab → Sharing) to view and revoke card links.
- Entry points: detail screen share action; **after a molt saves** — offered,
  never automatic (same pattern as the §14.9 fatal-molt offer); HV equivalent
  after a shed/weight is optional, not Phase 1.
- Share: download PNG with `expo-file-system` (already in the binary via
  `expo`), then `expo-sharing` (new) for the image. Save: `expo-media-library`
  (new, with permission strings).
- **New native modules ⇒ new builds.** Bump `runtimeVersion` (TV 1.0.1 → 1.1.0,
  HV 1.1.0 → 1.2.0) so OTA updates carrying the composer only reach new
  binaries. Old binaries keep the existing text-only share.

### 4.4 Web (TV + HV)
- Same composer as a modal on the animal detail page; download via the PNG URL,
  share via Web Share API where available.

## 5. Prerequisite — EXIF stripping (ships first, on its own)

Today originals are stored byte-for-byte (`services/storage.py:216-220`),
including GPS, and public pages link the originals. Fix:
- On upload: Pillow `ImageOps.exif_transpose` (fixes sideways photos), then
  re-encode without EXIF (JPEG q≈88; PNG/WebP stripped of metadata). Applies to
  every upload path, including the QR route (which must also stop trusting the
  client MIME type, `qr.py:575`).
- Backfill: one-shot script to rewrite existing R2 originals without EXIF
  (idempotent, `--dry-run`, run on Render shell by Cory).
- Tests: a JPEG with GPS EXIF in → no GPS out; orientation applied.

## 6. Privacy and card links

**Rule (Cory, 2026-09-29):** the keeper decides, per card, what the card shows —
independently of the animal's in-app visibility — and sharing never changes
anything in the app. A private animal in a private collection can be shared
with any chosen fields, and stays exactly as private as it was.

**Card links** (off by default) exist because Discord, Facebook groups and
forums prefer a link to an image. A card link is:
- **Just the card.** `/c/<code>` shows the card image and nothing else — no
  animal page, collection, keeper profile, or path into them.
- **Frozen.** Creating the link stores a snapshot (`card_links` table: code,
  owner user_id, animal_id, app, kind, shape, the rendered field payload as
  JSONB, created_at, revoked_at). Later changes to the animal never reach it;
  a new molt means a new card.
- **Unguessable and unlisted.** Code = 128-bit random, URL-safe. Pages are
  `noindex`; there is no index or listing of card links for anyone but the owner.
- **Revocable.** Revoke from "Your shared cards"; animal/account deletion revokes
  too. Revoked links serve a neutral "no longer shared" page and image.
- **Created by whoever shared it** (owner or keeper-role co-keeper); both the
  sharer and the animal's owner can revoke it.

The snapshot stores field *values* (already filtered to the chosen list) and a
reference to the stripped photo, never raw rows. Deleting the photo removes it
from the snapshot's render.

## 7. Error handling

- Render token expired while composing → re-request silently on next preview.
- Renderer or API down → composer shows "Couldn't make the card. Try again."
  and keeps the keeper's toggles; never falls back to a text share silently.
- Photo missing/unloadable → card renders with a taxon glyph block in place of
  the photo (still a complete label).
- Old app binary → no composer; existing text share unchanged.

## 8. Testing

- API: field allow-list (a non-allowed field is never in `/data` or a snapshot
  even if requested); token expiry; creating a card or card link leaves the
  animal's `visibility`/`is_public` and the owner's `collection_visibility`
  byte-for-byte unchanged; card-link snapshot is frozen (edit the animal →
  snapshot unchanged); revoke → 410; animal delete → links revoked; a
  non-owner, non-sharer can't list or revoke; EXIF strip.
- Renderer: snapshot PNGs for each kind × shape × {full data, no measurements,
  no photo}; HV wordmark variant.
- Mobile: type-check, design-token gate; manual on both platforms: share to
  Instagram story, Facebook, Discord; save to Photos.
- Link previews: validate a `/c/<code>` link and an already-public `/i/<id>` in
  Facebook Sharing Debugger and a Discord paste.

## 9. Rollout

1. Photo-module fixes: EXIF/GPS strip + orientation, backfill, storage
   cleanup, free-tier photo cap on every route (API only).
2. Public-card endpoint + og routes + page metadata → **link previews live for
   already-public animals** with a normal push (no app build).
3. Share-card + card-link endpoints, renderer, `/c/<code>` pages, web composer.
4. Mobile composer + new native modules → new builds. Android first (fast
   review), iOS after App Store review.

## 10. Out of scope

Video; public memorial surfaces; changing any visibility setting from the share
flow (explicitly rejected); per-animal public pages (not needed now — card links
cover sharing without them); analytics on shares beyond a simple counter
(optional, not Phase 1).
