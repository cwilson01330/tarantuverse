# Tarantuverse — Follow-up Audit (2026-04-17)

**Scope:** Web, Mobile, Backend API, Label printing (QRModal), Feature research
**Reviewer:** Multi-agent parallel sweep after partial remediation of [PLATFORM_DESIGN_AUDIT_2026-04-13.md](./PLATFORM_DESIGN_AUDIT_2026-04-13.md)
**Status after 4/13 audit:** Sprint 1 preset system shipped, Sprint 2 cross-device sync shipped, quick wins landed (badge copy, FAB padding, profile menu, activity feed). This pass targets what survived or emerged since.

---

## 0. TL;DR — The 7 Highest-Leverage Fixes

Ranked by user-visible impact × low effort × risk reduction.

1. **Cap QR upload session `used_count` with a hard max (P0 security)** — `apps/api/app/routers/qr.py:154`. Leaked/brute-forced token → unlimited photo uploads = storage DoS. Add `MAX_UPLOADS_PER_SESSION = 10`.
2. **Sanitize `QRModal.tsx` print flow (P0 security + UX)** — `apps/web/src/components/QRModal.tsx:240`. `clone.outerHTML` serializes user-controlled strings (tarantula name, scientific name) into `document.write()`. Escape via safe template, not raw HTML. Also replace CSS `zoom` with `transform: scale()` so preview matches printed output.
3. **Rate-limit DM send, follow/unfollow, and export endpoints (P0)** — `apps/api/app/routers/direct_messages.py`, `follows.py`, `import_export.py`. Spam/DoS vectors currently only bounded by 200/min global.
4. **Add `max_length` to forum post/reply `content` (P0)** — `apps/api/app/schemas/forum.py`. Currently unbounded; multi-MB post = DB bloat.
5. **QR photo upload needs magic-byte validation (P0)** — `apps/api/app/routers/qr.py:178`. Path validates `Content-Type` header only; every other photo path uses `validate_image_bytes()`. Parity gap that reopens the exploit Phase 3.5 closed.
6. **Kill production `console.log` that leaks auth tokens (P0)** — `apps/web/src/app/dashboard/settings/notifications/page.tsx:114-116` logs bearer token. Also multiple in mobile forums/thread/subscription screens.
7. **Pagination bounds on `messages`, `keepers`, `forums` listing (P1)** — unbounded `skip`/`offset` allow DB scan DoS and enable user enumeration scraping.

---

## 1. Web Audit (`apps/web`)

### P0
- **Bearer token logged to browser console** — `dashboard/settings/notifications/page.tsx:114-116`. Remove.
- **QRModal `outerHTML` print flow** — `components/QRModal.tsx:240`. XSS surface if tarantula name/common name ever renders untrusted HTML; also fragile to stylesheet leakage.
- **Dark-mode gaps** — `dashboard/tarantulas/[id]/page.tsx` and `community/[username]/page.tsx` have elements without `dark:` variants (mixed `bg-white`/`text-gray-X` without pairs around lines ~800, ~840, ~859).
- **Hardcoded gradients bypass preset system** — `help/page.tsx:7,14,22,32`; `features/page.tsx:7,14,22,32`; `pricing/page.tsx:60,271`; `dashboard/tarantulas/[id]/page.tsx:774,778,1130` use `from-purple-600`/`to-blue-600` etc. Keeper preset renders wrong on these surfaces.
- **Icon-only buttons without `aria-label`** — `GlobalSearch.tsx:199-204` (clear ×), `QRModal.tsx:265-276` (emoji tabs).
- **Image `alt` inconsistency** — spot-check all `<img>` in `GlobalSearch.tsx:326` and `community/[username]/page.tsx:390`.

### P1
- **`canEdit = false // TODO`** — `species/[id]/page.tsx:172`. Admin check never wired.
- **Contact form doesn't POST** — `contact/page.tsx:16`. UI without submission.
- **Reset-password inputs missing dark variants** — `reset-password/page.tsx:152-204`. Plain `bg-white` inputs.
- **`messages/page.tsx:110-136`** uses CSS var classes (`bg-surface`, `border-theme`) with no Tailwind fallback — layout collapses if provider fails.

### P2
- **Print preview size mismatch** — `QRModal.tsx:443` uses CSS `zoom` for preview; printed output strips it. Small (2"×1.25") labels render unpredictably.
- **Placeholder-as-label on GlobalSearch** — `GlobalSearch.tsx:193`. Add `sr-only` label.
- **Emoji-as-UI mixed with Lucide icons** across admin, modals, search result chips. Design-system debt from 4/13 audit still open.

---

## 2. Mobile Audit (`apps/mobile`)

