# Design brief — recording a death, and the animal timeline

**For:** design agent
**From:** ADR-015 (`docs/design/ADR-015-animal-events-and-death.md`) — read it first
**Status:** backend shipped and deployed; UI not started
**Platforms:** Tarantuverse mobile + web, Herpetoverse mobile + web

---

## The short version

A keeper whose animal dies currently has two options: delete it, destroying
every feeding, molt and photo — or leave it in the collection pretending it's
alive, where the app nags them to feed it, redder every week, forever.

The backend now supports a third option. It needs a face.

**Three surfaces:**

1. **Mark as died** — the flow. This is the one that matters.
2. **The deceased view** — where those records live afterwards.
3. **The events timeline** — injuries, illnesses, escapes, recoveries.

---

## Why this is a hard design problem

Most screens in this app are about maintenance. This one is the only place a
keeper will use it while upset.

Tarantulas live 20-30 years. People name them. Someone marking a
*Grammostola pulchra* as died may have had her since university. Someone else is
logging a sling that didn't make its second molt, feels slightly guilty, and
wants the interaction over in four seconds.

**Both of those people use the same screen, and neither should feel the design
was built for the other one.** That's the whole brief, really.

The failure modes are specific:

- **Too solemn** — a full-screen memorial with soft language for someone
  clearing out a failed sling feels performative and slightly absurd.
- **Too casual** — a red "Delete-style" confirm for a 12-year-old female reads
  as callous.
- **Too many questions** — anything that feels like a form is wrong. The
  interaction must complete with one tap plus a confirm.
- **Congratulatory patterns** — no toast with a checkmark, no "Success!", no
  celebratory colour. This is not a task completed.

---

## What the backend already gives you

Everything below is live. Nothing here needs backend work.

### Marking died

```
POST /api/v1/inverts/{id}/died      (TV)
POST /api/v1/animals/{id}/died      (HV)
Body: { died_at?, death_cause?, death_notes? }   ← all optional
```

- `died_at` defaults to **today** server-side. It's a **date**, not a
  timestamp. Future dates are rejected; backdating is expected and normal.
- Clears any feeding pause automatically.
- The animal immediately drops out of: the collection list, the free-tier
  count, feeding status, Feeding Day, overdue counts, the daily digest.
- **Nothing is deleted.** Every log, molt, photo and breeding record stays.

```
POST /api/v1/inverts/{id}/revive    ← undo, clears all three fields
GET  /api/v1/inverts/?deceased=true ← the archive view
```

### Cause vocabulary

Already in `apps/mobile/src/lib/inverts.ts` as `DEATH_CAUSE_LABELS` and
`DEATH_CAUSE_ORDER`:

| value | label |
| --- | --- |
| `bad_molt` | Bad molt |
| `unknown` | I don't know |
| `dehydration` | Dehydration |
| `dks` | DKS |
| `illness` | Illness |
| `injury` | Injury |
| `escaped` | Escaped, never found |
| `old_age` | Old age |
| `other` | Something else |

**`bad_molt` is first because it's the most common way a tarantula dies.
`unknown` is second on purpose** — most invertebrate deaths are genuinely
unexplained, and burying "I don't know" at the bottom of a list nudges people
into guessing a cause they never observed. A guessed cause is worse than no
cause: it becomes fiction in any future mortality analysis.

### Events

```
GET/POST   /api/v1/inverts/{id}/events
GET/POST   /api/v1/animals/{id}/events
PUT/DELETE /api/v1/animal-events/{event_id}
```

Types: `observation`, `injury`, `illness`, `bad_molt`, `recovered`, `escape`,
`rehoused`, `vet_visit`, `death`. Severity (`minor`/`moderate`/`severe`) applies
**only** to injury and illness.

Ordering, labels and icons are already defined in the mobile lib
(`ANIMAL_EVENT_ORDER`, `ANIMAL_EVENT_LABELS`, `ANIMAL_EVENT_ICONS`).

### Molt outcome

Molt forms now carry `outcome`: Went fine / Stuck molt / Lost a limb / Died in
molt, plus an optional "what happened". Selecting **Died in molt** shows a line
saying you can mark the animal as died on its own page — it deliberately does
**not** do it for you.

**Design question for you:** is that line enough, or should selecting "Died in
molt" offer a direct path into the mark-as-died flow? The constraint is that it
must never happen automatically. Offering is fine; deciding is not.

---

## Decisions that are settled

Please don't redesign these — they were made deliberately and are documented in
ADR-015 with reasoning.

- **The word is "died".** Not "passed away" (euphemistic, and absurd for a roach
  colony), not "deceased" (clinical, reads like a form), not "lost" (already
  means *escaped* in keeper usage — genuinely ambiguous in a husbandry app).
