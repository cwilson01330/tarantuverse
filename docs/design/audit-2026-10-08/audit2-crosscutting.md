# Audit 2: cross-cutting checks (2026-10-08)

Read-only. I compared the uncommitted tree (82 modified files plus the new units files) against HEAD `dd78e50`. Every finding below was checked by reading the code at the file:line given. Paths are relative to `apps/` unless they start with `CLAUDE.md`.

API tests run, with no writes to the repo: `test_measurement_units.py`, `test_share_card_units.py`, `test_share_cards_size.py` and `test_taxon_lists_in_sync.py`. **576 passed.**

---

## HIGH

### H1. Public keeper endpoints expose every public keeper's email address and admin flags to anyone (existed before this work)
- `api/app/routers/keepers.py:19-64`: `GET /api/v1/keepers/` needs no login and returns `List[UserResponse]`.
- `api/app/routers/keepers.py:67-97`: `GET /api/v1/keepers/{username}/` returns `UserResponse`.
- `api/app/schemas/user.py:110-135`: `UserResponse` includes `email`, `is_superuser`, `is_admin`, `is_premium`, `is_verified`, and now also `measurement_units`.
- Anyone can page through every public keeper's email, 100 at a time (`limit<=100`, `offset<=10000`). The fix is a `PublicKeeperResponse` schema without email, role flags or settings. The web page `community/[username]/page.tsx:20` types `email` but does not need it.

### H2. A public keeper's collection endpoint leaks price paid, source, private notes, death notes and enclosure notes (existed before this work)
- `api/app/routers/keepers.py:100-146`: `GET /api/v1/keepers/{username}/collection/` needs no login and returns `TarantulaResponse` for each public tarantula.
- `api/app/schemas/tarantula.py:18-19` (`source`, `price_paid`), `:52` (`death_notes`), `:63` (`notes`), plus `enclosure_notes`. All of these are inherited by `TarantulaResponse` (`:91`).
- This contradicts the rest of the platform. `/t/{id}` gives `source` and `notes` to the owner only (`api/app/routers/qr.py:884-896`), and the share-card rule says price, source and notes are never includable.

---

## MEDIUM

### M1. Making a collection public flips the keeper's deliberately hidden animals to public
- `api/app/routers/auth.py:352-370` calls `_cascade_collection_to_public` (`auth.py:46-68`) on every private→public change. That function sets `visibility='public'` on all of the keeper's `inverts`, `tarantulas` and `scorpions` rows that are currently private.
- Example: a keeper hides animal X, sets the collection to private, then sets it back to public. X is now public on `/t`, `/i`, link previews and the keeper collection. The docstring says individual hides are preserved, but that only holds for public→private.
- Colonies are not cascaded, so behaviour also differs between animals and colonies. This undercuts "Per-animal visibility is enforced (2026-10-08)" in CLAUDE.md.

### M2. In-app copy shown on iOS names Google Play
- `mobile/app/terms.tsx:218`: "Payment will be charged to your Apple ID or Google Play account…"
- `mobile/app/terms.tsx:226`: "…in your App Store or Google Play account settings"
- Both lines render on every platform, with no `Platform.OS` branch. This breaks the rule that App Store copy never mentions another platform. By contrast, `mobile/app/subscription.tsx:1039` already branches by platform.

### M3. CLAUDE.md is out of date: it says there are ten taxa, but isopod is the eleventh
- `CLAUDE.md:22` (agent quick-start) says "Ten taxa: tarantula, … roach, other".
- `api/app/schemas/invert.py:17` `TAXON_PATTERN` includes `isopod`. So do `web/src/lib/inverts.ts:46`, `mobile/src/lib/inverts.ts:117` and `web/src/lib/colonies.ts:35`. `services/export_service.py` comments already say "all eleven taxa".

### M4. CLAUDE.md is out of date: it states the wrong token lifetime
- The CLAUDE.md "Token Revocation" section says "Token expiry reduced from 7 days → 24 hours".
- `api/app/config.py:16`: `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 14` (14 days). Anyone reasoning about how long a leaked token stays valid will rely on the wrong number.

---

## LOW

