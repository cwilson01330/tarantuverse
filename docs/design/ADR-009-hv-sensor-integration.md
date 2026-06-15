# ADR-009 — Herpetoverse Temperature/Humidity Sensor Integration

**Status:** Proposed (planning) — 2026-06-12
**Supersedes the parked note** `project_sensor_tracking_idea` (2026-06-01, "manual entry first")
**and the loose CLAUDE.md scoping** (2026-06-04, "SwitchBot Tier 1 + webhook Tier 2").
**Scope:** Herpetoverse first (reptile/amphibian husbandry is the strongest fit).
The model is taxon-agnostic and can extend to inverts later.

---

## Context

Reptile keepers manage a **thermal gradient**, not a single number: a warm/basking
end, a cool end, a night drop, and (for sheds, breeding, brumation) specific humidity
bands. Manual spot-checks miss the thing that actually kills animals — a stuck
thermostat or a dried-out enclosure between checks.

Two pieces of groundwork already exist and shape this design:

1. **`herp_species` already stores zoned targets** — `temp_cool_*`, `temp_warm_*`,
   `temp_basking_*`, `temp_night_*`, `humidity_*`, and `humidity_shed_boost_*`. So we
   can produce *correct* per-zone, time-aware alerts without inventing target data.
2. **The shared `enclosure` table exists** with `target_temp_min/max` and
   `target_humidity_min/max`, but HV's enclosure UI is thin (picker-only — see the
   2026-05-22 parity audit). Readings belong to an enclosure, so this feature has a
   dependency on making enclosures slightly more first-class in HV (below).

---

## Hardware decision — "most robust, least expensive" (researched 2026-06-12)

The driving question was which sensor to build around. Findings:

