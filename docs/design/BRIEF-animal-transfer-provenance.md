# Engineering Brief — Animal transfer & provenance ("rehome")

**Status:** Ready for implementation
**Date:** 2026-06-15
**Owner:** (assign)
**Scope:** Seller→buyer animal record handoff, provenance/pedigree, growth-loop instrumentation. Web + mobile + API.

---

## 1. Objective & strategic frame

Give small breeders/sellers value a marketplace structurally can't — **the animal's
history, lineage, and a clean handoff to the buyer** — *without* Tarantuverse
becoming a marketplace. MorphMarket / IG / in-person stays the transaction. We own
the **system of record and provenance** that wraps around it.

The keystone feature: **record transfer ("rehome")**. A seller generates a claim
link/QR for an animal they own; the buyer taps it, signs in (or signs up), and the
animal lands in their collection **pre-loaded** with species, lineage, DOB, care
sheet, and the breeder's husbandry snapshot. The seller keeps a badged historical
record; the buyer gets a living one.

This does triple duty:
1. **Breeder value** — professional handoff, fewer "what do I feed it" messages, provable provenance.
2. **Buyer value** — a populated animal + care context instead of a blank form.
3. **Growth flywheel** — every animal sold onboards a new keeper with a populated account. This is the single best lever on the reach/exposure problem identified in the 2026-06-15 gating analysis (installs growing, but nothing seeds engaged users). Instrument it (see §7).

### The bright line (do NOT cross)

- **No payments, no escrow, no in-app checkout, no offers/bidding, no sale-negotiation messaging.**
- `sale_price` is a **private seller ledger value**, never charged or shown to the buyer.
- The claim link is generated **after** a sale closes elsewhere.
- Any "contact / buy" affordance links **out** to the seller's own channel.
- Rationale: never brokering the transaction keeps us clear of live-animal-sale,
  interstate-shipment, and invasive-species liability, and out of MorphMarket's
  moderation/fraud burden. Add a one-line ToS: "Tarantuverse records provenance and
  husbandry; it does not facilitate or process sales."

---

## 2. What already exists (build on these, don't reinvent)

| System | Location | Reuse for |
|---|---|---|
| Short-lived public token pattern | `routers/qr.py` — `secrets.token_urlsafe(32)`, `{web_base}/upload/{token}`, public `GET /upload-sessions/{token}`, `_optional_user()` helper | Transfer token + public claim endpoint |
| Public animal profile | `GET /api/v1/t/{id}` (`routers/qr.py`), web `/t/[id]` | Public pedigree display surface |
| QR share UI | mobile `QRSheet.tsx` / `QRModal.tsx`, web `QRModal.tsx` | Sharing the claim link/QR |
| Unified animal | `models/invert.py` (`inverts`) — covers all 10 taxa incl. tarantula via shared PK | The thing being transferred (key on `invert_id` only — skip the QR-style polymorphism) |
| Offspring + lineage | `models/offspring.py` (`status` enum incl. `SOLD`, `buyer_info`, `price_sold`), pairing→egg_sac→offspring chain | Auto-mark sold on claim; lineage snapshot source |
| Acquisition fields | `inverts.source` (`Source` enum: BRED/BOUGHT/WILD_CAUGHT, UPPERCASE names), `date_acquired`, `price_paid` | Buyer's new record provenance |
| Photos | `models/photo.py`, `routers/photos.py` (polymorphic, has `invert_id`) | Copy selected photos to buyer's record |

> Note: `inverts` currently has **no provenance columns** — they must be added (§4).

---

## 3. Lifecycle overview

```
SELLER (owner)                         BUYER
─────────────                          ─────
POST /inverts/{id}/transfer
  → animal_transfers row (pending)
  → snapshot frozen on the row
  → returns token + /claim/{token}
        │
        │  shares link/QR off-platform
        ▼
                                GET /transfers/{token}  (public preview)
                                  → species, photos, breeder, lineage snapshot
                                        │
                                        │  taps "Add to my collection"
                                        ▼
                                (must be logged in — register/login if not)
                                POST /transfers/{token}/claim  (auth)
                                  → new Invert created, owned by buyer
                                  → provenance copied from snapshot
                                  → selected photos copied
                                  → transfer = claimed
                                  → source Invert badged "Transferred",
                                    excluded from cap + reminders
                                  → linked Offspring (if any) → status SOLD
```

Seller can `POST /transfers/{token}/cancel` while still `pending`.

---