### Units
- **L1. Metric HV hatch length drifts slightly.** `reptile_offspring.hatch_length_in` is `Numeric(5,1)` (`api/app/models/reptile_offspring.py:107`), but `parseLengthInput` produces 2 decimals. In `web-herpetoverse/.../offspring/new/page.tsx:65` and `mobile-herpetoverse/.../offspring/new.tsx:140`, 40 cm is sent as 15.75 in, stored as 15.8 in, and reads back as 40.1 cm. This is create-only, and imperial is unaffected.
- **L2. A failed units save in TV mobile leaves the phone's stored copy out of sync.** In `mobile/src/contexts/AuthContext.tsx` (`setMeasurementUnits` catch block), a failed save rolls back React state but not AsyncStorage. The HV copy does both (`mobile-herpetoverse/src/contexts/AuthContext.tsx`, same function). After a restart, the phone shows the unsaved choice.
- **L3. Some mobile edit screens can't clear a value.** `mobile/app/tarantula/edit.tsx` (`handleSave`) and `mobile/app/tarantula/add-molt.tsx:86-87` send `toStorage() ?? undefined`, so clearing a temperature or leg-span field leaves the old stored value in place. This existed before; the new code keeps it.
- **L4. Below-zero metric incubation temps get a confusing error.** In `web/src/app/dashboard/breeding/egg-sacs/add/page.tsx:15-18`, a value below about −17 °C converts to under 0 °F. The schema (`api/app/schemas/egg_sac.py:19-20`, `ge=0`) then returns a 422 that talks about °F.
- **L5. Behaviour change for keepers who never chose units.** Share cards and link previews now print imperial for them (`api/app/routers/share_cards.py:62-72`, `:571-575`). For example, a scorpion size that used to show "62 mm" now shows "2.44 in" for non-US owners until one of their clients saves a region guess. This matches the spec; noting it only because it changes what people see.
- **Checked with nothing found:**
  - All four clients and API-composed text. The remaining hardcoded `°F` / "inches" are in admin species forms, free-text placeholders and the import template labels, which describe the storage units.
  - Every edit form that pre-fills a converted value uses `useUnitField`, with stable `load` dependencies and no refetch loops. Opening and saving without changes sends back the original stored value.
  - Sitter care cards (`api/app/services/sitter_card.py:101-112`), web and HV QR labels, `/t`, `/i`, `/col`, keeper pages, care sheets, growth charts, the activity feed, and the export README plus `units` key.
  - The four `units.ts` copies match apart from comments and region detection.

### Access and privacy
- **L6. Keeper search ignores private profiles' setting.** The search route `api/app/routers/search.py:156-165` says "public keepers only" but never filters on `collection_visibility`. Private keepers' username, display name and avatar show up in search (the profile itself still 404s).
- **Checked with nothing found:** The only route changes in the uncommitted diff are `PUT /auth/me/profile` (`measurement_units` limited to imperial/metric, explicit null refused), share-card units (a signed claim, with the owner as fallback), and sitter-pass units. None of them changes access policy, and none accepts new ids in the request body.

### Older app builds
- **Checked with nothing found:** All API changes add fields only (`UserResponse.measurement_units`, the optional `UserProfileUpdate` field, the export `units` key). No field, route or enum was removed or renamed. The new mobile JS uses no new native module: region comes from `Intl` inside a try/catch (`mobile/src/lib/units.ts:58-65`), so it is safe for runtime 1.1.0 and 1.2.0 OTA updates. The web `/dashboard/tarantulas/[id]`, `/edit` and `/husbandry` routes are all still redirects.

### Robustness (512 MB instance)
- **Checked with nothing found:** The uncommitted diff adds no new endpoints. Share-card subject loading reads one animal's molts, which is bounded per animal.

### Copy and docs
- **L7. Tarantula-only wording in the export README.** The CSV README says "To re-import your tarantulas … upload tarantulas.csv" (`api/app/services/export_service.py`, CSV README block).
- **L8. CLAUDE.md headers are stale.** It still says "Current Status (As of 2026-06-09)" and "Last Updated: 2026-07-02 / Version 1.4.0". The file-structure trees are many months old: they list `(tabs)/index.tsx` as the collection screen and leave out colonies, sitter passes, share cards and units.
- **L9. Mobile activity feed says "leg span" for every molt.** `mobile/src/components/ActivityFeedItem.tsx:139` says "New leg span" whatever the taxon. That is wrong for a scorpion or centipede molt, which measures body length.