### P0
- **Semantic colors hardcoded in helpers** — `app/(tabs)/index.tsx:222-232` (`getFeedingDaysColor`, `getPremoltBadgeColor`), `app/enclosure/[id].tsx:92-106`, `app/tarantula/[id].tsx:788-790`. These should live in `theme.semantic.*` (immutable across presets).
- **`StyleSheet.create` inside component body** — `app/(tabs)/index.tsx:234` and likely `collection.tsx`, `community.tsx`, `profile.tsx`, `species.tsx`. Violates memory rule + regresses performance via style re-allocation per render.
- **Hardcoded white/black text** — `app/(tabs)/_layout.tsx:162,168` (unread badge), `src/components/AppHeader.tsx:52-53`, `app/tarantula/public/[username]/[name].tsx:140,167,401,408`, `app/messages/index.tsx:257-378`, `app/subscription.tsx:323-375`. Breaks dark-mode and gradient contrast.
- **`console.log` in production mobile code** — `app/community/forums/[slug]/[threadId].tsx:1`, `app/forums/new-thread.tsx`, `app/forums/thread/[id].tsx`, `app/subscription.tsx`. Some log request bodies (auth leakage risk).
- **Missing `accessibilityLabel` on tab icons, stat card icons, sex badges, header action icons** — tab bar `_layout.tsx:56-143`, stat cards in `(tabs)/index.tsx`, `ActivityFeedItem.tsx:159`.

### P1
- **Hardcoded `borderRadius: 12/16` everywhere** — 30+ files. Design token (`theme.radius.sm/md/lg`) doesn't exist yet; presets can't vary radius as designed.
- **Hardcoded shadows** — `(tabs)/index.tsx:282-286`, `tarantula/add-photo.tsx:294-347`. Hobbyist preset should render deeper shadow than Keeper; currently locked.
- **Verify `theme.gradients[preset]` is fully wired** — some screens may still hold inline `['#...', '#...']` arrays in `LinearGradient`.

### P2
- **Activity feed: `ActivityFeedItem.tsx:154` accessibilityLabel empty for non-tarantula actions** (follow, forum_post).
- **Messages `[username].tsx:46-62`** fetches before confirming `authLoading=false` — violates memory rule; can misfire on first mount.
- **Feature parity** — spot-checked; mobile has `forgot-password`, `settings/data-export`, public profile URL. No major gaps found.

### ✅ Pass
- Trailing-slash API convention is correct.
- No `router.back()` in catch blocks (memory antipattern not present).

---

## 3. Backend Audit (`apps/api`) — Beyond Phase 3.5

### P0
- **QR session no max-uploads cap** — `routers/qr.py:154-220`. `used_count` tracked but never checked. Fix: reject if `used_count >= 10`.
- **Forum content unbounded** — `schemas/forum.py` `ForumPostBase.content` has no `max_length`; title does. 10MB POST → DB bloat.
- **No rate limits on DM send / follow / unfollow** — `direct_messages.py:87`, `follows.py:22,88`. Only global 200/min applies. Add `@limiter.limit("10/minute")` / `"5/minute"`.
- **QR photo upload skips magic-byte validation** — `routers/qr.py:178`. Checks `file.content_type.startswith("image/")` only. Every other photo route uses `validate_image_bytes()`; parity gap.

### P1
- **`str(e)` in HTTPException details** — `routers/photos.py:121,191,228`, `routers/qr.py:220`. Leaks backend error detail (storage provider, SQL). Replace with generic message + server-side log.
- **Unbounded pagination** — `routers/messages.py:74-78` (`skip`/`limit`), `routers/keepers.py:24,61` (`offset`), `routers/forums.py:178` (`page`). All allow `offset=999999999`. Cap at `le=10000` for offset/skip and `le=100` for limit.
- **Export endpoints are heavy + unrate-limited** — `import_export.py`. Add `@limiter.limit("3/hour")` on `/export/full`.

### P2
- **OAuth tokens in DB never cleared on logout** — confirm `auth.py` logout path nulls `oauth_access_token`/`oauth_refresh_token`. Already excluded from response schema (good).

### ✅ Pass
- CORS lockdown holds.
- No raw SQL / string-formatted `text()` found.
- Magic-byte validation active on main photo + avatar paths.

---

## 4. Label Printing (QRModal) — Dedicated Deep-Dive

**File:** `apps/web/src/components/QRModal.tsx`

### Findings
- **Line 240 (print):** `clone.outerHTML` piped into `iframe.contentDocument.write()` (or equivalent). Any user-controlled text in the label is serialized through HTML. If scientific name ever gains an ampersand or less-than, you get silent breakage; if it ever gains `<script>` (admin-editable species), XSS.
- **Line 443 (preview):** CSS `zoom` is a non-standard property — different rendering on Firefox vs Chrome, stripped by print engines. Preview is not a reliable proxy for printed output. Reports of "small labels come out wrong size" likely trace here.
- **Line 265-276 (tabs):** Emoji-only tab labels ("📸 Add Photo" / "🏷️ Print Label") with no `aria-label`. Screen readers hear "camera" / "label tag".
- **Line 425-434 (field toggles):** Checkboxes nested inside `<label>` but no `aria-checked` reinforcement and no visible disabled state when tarantula lacks the field (e.g., no molts yet, unknown sex).
- **Font/size/color UX:** The 4 fonts × 3 sizes × 5 themes × 4 field toggles = 240 permutations. No saved defaults per user — every print round the user re-picks. Would benefit from "remember my last choice" (localStorage) and a "reset" button.