## 4. Data model

### 4a. New table `animal_transfers`

Migration: additive. `down_revision` = current head (`cap_20260615_lower_free_animal_cap`
as of this writing — **verify the head and single-head invariant before writing**,
per the project's Alembic-chain rule).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `token` | String(64) unique, indexed | `secrets.token_urlsafe(32)` — same as QR |
| `invert_id` | FK `inverts.id` ON DELETE CASCADE, NOT NULL, indexed | source animal |
| `from_user_id` | FK `users.id` ON DELETE CASCADE, NOT NULL, indexed | seller |
| `to_user_id` | FK `users.id` ON DELETE SET NULL, nullable, indexed | buyer (set on claim) |
| `claimed_invert_id` | FK `inverts.id` ON DELETE SET NULL, nullable | the NEW record created for buyer |
| `status` | String(16), default `'pending'` | CHECK in (`pending`,`claimed`,`cancelled`,`expired`) |
| `snapshot` | JSONB, NOT NULL | frozen at create — see §4c |
| `note` | Text, nullable | seller's message to buyer ("0.0.1 sling, last molt 6/1") |
| `sale_price` | Numeric(10,2), nullable | **private** seller ledger; never shown to buyer, never charged |
| `include_photos` | Boolean, default true | copy photos on claim? |
| `expires_at` | DateTime(tz), NOT NULL | default now + 30 days (transfers aren't ephemeral like QR's 20 min) |
| `created_at` | DateTime(tz), server default now | |
| `claimed_at` | DateTime(tz), nullable | |
| `cancelled_at` | DateTime(tz), nullable | |

### 4b. New provenance columns on `inverts` (same migration or a paired one)

| Column | Type | Notes |
|---|---|---|
| `bred_by_user_id` | FK `users.id` ON DELETE SET NULL, nullable | on-platform breeder, if known |
| `origin_keeper_name` | String(120), nullable | free-text breeder/seller (off-platform or display) |
| `source_transfer_id` | FK `animal_transfers.id` ON DELETE SET NULL, nullable | the transfer this record came from |
| `provenance` | JSONB, nullable | immutable pedigree snapshot copied from the transfer on claim |
| `transferred_out_at` | DateTime(tz), nullable | set on the SOURCE record when it's handed off; drives the "Transferred" badge + cap/reminder exclusion |

> ⚠️ **`transferred_out_at IS NULL` is a global filter, not a one-liner.** Every
> place that counts OR lists a user's inverts must apply it, or the displayed count
> will disagree with what the cap enforces (seller sees "18 animals," cap says they
> have 15). At minimum:
> - `utils/limits.py::enforce_collection_limit` (the 402 gate)
> - the dashboard `animalCount` / "X of N animals" UI (web + mobile)
> - the collection grid list query (web `dashboard/tarantulas` + `dashboard/inverts`, mobile `(tabs)/index.tsx`)
> - active-care reminders / overdue-feeding badges (a sold animal must not nag the seller)
>
> Audit for every `count`/list over `inverts` keyed on `user_id` and add the filter.
> Consider a scoped helper (e.g. `active_inverts_query(user_id)`) so the filter can't
> be forgotten in a new call site.
>
> **List-placement decision (made — flip if you disagree):** transferred-out animals
> are **removed from the main collection grid and all active counts**, and surfaced in
> a separate **"Transferred"** filter/section on the collection screen + the keeper
> profile. This keeps the displayed active count identical to the cap count (no
> "18 vs 15" mismatch) while preserving the breeder's full history of what they
> produced. They are NOT deleted and retain their provenance/badge.

### 4c. Snapshot shape (`animal_transfers.snapshot`, also copied to `inverts.provenance`)

Frozen at transfer-create so it survives the seller later editing/deleting records.
This is the "pedigree papers."

```jsonc
{
  "taxon": "tarantula",
  "scientific_name": "Tliltocatl albopilosus",
  "common_name": "Curlyhair",
  "sex": "UNKNOWN",
  "life_stage": "sling",
  "breeder_handle": "@arachnocory",          // from_user.username
  "bred_by_user_id": "…uuid… | null",
  "origin_keeper_name": "Cory's Spiders",     // display fallback
  "dam_scientific_name": "… | null",          // from offspring→egg_sac→pairing, if linked
  "sire_scientific_name": "… | null",
  "sac_laid_date": "2026-04-02 | null",
  "dob_or_acquired": "…",
  "molt_count_at_transfer": 3,                // count of source's molt logs at transfer time
  "last_molt_at_transfer": "2026-06-01 | null",
  "source_invert_id": "…uuid…",
  "transferred_at": "2026-06-15T…"            // filled at claim
}
```

> Do **not** copy the seller's feeding/molt/substrate **log rows** to the buyer —
> those are the seller's husbandry record. Snapshot the key facts (DOB, last molt,
> molt count) into `provenance` instead. Buyer starts their own logs fresh.

