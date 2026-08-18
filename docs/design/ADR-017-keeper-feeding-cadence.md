# ADR-017 — Keeper-set feeding cadence

**Status:** Proposed — 2026-08-09
**Applies to:** Tarantuverse and Herpetoverse, API + both clients
**Related:** ADR-014 (evidence-first), SPEC-species-aware-premolt, `feeding_paused_*` (pst_20260502)

---

## Context

A keeper reported that her tarantulas "still show feed every 3 days". Two real
defects were found and fixed in the process — a floored upper bound in the
frequency parser, and a fallback that let a known adult inherit a sling's
cadence. Neither was the actual cause of her experience.

Her feeding logs explain it. Across 37 animals she feeds on a **roughly weekly**
schedule regardless of species or stage:

| her animal | she feeds | care sheet says |
| --- | --- | --- |
| *C. versicolor* sling | 7.9 days | every 2–3 |
| *T. kahlenbergi* sling | 8.1 | 2× per week |
| *M. balfouri* sling | 8.2 | every 3–4 |
| *P. irminia* juvenile | 8.0 | twice per week |
| *L. parahybana* sling | 11.0 | every 2 |

That is a deliberate, consistent husbandry style — the same one the project
owner uses — not neglect. But measured against the care sheets, **every animal
she owns is overdue nearly all the time.** The app has been continuously telling
her she is failing her collection.

She also mentioned having severe OCD and wanting to stay on track. For that
person a permanent wall of overdue badges is not a mild annoyance; it manufactures
the exact anxiety she is using the app to manage.

### Why not just change the care sheets

Platform-wide, the observed median gap between accepted feedings is **4.0 days**
for slings and juveniles across 95 and 56 animals respectively. The sheets are
broadly calibrated to what most keepers actually do. Rewriting them toward weekly
would make them wrong for the majority in order to be right for one person.

The mismatch is not in the data. It is that the app has no way for a keeper to
say *"this is my cadence"*.

---

## Decision

Add an optional **keeper-set feeding interval** per animal. When present it
replaces the derived interval entirely, and the UI attributes it to the keeper
rather than to a care sheet.

### Precedence

```
1. feeding_paused_until      — active pause wins over everything (unchanged)
2. animal.feeding_interval_days  — the keeper said so
3. species care sheet, by life stage
4. life-stage default (5 / 7 / 10)
5. generic default (7)
```

A keeper's stated cadence outranks a care sheet because it is a fact about how
this animal is actually kept, while the sheet is a general claim about the
species. We are not better informed than the person holding the animal.

### Schema

```sql
ALTER TABLE inverts ADD COLUMN feeding_interval_days INTEGER;  -- nullable
ALTER TABLE animals ADD COLUMN feeding_interval_days INTEGER;  -- HV parity
```

Nullable with no backfill: absent means "derive it", which preserves today's
behaviour for everyone who hasn't set one.

**Deliberately NOT added to `tarantulas` / `scorpions`.** Feeding status is
computed from `inverts` (`active_inverts_query`), so the legacy tables never
read it. Adding it there would create a shared column needing a mirror entry in
both directions for no benefit — see `test_dualwrite_coverage.py`.

Validate `1 <= feeding_interval_days <= 365`. Reject 0 rather than treating it
as "unset"; a keeper who types 0 has made a mistake and should be told.

### Honesty

`INTERVAL_SOURCE_*` gains `keeper`. The UI must distinguish it:

- `species` → "Care sheet suggests every 4 days"
- `stage_default` / `generic_default` → "Roughly every 7 days" (a guess, labelled)
- `keeper` → **"Your cadence — every 7 days"**

The rule from `_recommended_feeding_interval_with_source` still holds: never
present a guess as a claim. A keeper-set number is the strongest of the three,
and it must not be dressed up as species knowledge — it is the keeper's own
judgement reflected back.

### Setting it

**This must not make the app more complicated for keepers who don't need it.**
Most keepers will never set this, and the feature failing quietly for them is
better than a new control everyone has to read past. Concretely:

- **Not on the add form.** Adding an animal must not get one field longer.
  A new keeper adding their first sling has no basis for answering this and
  should never be asked.
- **Not a visible field by default on the edit screen.** It sits with the pause
  control, which is already the "how this animal is handled" area, and reads as
  a link — *"Feed on my own schedule"* — rather than a labelled input demanding
  a number.
- **The real discovery path is the overdue state itself.** Someone repeatedly
  flagged is the only person who needs this, and that is exactly when to offer
  it: from the overdue badge or Feeding Day, *"This care sheet says every 4
  days. Feed yours weekly instead?"* The feature finds the keepers who need it
  instead of presenting itself to everyone.

**In bulk** — the case that actually matters. Courtney has 37 animals; asking
her to set the same number 37 times is not a fix. Multi-select on the collection
with "Set feeding cadence", plus the offer above surfaced from Feeding Day when
several animals are overdue at once.

A per-keeper *default* was considered and rejected: a keeper who feeds slings
weekly and adults fortnightly is not served by one global number, and the bulk
action covers the same ground without introducing a second concept.

### Restraint

If this ships and nobody finds it, that is an acceptable outcome — the keepers
who need it are a minority, and the majority losing nothing is the point. The
failure mode to avoid is not "under-discovered", it is **every keeper having to
form an opinion about a number they were previously happy to let the app
choose.**

### Interaction with existing behaviour

- **Pause** is temporary and reason-coded; cadence is a standing preference.
  Independent, and pause still wins while active.
- **Daily digest** and Feeding Day read the same resolver, so both inherit this
  for free.
- **Premolt prediction** reads feeding *refusals*, not the interval. Unaffected.
- **Detritivores** already return `(None, None)` and are never overdue. Unchanged.

---

## What this deliberately does not do

**It does not soften the word "overdue".** That is a separate and probably
worthwhile question — "overdue" is a harsh frame for an animal that is fine —
but conflating copy changes with a data model change makes both harder to reason
about. Filed separately.

**It does not distinguish a 2nd-instar sling from a 1.5" one.** "Sling" spans an
enormous range and no single per-stage number is right across it. A keeper-set
cadence sidesteps that rather than solving it. Solving it properly means either a
size input or finer stages, and that is a bigger question.

**It does not change any care sheet.** Two species do look genuinely
miscalibrated against observed behaviour — *L. parahybana* slings (sheet says
every 2 days, keepers do 5.0) and *H. pulchripes* slings (sheet says 5–7,
keepers do 3.7) — but those are content edits with their own evidence, tracked
in the Care sheets queue.

---

## Rollout

1. Migration adding the nullable column to `inverts` and `animals`.
2. Resolver change plus the new `keeper` source value; API returns it in feeding
   status and animal detail.
3. Per-animal control on both platforms, then the bulk action.
4. Tell the keepers who reported it. Courtney's collection resolves the moment
   she sets 7 days once.

## Consequences

Keepers whose practice differs from a care sheet stop being told they are wrong
daily. The cost is one more field that can drift from reality — someone who sets
5 days and then changes habits will get stale nudges — but a wrong number the
keeper chose is more defensible than a wrong number we chose for them.

It also gives an honest signal for later: a species where many keepers override
in the same direction is a care sheet worth re-examining, and that is far better
evidence than a single report.