### Recommended refactor
1. Replace `outerHTML` serialization with a dedicated `renderLabelHTML(labelState)` function using template literals with `escapeHtml()` for every user-controlled field.
2. Swap CSS `zoom` → `transform: scale(N); transform-origin: top left;` with an explicit pixel-sized container so preview dimensions = print dimensions.
3. Add `aria-label` to both tab buttons, visible state for disabled field toggles, and persist selection in `localStorage` keyed by user ID.
4. Split the label template into a pure function that both preview and print call — single source of truth.

---

## 5. Feature Research — Where Tarantuverse Should Go Next

Top 10 opportunities ranked by differentiation × keeper pain:

| # | Feature | Effort | Audience | Why it matters |
|---|---------|--------|----------|----------------|
| 1 | **Health/Veterinary module** (DKS flags, symptom log, toxin exposure, vet visit, post-mortem) | L | Serious hobbyist, breeder | #1 hobby pain; no competitor has it |
| 2 | **Shipping & Transport records** (heat-pack logic, temp at origin/dest, DOA outcomes) | M | Breeder | Sticky during the most stressful workflow |
| 3 | **Lineage / Pedigree visualizer** (tree view pairings→offspring→gen2, inbreeding coefficient) | L | Breeder | Reptile apps have this; Ts don't. Status signal. |
| 4 | **Legal / CITES compliance helper** (per-species flag, document vault for CITES permits/invoices) | M | Serious hobbyist, breeder | Protects from accidental illegal possession |
| 5 | **Bioactive & CUC tracker** (springtail/isopod health, plants, moss) | M | Serious hobbyist | Bioactive is fastest-growing setup style |
| 6 | **Mite/pest outbreak guided workflow** (triage → dry-out → rehouse timer) | S | All | Converts #1 forum question into in-app path |
| 7 | **Sling sale marketplace-lite** (list offspring, Stripe Connect, auto-invoice with lineage PDF) | XL | Breeder | Closes the pair→hatch→sell loop; monetizable |
| 8 | **Collection valuation for insurance** (time-stamped PDF) | S | Serious hobbyist | $5-50k collections want documentation; nobody does this |
| 9 | **Enclosure environment logging** (manual now, IoT-ready schema for Govee/SensorPush later) | M | All | Solves humidity-obsession anti-pattern |
| 10 | **Expo / show tracker** (upcoming shows, wishlist, purchases, vendor ratings) | S | All | Expos are the #1 acquisition event |

**Strategic recommendation:** Ship **Health+Shipping+Lineage** as a 6-month arc — converts "nice tracker" to "indispensable breeder tool." Defer IoT and marketplace until the pair→hatch→ship→transfer-ownership loop is seamless.

### Competitive gaps confirmed
- **Arachnifiles:** No community, no breeding viz, no health, no web — great on care guides + wishlist.
- **ExotiKeeper:** Basic tracking only. No community, no analytics, no breeding.
- **ReptiDex / Husbandry.Pro:** Strong on lineage + marketplace for reptiles — steal their pedigree UX.

---

## 6. Suggested Sequencing

**This week (P0 fix pass — ~1 day):**
- Back-end: QR cap, forum max_length, DM/follow rate limit, QR magic-bytes, message/keepers/forums pagination bounds, strip `str(e)`.
- Web: remove notification page `console.log`, sanitize QRModal print, fix reset-password dark mode inputs.
- Mobile: strip `console.log` from forums/thread/subscription, fix in-body `StyleSheet.create`.

**Next week (P0 polish — ~2-3 days):**
- Replace hardcoded white/black/gradient text in mobile with theme tokens.
- Dark-mode sweep on `dashboard/tarantulas/[id]` and `community/[username]`.
- Replace hardcoded gradients in web marketing pages with preset-aware tokens.
- Accessibility label sweep (tab icons, stat cards, sex badges, modal tabs, search clear, QRModal tabs).

**Sprint after (P1 — ~1 week):**
- Create `theme.radius.*` and `theme.shadow.*` tokens; migrate mobile to consume them.
- QRModal print refactor (escape HTML, replace `zoom` with `scale`).
- Wire unbounded TODOs (species `canEdit` admin check, contact form POST).

**Feature arc (next 6 months):**
- Health module → Shipping module → Lineage visualizer.

---

**Document owner:** Update as items ship. Cross-link PRs.