> **Set expectations on lineage richness — don't oversell "pedigree."** Dam / sire /
> sac-date are only populated when the animal was **bred on-platform and linked to an
> `Offspring` record** — i.e. the breeding-module (premium) cohort. For the large
> majority of transfers (a keeper rehoming something they bought), the snapshot is
> just species + DOB + molt count, and the lineage fields are null. That's fine and
> nullable-handled, but the **claim-page and provenance UI must degrade honestly**:
> render a full "Pedigree" block only when dam/sire are present; otherwise show a
> plain "Provenance" block (bred/sold by @breeder, acquired date, molt history). Do
> not show empty "Dam: —  Sire: —" rows or imply a pedigree exists when it doesn't.
> This matters for the honesty-first principle — the rich version is a premium-cohort
> artifact, not the common case.

### 4d. Migration ordering (circular FK — read before writing)

`animal_transfers.invert_id → inverts.id` and `inverts.source_transfer_id →
animal_transfers.id` reference each other. A single `create_table` with both FKs
in place will fail on ordering. Sequence the migration:

1. `op.create_table("animal_transfers", ...)` — but **omit** nothing here; its
   `invert_id → inverts` FK is fine because `inverts` already exists.
2. `op.add_column("inverts", source_transfer_id ...)` **without** the FK, then
   `op.create_foreign_key(...)` referencing `animal_transfers` as a separate step
   (or declare the column FK with `use_alter=True`).

Add the other provenance columns (`bred_by_user_id`, `origin_keeper_name`,
`provenance`, `transferred_out_at`) in the same migration. As always: verify the
current single head, chain `down_revision` to it, and test `upgrade`/`downgrade`.

---

## 5. API (all under `/api/v1`)

### `POST /inverts/{invert_id}/transfer`  (auth, owner only)
Create a pending transfer. Body: `{ note?, sale_price?, include_photos?=true, expires_in_days?=30 }`.
- Verify the invert belongs to `current_user` and isn't already `transferred_out_at`.
- Build the snapshot (§4c) **now** (freeze).
- `token = secrets.token_urlsafe(32)`; `expires_at = now + expires_in_days`.
- Returns `{ token, claim_url: f"{web_base}/claim/{token}", expires_at }` — mirror
  `create_upload_session` in `routers/qr.py` for `web_base` resolution.
- **Gating:** none in v1 (see §8). Creating a transfer is free.

### `GET /transfers/{token}`  (public, `_optional_user`)
Preview for the claim page. Returns species/taxon/sex/name, photo URLs, care-sheet
ref (species_id → care sheet), breeder display name, `note`, lineage snapshot, and
`status`. Never returns `sale_price`. Handle `claimed` / `cancelled` / past-`expires_at`
(lazily flip to `expired`, mirror the lazy-expiry pattern in `utils/subscription.py`)
with explicit states so the page can render "already claimed / no longer available."

### `POST /transfers/{token}/claim`  (AUTH REQUIRED)
The onboarding gate — buyer must be logged in (new users register first, then resume; see §6).
- Validate: `pending`, not expired, `current_user.id != from_user_id` (can't claim
  your own), not already claimed.
- Create a **new** `Invert` owned by `current_user`: copy `taxon`, `species_id`,
  `name`, `common_name`, `scientific_name`, `sex`, `life_stage`, and the husbandry
  **target** fields (enclosure_type, substrate_type, target_temp/humidity, water_dish,
  misting_schedule). Set `source = Source.BOUGHT`, `date_acquired = today`,
  `bred_by_user_id` / `origin_keeper_name` / `source_transfer_id` / `provenance`
  from the snapshot (stamp `transferred_at`).
- If `include_photos`: **true copy, not reference — this is the hard part of the
  build; de-risk it first.** Referencing the seller's `photos` rows means the seller
  later deleting a photo (and its R2 object) silently breaks the buyer's provenance
  record. Each copied photo must be a **new `photos` row** pointing at a **new R2
  object under a buyer-scoped key**, created via server-side R2 `copy_object`
  (the R2 creds already used for upload make this feasible — see `routers/photos.py` /
  the R2 client setup). Set the new invert's `photo_url` to the copied hero. Prove the
  `copy_object` path works (auth, key scheme, thumbnail handling) as a spike before
  building the rest of the claim flow — don't discover it mid-claim. See AC in §10.