| Option | Hardware cost | API for a hosted app | Notes |
|---|---|---|---|
| **Ecowitt** | Gateway ~$45 + WN31 multi-channel ~$17 ea (**8 sensors/gateway**) | Cloud API (api.ecowitt.net, app+API key) **and** local "Customized" push | **Cheapest per enclosure by far.** Local push is HTTP-only (can't hit our HTTPS host directly) → use cloud poll, or a local bridge (HA) for push. |
| **SensorPush** | G1 gateway ~$100 + HT1 ~$50 ea | Clean cloud API, no monthly fee (beta: request access) | Most robust API, but premium pricing. |
| **SwitchBot** | Meter ~$15–23 + Hub ~$40–59 (hub required for cloud) | Official cloud API (poll) | Mainstream, plug-and-play; hub is the catch. |
| **Govee** | ~$13/sensor (cheapest sensors) | Developer API historically limited/gated | Cheap hardware, weakest API story — not a foundation. |
| **DIY ESP32 + SHT30/BME280** | ~$8–12/node | Pushes whatever we define | Absolute cheapest + most robust (you own it), most setup effort. Only for technical keepers. |

**Conclusion — don't build around one vendor. Build around a protocol.**

The cheapest *and* most robust path is a **generic webhook ingest endpoint** as the
foundation:

- It costs us zero per-vendor cloud work.
- It's the DIY path (ESP32) and, crucially, the **Home Assistant** path — HA can
  ingest literally any sensor (Ecowitt local push, Govee BLE, Zigbee, SwitchBot…)
  and forward to us over HTTPS. HA is the universal, vendor-agnostic bridge.
- It sidesteps Ecowitt's HTTP-only limitation (HA relays).

Then add **thin cloud-poll adapters** for keepers who don't run HA, in cost order:
**Ecowitt first** (best $/enclosure for someone with several animals), then
SwitchBot / SensorPush for convenience. Govee only if its API proves viable.

**Recommended keeper guidance (for docs, not code):**
- Multiple enclosures, cost-sensitive → **Ecowitt** (1 gateway + multi-channel sensors).
- Already runs Home Assistant → **anything**, via the webhook.
- Wants simplest premium → **SensorPush**.
- Tinkerer → **ESP32 + webhook**.

---

## Decision

### 1. Data model (taxon-agnostic, zone-tagged)

**`sensors`** — a registered physical sensor.
```
id, user_id, enclosure_id (FK, nullable), name,
zone            -- ambient | basking | warm | cool | humid_hide  (placement)
source          -- webhook | ecowitt | switchbot | sensorpush | manual
external_id     -- vendor device/channel id (cloud-poll) or null
ingest_token    -- per-sensor secret for webhook auth (webhook source)
last_reading_at, battery_pct, is_active,
created_at, updated_at
```

**`enclosure_readings`** — an individual measurement (time series).
```
id, sensor_id (FK), enclosure_id (FK, denormalized for query),
recorded_at, temp_f (nullable), humidity_pct (nullable),
battery_pct (nullable), raw_payload (JSONB),
source
```

`zone` lives on the **sensor** (a sensor has a fixed placement), so every reading
inherits its zone. Zone defaults to `ambient` so it's never mandatory — matches the
ADR decision to make zone-tagging the model without forcing it on casual users.

### 2. Alerts — against `herp_species` zoned targets, time- and state-aware

For each active sensor, compare its latest reading to the **matching** species band:
- `basking` zone → `temp_basking_min/max`; `warm` → `temp_warm_*`; `cool` →
  `temp_cool_*`; at night (keeper-local) → `temp_night_*` regardless of zone.
- humidity → `humidity_min/max`, **or** `humidity_shed_boost_*` when the animal is
  flagged in-blue / pre-shed (we already track `last_shed_at` / in-blue on `animals`).
- Fall back to the enclosure's own `target_*` when the species row lacks a band, then
  to no-alert (never invent a threshold — honesty-first).
- **Surface battery prominently.** A dead sensor silently lies; a stale
  `last_reading_at` or low `battery_pct` must raise its own "sensor offline" alert,
  not a false "all good."

Cadence: cloud-poll ~10 min (honest "live within 5–15 min" — say so in the UI).

### 3. Enclosure dependency

Readings attach to an `enclosure`. HV enclosures are picker-only today. Minimum to
unblock: let an HV keeper create/name an enclosure and attach an animal to it
(lightweight CRUD), so a sensor has a real home. Alternative interim: attach a sensor
directly to an `animal` and resolve its enclosure — but that breaks for communal/rack
setups, so enclosure-first is the right call. **This is a prerequisite sub-project.**

### 4. Ingestion — sequencing

1. **Manual readings + the data model + zone-aware alerts.** Proves schema, UI, and
   (most importantly) the alert logic against the zoned species data with zero
   hardware risk. A keeper can log a spot reading and immediately get "basking 4° low."
2. **Generic webhook ingest** — `POST /sensors/{id}/readings` authed by `ingest_token`.
   Documented JSON shape + an Ecowitt-protocol parser variant. Unlocks ESP32 + Home
   Assistant (→ every brand) on day one.
3. **Ecowitt cloud-poll adapter** — cheapest plug-and-play for non-HA keepers.
4. **SwitchBot / SensorPush adapters** — convenience tiers, later.

Items 1–2 are the realistic first build and are vendor-risk-free.

---

## Consequences

- **Pro:** vendor-agnostic, cheapest possible entry (ESP32/Ecowitt/HA), and the
  expensive part (per-vendor cloud) is deferred and optional.
- **Pro:** alerts are genuinely reptile-correct (zone + night + shed-boost), which no
  generic "smart thermometer" app does — a real differentiator.
- **Con:** depends on first-class-ish enclosures in HV (prerequisite work).
- **Con:** Ecowitt's HTTP-only local push means direct-to-cloud push needs HA or the
  Ecowitt cloud API; documented, not blocking.
- **Watch:** time-series growth — `enclosure_readings` at 10-min cadence is ~144
  rows/sensor/day. Plan a retention/rollup policy (raw 30–90 days, then hourly/daily
  aggregates) before this ships widely.

---

## Open questions for Cory

1. OK to treat **lightweight HV enclosure CRUD** as the prerequisite, or prefer the
   interim "sensor attaches to animal" shortcut for v1?
2. Is sensor monitoring a **free** feature or a **premium** hook? (HV launches free —
   but cloud-poll has real server cost; webhook/manual are nearly free to run.)
3. Retention policy preference for raw readings (30 vs 90 days before rollup)?

---

**Sources (2026-06-12):**
[SwitchBot Meter / Hub](https://us.switch-bot.com/products/switchbot-meter-plus) ·
[Ecowitt sensors + gateways](https://shop.ecowitt.com/collections/wifi-sensor) ·
[Ecowitt customized server upload (Home Assistant)](https://www.home-assistant.io/integrations/ecowitt/) ·
[SensorPush G1 + cloud API](https://www.sensorpush.com/gateway-cloud-api) ·
[Govee vs SensorPush](https://us.govee.com/blogs/product-review-blog/govee-vs-sensorpush-wireless-smart-temperature-sensor)