- **Cause is never required.** A date alone is a complete record.
- **`unknown` is a first-class answer**, not a synonym for leaving it blank.
- **Deceased animals never count toward the free tier.** No paywall may appear
  anywhere in this flow. If you find one, that's a bug.
- **Delete still exists.** Some records are genuine mistakes. Mark-as-died is
  the better path, not the only one — but it should be the more prominent one.

### Iconography — needs fixing

The codebase currently has **three different death treatments**: `💀`, `✝️`, and
`☠`. Please unify on something neutral.

A skull is the wrong register for an animal someone cared about. A cross imposes
a religious frame on someone else's grief. The mobile lib currently uses
`circle-slice-8` as a placeholder — improve on it if you can, but keep the
constraint.

---

## Surface 1 — Mark as died

**Entry point.** Currently the detail screen's action sheet / overflow menu
contains "Delete". Deletion should stop being the only exit. Where "Mark as
died" sits relative to it is yours to decide, but the destructive-red delete
should not be the visually dominant option.

**The flow itself.** Assume: date (defaulted to today), optional cause, optional
note, confirm. Whether that's a sheet, a modal, or a screen is your call.

Things worth resolving:

- Can someone complete this in one tap if they want to? They should be able to.
- Does the cause picker appear inline, or after? Inline risks feeling like a
  form; after risks being skipped entirely, which is fine but loses data we'd
  genuinely like to have.
- Confirmation copy. It should make clear that **nothing is being deleted** —
  that's the single most reassuring fact available and it's currently invisible.
- What happens immediately after. The animal vanishes from the collection, which
  without acknowledgement feels like a delete. Some brief confirmation is needed
  — but see the "no congratulatory patterns" constraint above.

**One concrete request:** find somewhere honest to say the history is kept.
"Her records stay with you" is closer to the intent than "Successfully marked as
died", but it's your language, not mine.

---

## Surface 2 — The deceased view

`GET /inverts/?deceased=true` returns them. They're currently unreachable in
every client.

Open questions:

- Where does it live? Collection filter chip, settings, profile?
- What does an individual deceased animal's detail screen look like? It should
  be readable — the logs are the point — but clearly not a living animal. The
  transfer flow has an existing precedent worth copying:
  *"✓ Transferred {date}. This is a historical record."*
- Sort order. By death date, or by how long you had them?
- Is there value in showing tenure ("in your care 4 years, 2 months")? It's
  computable from `date_acquired` and `died_at`. It might be lovely. It might
  be maudlin. Your call.

**Out of scope, deliberately:** public memorials and any community "rainbow
bridge" surface. That's a product decision about grief in a social space and
deserves its own discussion — flag it if you think it's worth having, but don't
design it here.

---

## Surface 3 — The events timeline

The lower-stakes surface, and probably where to start warming up.

An untyped log for things that don't fit a feeding or a molt: injury, illness,
escape, recovery, rehousing, vet visit, free observation.

- Where does it sit on the detail screen relative to feedings, molts, substrate?
- Does it merge into one unified timeline with those, or stay its own section?
  (Merging is more useful and considerably more work. Worth an opinion.)
- Severity applies only to injury and illness — how does the form reveal that
  without feeling conditional and janky?
- `recovered` exists specifically so the log isn't only bad news. Consider
  whether the UI can connect an injury to its later recovery.

---

## Platform notes

Four frontends. TV mobile and TV web are the priority — that's where the users
are. HV mirrors TV; don't design it separately unless something genuinely
differs.

- **Mobile:** `apps/mobile/app/invert/[id].tsx`, lib is
  `apps/mobile/src/lib/inverts.ts` (death + event functions already written).
- **Web:** `apps/web/src/app/dashboard/inverts/[id]/page.tsx`, lib is
  `apps/web/src/lib/inverts.ts` (**death functions not yet written** — say if you
  want them stubbed before you start).
- Dark mode is mandatory on every new surface, both platforms. This is a
  project rule, not a preference.
- Mobile uses the shared token/primitive system in `src/theme/tokens.ts` and
  `src/components/ui/`.

---

## What I'd most like back

Ranked:

1. **The mark-as-died flow, for mobile.** Copy included — the words matter more
   than the layout here.
2. **A death treatment** to replace the three inconsistent ones.
3. **A view on the deceased archive** — where it lives and what it feels like.
4. Events timeline placement and whether it merges with the other logs.

If you only do the first one, that's a good outcome.

---

## One last note on tone

The instinct with a screen like this is to soften everything. Resist it a
little. Keepers are practical people who deal with death more often than most
pet owners — a mantis lives a year, a mature male tarantula dies within months
of his final molt. Over-solemnity will read as the app not understanding the
hobby.

The target is closer to *respectful and out of the way* than *tender*. Say the
true thing plainly, don't make anyone answer questions they don't want to, and
make it unmistakable that nothing was thrown away.