- Mark transfer: `status=claimed`, `to_user_id=current_user.id`,
  `claimed_invert_id=new.id`, `claimed_at=now`.
- Mark **source** invert: `transferred_out_at=now`.
- If the source invert is linked to an `Offspring` (`offspring.invert_id == source.id`):
  set `status=SOLD` (use the existing `values_callable` enum), `status_date=today`,
  `buyer_info = current_user.username`.
- Enforce the buyer's own cap? **No** — claiming must never 402; the buyer is often a
  brand-new free user and this is the growth loop. Claimed animals are exempt from the
  cap check on claim (they can still hit the cap on their *next manual* add).
- Returns the new invert (so the client routes to its detail screen).

### `POST /transfers/{token}/cancel`  (auth, `from_user` only)
Only if `pending` → `status=cancelled`, `cancelled_at=now`.

### `GET /transfers/?role=sent|received`  (auth)
List the user's transfers for a "Transfers" management view.

---

## 6. Frontend

### Web
- **`/claim/[token]`** — new public page, mirror `/upload/[token]`. Shows the preview
  (photos, species, breeder, care-sheet link, note; **pedigree block only when dam/sire
  present — see §4c**, otherwise a plain provenance block). Primary CTA "Add to my
  collection." If logged out → route to register/login with `?next=/claim/{token}` so
  the token survives signup, then auto-resume the claim. On success → buyer's new
  animal detail, with a "Welcome — here's your new T." moment.
