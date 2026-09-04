# ADR-018: Keeper-consensus husbandry signals

- Status: Proposed
- Date: 2026-09-04
- Surfaces: Tarantuverse API, web, mobile
- Decision owner: Product
- Extends: [ADR-014](ADR-014-evidence-first-market-signals.md) (evidence-first doctrine)

## Context

Every tracker in this space ships care sheets, and they are all drawn from the
same handful of public sources. A care sheet is a commodity: a new competitor
launches with the same prose we have, on day one, for free.

What none of them can launch with is what keepers **actually do**. That takes a
real community logging real husbandry over real time, and it cannot be scraped,
bought, or shipped in a sprint.

We have that. As of 2026-09-04, across 170 users and 1,951 living animals:

- 3,570 feeding logs, of which 3,290 are accepted feedings
- **23 species** clear "≥3 keepers and ≥15 accepted intervals"
- the strongest have genuine independent agreement — *Caribena versicolor* at
  **10 keepers / 152 intervals**, *Tliltocatl albopilosus* at **8 / 133**

And the numbers say something the sheets don't:

| species | keepers | animals | obs | keepers feed every | care sheet says |
| --- | --- | --- | --- | --- | --- |
| *Caribena versicolor* | 10 | 22 | 152 | 4 days | "Once or twice per week" |
| *Phidippus regius* | 10 | 18 | 65 | 7 days | "2-3 prey per week" |
| *Chromatopelma cyaneopubescens* | 9 | 9 | 89 | 7 days | juv "2-3 times per week" |
| *Avicularia avicularia* | 9 | 12 | 83 | 5 days | juv "Twice per week" |
| *Tliltocatl albopilosus* | 8 | 11 | 133 | 7 days | *(blank)* |
| *Brachypelma hamorii* | 7 | 7 | 41 | 7 days | adult "Once per week" |
| *Lasiodora parahybana* | 6 | 7 | 80 | 5 days | juv "Every 3-4 days" |
| *Monocentropus balfouri* | 5 | 6 | 28 | 8 days | juv "Twice per week" |

The sheets speak in vague prose or say nothing at all. Our keepers speak in a
number with a sample size attached.

> **Figures corrected 2026-09-04 during implementation.** An earlier draft of
> this ADR quoted a flat median across all intervals and higher keeper counts.
> Both were wrong for the claim being made. See "Median of per-keeper medians"
> below — the method change moved *T. albopilosus* from 4 days to 7, and
> *C. cyaneopubescens* and *P. irminia* likewise, because a small number of
> heavily-logging keepers were dominating the flat figure. The keeper counts
> fell because the shipped query also excludes dead and transferred-out
> animals. The corrected numbers are the ones above.

This is also the correct bet for where the product actually is. Tarantuverse is
hobbyist-first with no active storefront and no seller pipeline; features that
depend on a marketplace (transfers, provenance) are structurally strong but
need a supply side that does not exist yet. This one needs only the community
we already have, doing what they already do.

## Decision

Ship **keeper-consensus husbandry signals**: per-species aggregates of what
keepers on this platform actually do, displayed alongside — never replacing —
the written care sheet.

The doctrine is inherited wholesale from ADR-014. This is descriptive
observation, not instruction.

### Framing rules

1. The label is always **"what keepers do"**, never "what you should do", and
   never "recommended". We describe; the care sheet advises.
2. Every displayed figure carries its evidence inline: keeper count and
   observation count. A number without its sample size is not shippable.
3. When a species does not clear the gate, we show **nothing** — not a
   low-confidence number, not a platform-wide fallback. An honest absence beats
   a plausible-looking figure. This is the ADR-014 rule and it is not negotiable
   here either.
4. We never contradict the care sheet in our own voice. Both are shown; the
   keeper draws the conclusion. If the sheet says twice a week and keepers do
   every eight days, that difference is the interesting part and it belongs to
   the reader, not to us.

### Inclusion gates (v1)

An observation is eligible when it is:

- an **accepted** feeding (refusals are not cadence — see
  `feedback_refusals_dont_belong_in_cadence_math`);
- on an animal that is alive and linked to a catalog species;
- an interval between consecutive accepted feedings of **1-120 days**
  (excludes same-day double-logs and multi-month gaps from lapsed logging);
- dated within the previous **730 days**, matching ADR-014's staleness window.

A species is displayed when it has **≥3 distinct keepers** and **≥15 eligible
intervals**. That yields **25 species today**.

Rationale for the specific gate: ≥5 keepers / ≥20 intervals yields only 11
species, which is too thin to feel like a feature. ≥2 keepers / ≥10 yields 40
but a two-keeper "consensus" is two people's habits. Three keepers is the
smallest number where the word consensus is defensible.

### Median of per-keeper medians

