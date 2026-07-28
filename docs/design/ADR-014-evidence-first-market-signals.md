# ADR-014: Evidence-first market signals

- Status: Accepted
- Date: 2026-07-28
- Surfaces: Tarantuverse API and web
- Decision owner: Product

## Context

The former valuation feature mixed three fundamentally different inputs:

1. manually seeded ranges without source-level provenance;
2. community-reported prices paid;
3. a synthetic formula beginning with a $20 baseline and applying husbandry,
   life-stage, sex, growth, and rarity multipliers.

It labeled a single manual range as high confidence, treated all currencies as
USD, included private submissions in aggregates, inferred life stage from time
owned, and produced a number when no observations existed. Those outputs could
look more authoritative than their evidence allowed.

These animals can be expensive and emotionally important. A plausible-looking
number is not preferable to an honest absence of evidence.

## Decision

Keep the feature as experimental **market signals**, not a valuation or
appraisal.

A displayed range must be based only on observations that are:

- public;
- explicitly USD-denominated;
- a reported price paid, not an asking price;
- dated within the previous 730 days;
- matched to species and keeper-recorded life stage;
- not flagged by moderation as an outlier.

For adult and subadult animals, a recorded male or female sex is used to match
comparable reports. Unknown sex is not silently assigned.

Only the latest matching report from each contributor is retained. Tukey fences
remove statistical outliers. At least five contributors must remain. The
displayed band is the 20th through 80th percentile, rather than a midpoint or
average plus/minus standard deviation.

Evidence quality is:

- insufficient: fewer than 5 retained contributors; no range;
- limited: 5–11 retained contributors;
- moderate: 12 or more retained contributors.

Self-reported data is never labeled high-confidence or verified market value.
Moderator review counts, contributor counts, named-vendor counts, observation
dates, and limitations are returned separately.

Collection totals include only animals with supported ranges. Coverage and
excluded-animal counts must be visible. When no animal qualifies, totals are
null, not zero.

## Consequences

- Existing manually seeded price JSON remains stored but is not used in market
  signals until provenance can be attached.
- The synthetic fallback is removed.
- Animals without a keeper-recorded life stage return insufficient evidence.
- API clients must handle nullable range fields and explicit evidence status.
- Honest responses use new /pricing/market-signals routes. Former synthetic
  valuation routes return HTTP 410 Gone. This makes the web/API rollout safe in
  either deployment order: temporary unavailability is allowed; fabricated or
  misread values are not.
- No database migration is required for this change.
- Tarantuverse mobile and both Herpetoverse clients do not currently present
  this feature and are intentionally unchanged.

## Follow-up evidence work

Before stronger claims are allowed, add structured observation type (asking
price versus price paid versus independently confirmed sale), immutable
provenance and correction history, source capture, duplicate-abuse controls,
and currency-aware comparisons. Any threshold change must be documented with
the dataset used to justify it.
## Addressable supply

Thresholds are only meaningful if they are reachable. A read-only aggregate
against production on 2026-07-28 measured the ceiling.

The estimator requires an animal to have both a linked species and a
keeper-recorded life stage, then segments by species and life stage (and by sex
for adult and subadult). Production at that date:

| Measure | Value |
| --- | --- |
| Animals | 1739 |
| With a species link | 181 |
| With a recorded life stage | 302 |
| Meeting both requirements | 61 |
| Keepers owning any eligible animal | 8 |
| Species and life stage buckets present | 33 |
| Largest bucket, by distinct owners | 2 |
| Buckets reaching the 5 contributor floor | 0 |

Distinct owners is an upper bound on contributors, since contributing also
requires consent and manual entry of price and purchase date. The deepest
bucket in production therefore has a ceiling of two, against a floor of five
and a numeric threshold of twelve.

The binding constraint is not the thresholds. It is that most animals carry no
species link, so almost nothing is eligible to contribute. Lowering thresholds
to fit a two contributor bucket would produce exactly the unfounded price claim
this ADR exists to prevent, so the thresholds stand and ranges stay suppressed
until eligibility coverage moves.

Link coverage splits sharply by cohort. One account holds 1221 animals with
zero species links and zero life stages, from a bulk add that predates the
consolidation. Excluding it, real keepers sit at 34.9 percent linked and 58.3
percent with a life stage. The platform wide figure is therefore misleading and
should not be quoted without the split.

Of the unlinked animals, 537 carry a typed scientific or common name that
matches the catalog and can be recovered mechanically. See
`apps/api/backfill_species_links.py`. Recovery does not by itself make any
bucket reach five, so it improves care sheets, cadence, and premolt for those
keepers without changing what this feature is permitted to claim.

Any future threshold change must cite the dataset used to justify it, per the
follow-up section above. This section is that dataset for the current values.

## Production baseline and contribution path

A read-only aggregate against the production Neon database on 2026-07-28
confirmed that pricing_submissions contains 0 rows. Current market-evidence
coverage is therefore zero; all ranges must initially be suppressed.

Keepers can contribute from an animal's Tarantuverse web detail card. The form:

- never reads or prefills the private acquisition price;
- requires manual price-paid and purchase-date entry;
- requires affirmative consent before aggregate eligibility;
- requires a keeper-recorded life stage;
- derives species, life stage, and sex from the referenced owned animal on the
  server, rejecting client mismatches;
- keeps individual reports owner-only even when they are aggregate-eligible.

New API submissions default to private. Future purchase dates and non-positive
prices are rejected. The production database schema itself is unchanged, so its
legacy server default remains true; application-created submissions always send
an explicit value.