- **New-signup attribution mechanism (don't hand-wave this):** the
  `transfer_claimed { was_new_signup }` flag (§7) must be *known*, not guessed. Carry
  it off the resume path: when register/login is entered with `?next=/claim/{token}`,
  set a `from_claim=true` marker through the auth flow and have the client pass
  `new_signup` into the claim call (or the server compares `user.created_at` to "now"
  within a short window as a fallback). **Use the resume-path marker as primary**; the
  account-age check is only a backstop. Without this, the funnel's most important
  number — did this transfer create a new keeper — is a guess.
- **Initiate transfer** — action on the animal detail (`dashboard/inverts/[id]`) and
  on breeding **offspring** rows ("Transfer / mark sold → generate link"). Reuse web
  `QRModal` to show the QR + copyable `claim_url`.
- **Provenance block** — on `dashboard/inverts/[id]` and public **`/t/[id]`**: render
  from `provenance` + `bred_by_user_id` ("Bred by @breeder · dam X × sire Y · sac laid
  [date] · acquired [date]"). Link the breeder handle to their public profile if public.
- **"Transferred" badge** — source records with `transferred_out_at` show a badge and
  drop out of active collection counts/reminders.

### Mobile
- **Initiate transfer** — action on invert detail; reuse `QRSheet`/`QRModal` to share
  the `claim_url` (share sheet + QR). Same offspring-row affordance in the breeding hub.
- **Claiming** happens on the **web** `/claim/[token]` page (the buyer frequently
  doesn't have the app yet — that's the point). After a successful web claim, prompt
  app install. If the app *is* installed, deep-link `claim/{token}` into a native
  claim screen as a fast-follow (optional v1.1).
- **Provenance block** on the invert detail screen (read from `provenance`).
- Parity, dark mode, static JSX (Hermes), `getErrorMessage` for any 4xx — per the
  conventions in the breeding-gating brief.

---

## 7. Growth instrumentation (PostHog) — required, not optional

This is the first real custom-event funnel in the product (the 2026-06-15 analysis
found there are essentially none — only autocapture). Emit, server-side where
possible so it can't be ad-blocked:

- `transfer_created` — `{ from_user, taxon, species_id }`
- `transfer_link_viewed` — `{ token, authed: bool }`
- `transfer_claim_started`
- `transfer_claimed` — `{ to_user, was_new_signup: bool, taxon }` — `was_new_signup`
  sourced from the resume-path marker, not guessed (see §6)
- `transfer_signup` — claim drove a new registration

Build the funnel `created → viewed → claimed → new signup`. This is the metric that
tells us whether the flywheel is real. Use the same custom-event discipline to
backfill `paywall_viewed` / `checkout_started` / `subscribed` while you're in here
(the gating analysis flagged their absence).

---

## 8. Premium gating decision

**Recommendation for v1:**
- **Claiming: always free, never gated.** It's the growth loop and the new user.
  Gating it is self-defeating.
- **Creating transfers: free for everyone in v1.** Volume is tiny and the priority
  is loop velocity. Do **not** throttle the one viral mechanism while exposure is the
  proven bottleneck.

**Revisit later (don't build now):** once the loop is proven, candidate premium
hooks are *batch* transfers (hand off a whole sac at once) and *seller transfer
analytics* (where your animals went, claim rates). These align with the existing
breeding-premium audience without taxing the free loop. Add `can_use_*` flags then,
mirroring the `can_use_analytics` pattern (added 2026-06-15).

---

## 9. Phase 2 (scope now, build after v1 ships) — availability showcase

A **catalog, not a checkout.** Keeper profile shows an "Available" section; each item
links **out** to the seller's own sales channel.
- Add to `inverts` (or offspring): `listing_status` (`not_listed`|`available`|`reserved`),
  `sale_link` (URL — their MorphMarket/IG/site), `ask_price` (display-only string).
- Profile "Available" list renders these with a "View listing" button → `sale_link`.
- Still no in-app payment/messaging. This is the shop *window*; the shop is elsewhere.
- Keep it Phase 2 so v1 (transfer) ships focused.

---

## 10. Edge cases & acceptance criteria

- [ ] Claim requires auth; logged-out claimers register/login and the token survives (`?next=`), claim auto-resumes.
- [ ] Cannot claim your own transfer; cannot double-claim; expired/cancelled render explicit non-blocking states.
- [ ] Source record gets `transferred_out_at`, shows a "Transferred to @buyer" badge, and is **excluded from the collection cap and from care reminders**.
- [ ] Claimed animals never trigger a 402 for the buyer.
- [ ] `provenance` snapshot is immutable (frozen at create); editing/deleting the seller's record after claim does not alter the buyer's provenance or copied photos.
- [ ] Photos are **true-copied**: new `photos` rows pointing at **new R2 objects under buyer-scoped keys** (server-side `copy_object`). Verified by deleting the seller's original photo + R2 object and confirming the buyer's copy still resolves.
- [ ] **Count consistency:** the seller's displayed active animal count (dashboard, "X of N", grid) equals the number the cap enforces — transferred-out animals are excluded from both. Verified by transferring an animal and confirming the displayed count drops and matches `enforce_collection_limit`.
- [ ] Transferred-out animals appear in the "Transferred" view, not the main grid, and are not deleted.
- [ ] Linked `Offspring` auto-flips to `SOLD` with `buyer_info` + `status_date`.
- [ ] Enum casing correct: `source=BOUGHT` (UPPERCASE name, no `values_callable` — matches `inverts.sex/source`); offspring `SOLD` via its existing `values_callable`.
- [ ] Works for every taxon (key on `invert_id`; tarantulas via shared PK).
- [ ] No `sale_price` ever leaves the server to the buyer.
- [ ] PostHog funnel events fire (§7).
- [ ] Web + mobile parity; both light/dark; EAS prod build (static JSX, no dynamic component patterns).
- [ ] Alembic: single head, `down_revision` chained to current head, `upgrade`/`downgrade` both tested.

---

## 11. Known limitations & future notes

- **Leaked claim link = wrong person captures the provenance record (low impact).**
  The token is single-use, cancellable, and 30-day-expiring, which covers the common
  case, but there's no control over *who* claims a link that's been forwarded. Note:
  this only transfers the **record**, not the animal — the animal has already changed
  hands physically. For high-value handoffs, a future option is an optional **claim
  PIN** (seller sets it, shares out-of-band) or **seller-confirms-claim** (claim goes
  `pending_confirmation`, seller approves). Not in v1; documented so it's a deliberate
  deferral, not an oversight.
- Lineage is single-hop provenance in v1; a multi-generation pedigree *graph* is future.

---

## 12. Out of scope

- No payments, escrow, offers, bidding, or in-app sale messaging — ever (§1 bright line).
- No copying of the seller's feeding/molt/substrate log rows (snapshot facts only).
- No marketplace search/discovery ranking. Availability (Phase 2) is profile-scoped catalog only.
- Lineage *graph* visualization (multi-generation tree) is a future nice-to-have; v1
  provenance is the single-hop snapshot + breeder link.
