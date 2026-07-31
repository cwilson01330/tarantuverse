# ADR-015 — Per-animal events, and how we handle death

**Status:** Accepted (2026-07-31)
**Applies to:** Tarantuverse (`inverts`) and Herpetoverse (`animals`)
**Supersedes nothing. Depends on:** ADR-005 (inverts consolidation), ADR-010 (colony mode)

---

## Context

Colonies got an event log in ADR-010 (`colony_events`: birth, death, cannibalism,
aggression, molt found, observation…). Individual animals never got one, and the
gap turns out to be bigger than "colonies have a nicer timeline".

Three findings from the 2026-07-31 audit:

### 1. An animal cannot die

There is no `died_at`, no `is_alive`, no archive, and no soft-delete on `inverts`
or `animals`. The only lifecycle column is `transferred_out_at`, and that can
only be set by *another user* completing a claim — there is no self-service path.

So a keeper whose animal dies has exactly two options: hard-delete it, or leave
it in the collection pretending it's alive. A feeder cricket colony can die and
an unsold spiderling can die (`OffspringStatus.DIED`), but a keeper's actual pet
cannot.

### 2. Deleting destroys far more than the animal

`DELETE /inverts/{id}` cascades to `feeding_logs`, `molt_logs`,
`substrate_changes`, `photos`, `qr_upload_sessions`, `animal_transfers` — and,
via `pairings`, to `egg_sacs` and every `offspring` row beneath them.

Deleting a breeding female erases the recorded lineage of everything she
produced. The animal is gone either way; the history didn't have to be.

### 3. The free tier charges you for grief

`active_inverts_query` filters only on `transferred_out_at`. A dead-but-retained
animal counts fully against the cap, so a free-tier keeper at their limit must
delete an animal — destroying its entire history — to make room for another.

That is the part of this we consider a live defect rather than a missing
feature, and it is the reason this ADR exists now rather than later.

### Related, and the same root cause

`molt_logs` has no outcome field. Molting is the single most dangerous event in
a tarantula's life and the most common way one dies, and there is nowhere to
record a stuck molt, a lost limb, or a death during molt — only free text.

Herpetoverse already solved the analogous problem: `shed_logs` carries
`is_complete_shed` / `has_retained_shed` / `retained_shed_notes`, with the
rationale written into the model — *"a keeper logging 'incomplete shed +
retained eye caps' is reporting a humidity problem, not just a timestamp."*
That argument applies unchanged to molts; it was simply never ported.

---

## Decision

### D1 — Death is a terminal state, never a delete

Add to `inverts` and `animals`:

| Column | Type | Notes |
| --- | --- | --- |
| `died_at` | `Date`, nullable, indexed | The date, not a timestamp. Keepers know the day, rarely the hour, and a spurious 03:00 is a false precision. |
| `death_cause` | `String(40)`, nullable | Controlled vocabulary, see D4. Nullable because "unknown" and "didn't say" are different answers. |
| `death_notes` | `Text`, nullable | Free text. Often the most valuable field. |

Setting `died_at` makes the record **read-only history**, structurally identical
to `transferred_out_at`:

- every log, photo and molt is retained
- excluded from the collection list (visible under an explicit archive view)
- excluded from the free-tier count (D2)
- excluded from feeding status, overdue, Feeding Day, digests, premolt scans
- shown with a distinct badge and date line

Hard delete stays available. Some records are genuinely mistakes and people are
entitled to remove them. It stops being the *only* option.

**Why not reuse `transferred_out_at`:** structurally identical, semantically
wrong. A "Transferred" badge on an animal that died is worse than no feature.

### D2 — A deceased animal never counts toward the cap

`died_at IS NULL` joins `transferred_out_at IS NULL` inside
`active_inverts_query` / `active_animals_query` in `utils/limits.py`.

Considered and rejected: a grace period, on the grounds that it prevents a
"delete to free a slot" loophole. But the loophole it prevents is a keeper
*losing an animal*, and the cost of preventing it is showing a paywall to
someone at the worst possible moment. We would rather absorb the occasional
freed slot.

This is not primarily a monetisation decision. Charging someone for an animal
that died — or requiring them to erase its history to make room — is not a
trade we are willing to make for cap integrity.

### D3 — The word is "died"

`died_at`, "Date of death", "Mark as died". Plain, matching how keepers actually
speak ("I lost her", "she died"), and consistent with the existing TV
`OffspringStatus.DIED`.

Rejected: "passed away" (euphemistic, and absurd for a roach colony),
"deceased" (clinical, reads like a form), "lost" (already means *escaped* in
keeper usage — genuinely ambiguous in a husbandry app).

HV's `ReptileOffspringStatus.DECEASED` stays as-is for now; renaming a live PG
enum is not worth it. New surfaces use "died". **Note the inconsistency rather
than pretending it isn't there.**

