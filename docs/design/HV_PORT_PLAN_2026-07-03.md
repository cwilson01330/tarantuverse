# Herpetoverse ← Tarantuverse feature-port plan — 2026-07-03

**Goal:** bring the features hardened on Tarantuverse (TV) over to Herpetoverse (HV).
**Method:** inventoried both HV surfaces (`apps/web-herpetoverse`, `apps/mobile-herpetoverse`) + the shared `apps/api`, cross-referenced against TV's recent hardening. Builds on `HV_AUDIT_2026-06-12.md` (whose P0 account-deletion bug + data export are now fixed).

---

## Architecture reality (read first)

HV and TV **share one FastAPI backend** (`apps/api`). HV reptiles/amphibians live in the `animals` table (`routers/animals.py`); TV inverts live in `inverts`. Security hardening, auth, token blocklist, CORS, file validation, data export, and the notifications *table* are therefore already shared and working for HV.

**The catch:** several of TV's flagship features are implemented *invert-only* — their logic reads the `inverts` table directly. Feeding cadence, digests, import inference, and transfers all fall here. Porting them to HV is **not "reuse the shared endpoint"** — it's "add a parallel `/animals/*` endpoint that mirrors the `/inverts/*` one," because the per-taxon logic genuinely differs (a snake fed every 10 days vs. a sling fed every 5; weight-based feeding vs. prey-size). Frontend then wires to the HV endpoint.

---

## Already in HV — do NOT re-port

| Feature | Status in HV |
|---|---|
| Care-sheet **SEO server-render** | ✅ Already correct — `species/[slug]/page.tsx` is a real async server component rendering `<CareSheet>` server-side (HV avoided the TV client-shell bug). |
| **Security hardening** (rate limit, token revocation, CORS, magic-byte upload validation) | ✅ Shared `apps/api/app/main.py`. |
| **Account deletion + settings + profile editor + password reset** | ✅ Fixed post-06-12 (passive_deletes) on both surfaces. |
| **Data export** (reptile-aware) | ✅ `export_service.py` covers animals/sheds/weights/genotypes/reptile-breeding; web download UI + mobile link-out. |
| **QR identity / enclosure labels** | ✅ `reptile/qr/[id]`, `lizard/qr/[id]` (mobile). |
| **Route consolidation** (ADR-003) | ✅ One `/reptile/*` tree; `/lizard/*` is a redirect shim. |
| Breeding, morph calculator, achievements (web) | ✅ Present. |

Not applicable to reptiles: **Colony mode** (communal inverts), **Stripe billing** (HV launches free), **Premolt prediction** (invert molting — the reptile analog is *shed prediction*, a new v1.1 feature, not a port).

---

## Port opportunities — prioritized

### P1 — Feeding Day + working feeding reminders (the reptile daily loop)

Reptile keeping is *scheduled batch feeding* — "Sunday is feeding day, I feed all my snakes." This is the single best-fit port for HV; arguably it fits reptiles better than inverts.

- **1a. Feeding Day / bulk feeding.** TV: `GET /inverts/feeding-status` + `POST /inverts/bulk-feedings` + `feeding-day` screens (web + mobile). HV needs a **parallel `GET /animals/feeding-status` + `POST /animals/bulk-feedings`** (cadence from `animals.feeding_schedule` / species data, honoring `feeding_paused_*` + calendar-day-diff via tz_offset), then port the Feeding Day screen to web + mobile.
- **1b. Make reminders actually fire.** HV mobile `services/notifications.ts` is **local-only with no push-token registration** — the exact broken state TV's push was in before ADR-009. Apply the ADR-009 delivery fixes (register the Expo token on login/launch with the correct EAS projectId; FCM/APNs is a native-build step).
- **1c. Daily feeding digest (animal-aware).** `digest_service.py` is invert-only. Add an animals path so HV users get one "N reptiles due for feeding" push at their local hour instead of nothing (or per-animal spam).

**Effort:** parallel animals endpoints + notif token registration (JS/OTA) + digest branch; FCM/APNs needs the next native build. **Value:** highest — this is the core utility loop.

### P2 — Notification center (in-app)

TV shipped an in-app notification center + bell (`routers/notifications.py` table is already shared/generic). HV has `notification-preferences` but no **center** or **bell**. Port the web `TopBar` bell + `dashboard/notifications` and the mobile `NotificationBell` + `notification-center.tsx`. Mostly **frontend-only** since the notifications table + endpoints are taxon-agnostic. Pairs naturally with P1 (digest writes rows the center displays).

### P3 — Import (bring-your-collection)

Competitive-parity + signup-friction reducer. TV: `import_service.py` + `/import/analyze` + `/import/commit` + web/mobile import UI. Import service is **invert-hardcoded** → needs an `animals` inference path (species/taxon auto-link against `herp_species`, morph/sex/date inference, dedupe). Then port the confirm-flow UI. **Effort:** backend animals-import + frontend. Google-Sheets link-in comes along for free.

### P4 — Transfers / provenance ("rehome")

Reptile morphs are sold/traded heavily, so provenance ("bred by", lineage) is arguably *more* valuable here than for inverts. TV `transfers.py` + `animal_transfer.py` are **invert-only** despite the model name. Needs a parallel animals transfer path (claim link, R2 photo copy, cap/count exclusion, provenance fields on `animals`) + web claim page + mobile initiate-transfer. **Effort:** backend + frontend; **Value:** high for the reptile market, but more v1.x than launch-critical.

### P5 — Polish parity

- **Mobile achievements** — HV web has the gallery; mobile has none. Also `achievement_service.py` is tarantula-only → add reptile milestones (first shed, weight-gain, first clutch/hatch, X animals). Frontend screen + backend reptile-aware checks.
- **Onboarding (mobile)** — no welcome flow; port TV's 4-screen pattern with reptile copy. Frontend-only.
- **Discover / global search / collection value** — `discover.py`/`search.py` exist backend; no HV UI. Frontend-only; v1.1.

---

## Recommended sequencing

1. **P1 Feeding Day + reminders** — flagship reptile utility; ship the `/animals/feeding-status` + `/animals/bulk-feedings` endpoints, the Feeding Day screens, push-token registration, and the animal-aware digest together.
2. **P2 Notification center** — small, mostly frontend, makes P1's digest visible in-app.
3. **P3 Import** — growth/onboarding lever.
4. **P4 Transfers** — reptile-market feature; v1.x.
5. **P5 Achievements(mobile)/onboarding/discover** — polish.

## Cross-cutting recommendation

Four ports (feeding-status/bulk, digest, import, transfers) each need a parallel `/animals/*` mirror of an `/inverts/*` endpoint. Rather than copy-paste, factor the **taxon-agnostic scaffolding** (cap/count exclusion, tz calendar-day diffs, claim-link/R2 mechanics, digest scheduling) into shared helpers and keep only the genuinely taxon-specific bits (cadence source, species catalog) per-taxon. This keeps a *third* taxon platform cheap later and prevents the two apps from drifting.

## Native-build note

HV mobile push (FCM/APNs) and any new native dependency (e.g. document-picker for import file upload) require an `eas build` + store submission, not an OTA update — batch those the same way as TV.
