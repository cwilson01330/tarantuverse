# ADR-019: One community across Tarantuverse and Herpetoverse

- Status: Proposed
- Date: 2026-09-04
- Surfaces: Tarantuverse API, Herpetoverse mobile + web
- Decision owner: Product

## Context

Herpetoverse's visual rework landed and the surface looks right, but the app
still feels second-class next to Tarantuverse. It isn't polish. It's structural:

| | Tarantuverse | Herpetoverse |
| --- | --- | --- |
| forums | yes | **no** |
| activity feed | yes | **no** |
| direct messages | yes | **no** |
| discover | yes | **no** |
| achievements | yes | **no** |

HV's tabs are Dashboard / Collection / Species / Breeding / You. Every one shows
**the keeper's own data, exactly as they left it**. Nothing in HV changes while
you are not looking, so there is no reason to open it twice in a day — and the
usage numbers match that exactly. This was briefly mistaken for the app being
broken after the redesign; it is not broken, it is inert.

Two things compound it:

- **The catalog is thin and entirely imageless.** 57 species against TV's 401,
  and **0 of 57 carry an image** where TV has 195. Browsing — the one thing a
  keeper can do without owning animals — is a wall of empty frames. The care
  sheet hero was redesigned precisely because half of TV's catalog lacked
  photos; on HV it is all of it.
- **Platform work keeps landing TV-shaped.** ADR-018's keeper signals read
  `inverts` / `invert_species`. HV has 59 feeding logs in total, so it could not
  qualify a single species even if the feature were ported.

The unlock is that **the community backend is already shared**. `forums`,
`activity_feed`, `direct_messages`, `follows` and the keeper profile routes have
**no app column and no app scoping anywhere** — and TV and HV already share the
`users` table (101 TV keepers, 7 HV keepers, 1 in both). HV is not missing a
community backend. It is missing the screens.

## Decision

**One community, shared by both apps** — rather than building HV a community of
its own.

A separate HV community would be a visibly dead room: seven keepers cannot
sustain a forum, and an empty social space reads worse than no social space at
all. Pointing HV at the existing community means a herp keeper lands somewhere
active on their first visit.

The cost is honest and must be managed rather than denied: today that room is
almost entirely tarantula talk, and a herp keeper walking into it is a guest in
someone else's house.

### The ordering that makes this work

**HV must WRITE to the feed before HV READS from it.**

`app/routers/animals.py` and `app/routers/weight_logs.py` contain **zero**
`create_activity` calls. Every emitter today is TV-side (tarantulas, feedings,
molts, pairings, egg sacs, offspring, forums, follows). So if HV simply renders
the existing feed, herp keepers see a 100% invert stream they contribute
nothing to — the guest problem made literal, and a worse first impression than
the empty tabs they have now.

Reversing the order fixes it. Once HV emits, the shared feed contains herp
content from day one, TV's 101 keepers start seeing snakes and geckos in their
stream, and the merge reads as one community rather than a borrowed one.

## Scope

### Phase 0 — teach the feed to render herp events (client, both platforms)

**A prerequisite the first draft of this ADR missed.** HV emission was already
deliberately deferred, and `routers/feedings.py` says why:

> *"Activity feed emission for HV taxa is deferred until the feed has herp
> icons — tarantula feedings still emit via create_activity."*

That deferral is correct and still binding. Both feed components hardcode
invert iconography:

- mobile `ActivityFeedItem.tsx` maps `new_tarantula` and `molt` to a `spider`
  glyph;
- web `ActivityFeedItem.tsx` renders a literal 🕷️, and gates its
  animal-card layout on `action_type` being one of
  `new_tarantula | molt | feeding`.

Emit first and a ball python's shed either falls through to a default or shows
a spider. That is worse than the empty tabs HV has now, and it would land in
TV's feed where 101 keepers would see it.

So Phase 0 comes first:

- add `new_animal`, `shed` and `weight` to both icon maps, keyed on the
  `taxon` already carried in metadata (`snake`, `lizard`, `turtle`, `tortoise`,
  `frog`, `salamander`) rather than one generic herp glyph;
- widen the web card-layout gate so herp actions get the animal card, not the
  bare social line;
- replace the 🕷️ literal with a taxon-driven glyph.

Verified icon names exist in the MDI set before use — an unknown name renders
an empty box **silently**, so a typo ships (see the design handoff's icon
appendix).

### Phase 1 — HV emits activity (backend only, no UI)

Add `create_activity` calls to the HV write paths, mirroring the TV routers:

| event | action_type | target_type |
| --- | --- | --- |
| animal added | `new_animal` | `animal` |
| feeding logged | `feeding` | `animal` |
| shed logged | `shed` | `animal` |
| weigh-in logged | `weight` | `animal` |
| clutch laid | `clutch` | `clutch` |

`create_activity` is already taxon-agnostic — `target_id` is stringified and
`activity_metadata` is free-form JSON — so no signature change is needed.

Metadata must carry what a feed card needs without a second query: animal name,
species, taxon, and photo URL when present. TV's cards already work this way.

**Ships alone and is worth shipping alone** — once Phase 0 is in. It costs
nothing visible in HV and immediately makes TV's feed more interesting.

Order matters and is easy to get backwards: Phase 0 is client-only and inert
until events exist, so it can ship first with zero visible change. Phase 1 is
backend-only. Shipping 1 before 0 puts spiders on snakes in front of TV's
whole audience; shipping 0 before 1 is invisible until it's correct.

### Phase 2 — HV reads the community

Port the existing TV screens, pointed at the same endpoints:

- activity feed (a Community tab, replacing nothing — HV has a free slot)
- keeper profiles
- direct messages

Filtering is a **client-side view preference**, not a backend scope: "All
keepers" vs "Herp keepers". Backend stays app-agnostic so the two populations
can always see each other. Defaulting HV to "All" is the point of the decision;
a filter that defaults to herp-only would rebuild the empty room.

### Phase 3 — forums, carefully

Forums need category strategy before code. Existing categories are
invert-shaped. Options are herp-specific categories inside the same forum, or a
neutral top level with per-taxon children. **Not scoped here** — it deserves its
own decision, and Phases 1 and 2 deliver most of the value without it.

### Explicitly out of scope

- **No `app` column on community tables.** Adding one would recreate the
  separation this ADR exists to avoid.
- **No achievements port.** HV needs its own definitions (sheds, clutches,
  morphs), and `achievement_service.py` currently has zero references to
  animals. Separate piece of work.
- **No keeper-signals port.** HV has 59 feeding logs; the ADR-018 gates would
  correctly show nothing for every species. Revisit when the data exists.

## Consequences

**HV stops being inert.** Something changes between visits that the keeper did
not do themselves. That is the whole reason TV gets opened twice a day and HV
does not.

**TV benefits too, immediately.** 101 keepers get a feed that includes reptiles
and amphibians, which is content they currently never see and a soft
introduction to the second product.

**Cross-promotion becomes structural rather than a banner.** A TV keeper who
follows an HV keeper sees herp content in their own feed. That is a far better
advertisement for HV than a link.

**The catalog problem remains and is not solved here.** 0 of 57 HV species
having an image is the most visible gap and the cheapest to close. It should be
done, but it is a content task, not an architecture one, and it does not give
anyone a reason to return.

**Moderation surface widens.** One community means one moderation queue across
two products and two audiences. `is_admin` is already global, so no mechanism
changes — but the volume and the subject matter both grow.

## Open questions

- Does the activity feed need a taxon or app badge on each card, so a keeper can
  tell at a glance whether they are looking at a spider or a snake? Leaning yes,
  and it is cheap given metadata already carries taxon.
- Should HV's Community tab replace Breeding in the tab bar, or take the free
  fifth slot? Breeding is a real HV differentiator and should probably stay.