The statistic is a **median of per-keeper medians**, not a flat median over all
intervals, and not a mean.

Mean is out for the usual reason — one holiday gap drags it (same reasoning as
ADR-017's cadence work). But a flat median has a subtler failure that matters
more here: it weights by *volume of logging*, so a keeper with many animals who
logs diligently can set a species number alone. The platform already has an
account holding 1,221 animals, so this is a live risk, not a hypothetical.

Collapsing to one value per keeper first, then taking the median across
keepers, means every keeper counts exactly once. That is what the phrase "what
keepers do" actually promises.

This is not cosmetic. Measured on production data 2026-09-04:

| species | flat median | median of per-keeper medians |
| --- | --- | --- |
| *Tliltocatl albopilosus* | 4 days | **7 days** |
| *Chromatopelma cyaneopubescens* | 4 days | **7 days** |
| *Psalmopoeus irminia* | 4 days | **7 days** |
| *Hapalopus guerreroi* | 4 days | **8 days** |

The flat figure was describing a few enthusiastic loggers. The per-keeper
figure describes the community.

### The stratification problem — stated, not hidden

These medians mix life stages. A sling and an adult of the same species are on
completely different schedules, and *Avicularia avicularia* at 6 days is very
likely slings pulling an adult figure down.

This is the same variance that made platform molt-interval averages useless
(*Grammostola pulchra*: 297 ± 219 days, range 43-777, because a sling and an
adult female share a species name and nothing else).

v1 does **not** stratify, and therefore v1 must not present the number as
stage-specific. It is "keepers of this species", full stop. Stratifying by
`current_length_mm` bucket is the obvious v2 and is where this gets genuinely
strong — but it needs size captured more consistently first, and shipping an
unstratified number labelled honestly is better than shipping a stratified one
built on 4 animals per bucket.

## Scope

### v1 — feeding cadence only

**API.** One endpoint, `GET /species/{id}/keeper-signals`, returning the
aggregate or an explicit "insufficient evidence" state. Computed on read with a
short cache; at 3,290 rows this is a cheap query and does not warrant a
materialized table yet.

Response carries: `median_interval_days`, `keeper_count`, `observation_count`,
`animal_count`, `window_days`, and `meets_threshold`. Never a bare number.

**Web + mobile.** A block on the species care sheet, adjacent to the written
feeding guidance, showing the figure with its keeper and observation counts.
Both platforms together — this is a read-only display and there is no reason to
stagger it (`feedback_web_mobile_parity`).

**Admin.** A coverage view listing which species clear the gate and which are
close, so the care-guide editor can see where more data would unlock a species.

### Explicitly not in v1

- No stratification by life stage or size (see above).
- No molt-interval consensus. Only 124 usable intervals platform-wide and 13
  species with 3+; the data does not support it yet.
- No prey-type or enclosure consensus. Same reason — measure before shipping.
- No cross-keeper comparison of an individual animal against the consensus
  ("you feed less often than other keepers"). That is a judgement about
  someone's husbandry and it is not our place in v1.
- No writing consensus values back into the care sheet. The two stay separate
  and visibly sourced.

### v2 candidates, in rough order

1. Stratify by size bucket once `current_length_mm` coverage supports it.
2. Molt-interval consensus when interval count and per-species keeper count
   clear the same gate.
3. Acceptance-rate signal per species (we already know refusals run 33% in the
   three weeks before a moult vs 3.1% otherwise — an 11x lift on 2,495
   feedings, so the underlying signal is validated).

## Consequences

**It compounds.** More logging tightens the numbers, which unlocks more species,
which makes the feature better. 120 species already have some linked feeding
data against 25 displayed — the gap is the growth path, and the 136-animal
species-link backfill on 2026-09-01 directly widened it.

**It is a content engine.** "The care sheets say twice a week for *A.
metallica*. Our 7 keepers actually feed every 8 days" is a post, on a channel
that already publishes daily, advertising the exact thing a competitor cannot
match. Each qualifying species is a post.

**It creates an obligation.** Once keepers know their logs feed a public
signal, sloppy aggregates become a trust problem rather than a cosmetic one.
The gates are what make this safe, and loosening them later to increase
coverage would be the wrong trade.

**The dominant-keeper problem is handled in v1, not deferred.** It was going to
be a follow-up until the numbers showed the skew was already present and
material (see "Median of per-keeper medians"), so per-keeper weighting ships in
the first version.

## Open questions

- Should the block appear on the care sheet only, or also on the animal detail
  screen for an animal of that species? The latter is more useful and closer to
  the judgement line in "not in v1".
- Do we show consensus for species the viewing keeper does not own? Leaning
  yes — it helps someone deciding whether to acquire one, which is when a care
  sheet gets read most.