Visual treatment: the codebase currently has three (`💀`, `✝️`, `☠`). Unify on a
neutral mark; a skull on a beloved animal's memorial page is the wrong register.
`✝️` is worse — it imposes a religious frame on other people's grief.

### D4 — Cause of death: offered, never demanded

An optional picker plus free text. Every field skippable; the form submits with
a date alone.

Vocabulary (TV): `bad_molt`, `dehydration`, `dks`, `injury`, `escaped`,
`old_age`, `illness`, `unknown`, `other`.

`unknown` is a **first-class answer, not a null**. Most invertebrate deaths are
genuinely unexplained, and a keeper who honestly doesn't know should be able to
say so rather than leave a blank that reads as an omission.

The husbandry value is real — with enough records we could eventually tell
keepers which species most often die in molt, which is the sort of thing the
hobby argues about without data. But that is a *consequence* of collecting this
well, never a reason to press someone for it. If mortality data is ever
surfaced publicly it will be aggregate, opt-in, and honest about sample size
(see ADR-014).

### D5 — A generic per-animal event log

New table `animal_events`, modelled on `ColonyEvent` minus `count_delta` and
`stage` (an individual has no population and no buckets):

```
id, invert_id (nullable), animal_id (nullable),   -- exactly one, CHECK
user_id, event_type (String 30), occurred_at (Date),
severity (minor|moderate|severe, nullable), notes (Text), created_at
```

Event types: `injury`, `illness`, `bad_molt`, `escape`, `recovered`,
`rehoused`, `observation`, `vet_visit` (HV-leaning), `death`.

**Why a new table rather than extending an existing log:** the existing
per-animal logs are all *typed* records with type-specific columns (a feeding
has prey and acceptance; a molt has measurements). An event is deliberately
untyped — the point is somewhere to record the thing that doesn't fit. Forcing
it into `notes` on an unrelated log is how observations get lost.

**Why not just reuse `colony_events` with a nullable animal FK:** the count
mechanics (`count_delta` adjusting a `stage_counts` bucket) are the core of
`ColonyEvent` and meaningless for an individual. Sharing the table means every
read has to branch on which half of the columns apply.

`death` exists as an event type so the timeline reads coherently, but `died_at`
on the animal remains the **source of truth** for filtering. Deriving liveness
by scanning an event log would be a correctness trap.

### D6 — Molt outcome

Add to `molt_logs`, mirroring `shed_logs`:

| Column | Type | Notes |
| --- | --- | --- |
| `outcome` | `String(20)`, nullable | `successful` \| `stuck` \| `lost_limb` \| `fatal` |
| `complication_notes` | `Text`, nullable | |

Nullable, not defaulted to `successful` — every existing molt row would then
claim an outcome nobody recorded. A null means "not stated".

`outcome='fatal'` does **not** auto-set `died_at`. It offers to. Inferring a
death from a molt log and silently retiring the animal would be the app
deciding something that grave on the keeper's behalf.

---

## Consequences

### Queries that must change

The audit found three call sites that bypass the shared active-query helpers and
would keep showing dead animals:

- `routers/inverts.py:311` — `GET /inverts/feeding-status` filters on **nothing**
  today. This is an existing bug: transferred animals already appear on TV
  Feeding Day. Fixing it here fixes both.
- `routers/inverts.py:140` — collection list; the `?transferred=` boolean needs
  to become a status filter now that there are three terminal states.
- `services/digest_service.py:81` — HV digest inlines its own filter instead of
  calling `active_animals_query`. Refactor to the helper.

Also: `services/premolt_service.py:199` and
`services/feeding_reminder_service.py:296` query legacy `Tarantula` directly with
no filter, and would generate premolt alerts for a dead spider.

### Accepted costs

- A free-tier keeper who loses an animal gets a slot back. Accepted (D2).
- Two words for death across products until the HV enum is worth migrating.
- `animal_events` overlaps conceptually with `colony_events` without sharing a
  table. Accepted: the duplication is ~40 lines, the alternative is a permanent
  branch on every read.

### Explicitly out of scope

- Bulk "mark several as died". Grim, and rare enough to not justify the UI.
- Auto-detecting death from prolonged non-feeding. Guessing an animal is dead is
  the single worst false positive this app could produce.
- Public memorials / a community "rainbow bridge" surface. Possibly worth doing,
  but it is a product decision about grief in a social space and deserves its own
  discussion, not a rider on a schema change.

---

## Phasing

1. **The defect** — `died_at` + `death_cause` + `death_notes`, the `limits.py`
   filter, and the three bypassing queries. Ships the cap fix and stops the
   nagging.
2. **Molt outcome** — small, high husbandry value, independently useful.
3. **`animal_events`** — the generic log, both products.
4. **UI** — mark-as-died flow, archive view, events timeline, molt outcome on the
   molt form. Four frontends.
