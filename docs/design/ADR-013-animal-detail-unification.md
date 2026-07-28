# ADR-013 — One animal detail screen for every taxon

**Status:** Accepted, implemented 2026-07-28
**Supersedes:** the deferral recorded in ADR-008 ("merge the tarantula + invert detail screens — deferred, own project")

## Context

The animal detail screen is the most-visited screen in Tarantuverse, and it
existed twice:

| | `app/tarantula/[id].tsx` | `app/invert/[id].tsx` |
|---|---|---|
| Size | 1,296 lines | 425 lines |
| Built from | bespoke inline markup | shared `Section` / `InfoRow` / `LogSection` |
| Pinned action bar | yes | **no** |
| Premolt / feeding stats | yes | no |
| QR / pause | yes | no |
| Provenance | **no** | yes |
| Transfer / rehome | **no** | yes |
| Breeding pairings | **no** (despite being a registered tarantula module) | yes |

Routing was a ternary on `taxon === 'tarantula'`.

ADR-008 chose composition over a physical merge, reasoning that shared tokens
and primitives captured ~90% of the benefit and the merge was "the risky last
10%". **That reasoning did not hold.** Composition shares building blocks; it
does not stop two screens diverging in *what they render*. In the interval,
three whole features (provenance, transfer, breeding) shipped to one screen
only, and a tarantula keeper could not see where their animal came from or
rehome it, while a scorpion keeper could.

The divergence table above is the evidence. Every feature built after the split
was either built twice or landed on one side.

## Decision

One screen — `app/invert/[id].tsx` — serving every taxon, driven by
`src/lib/taxon-modules.ts`. `app/tarantula/[id].tsx` becomes a redirect.

We grew the *invert* screen rather than shrinking the tarantula one: it was a
third the size, already used the shared primitives, and already had the three
features the other lacked.

Three enabling changes were required first, because without them the redirect
would have silently deleted shipped features:

1. **`tarantula` joined the `InvertTaxon` union** and `INVERT_TAXA`, in both
   the mobile and web libs. Its absence had been accumulating
   `taxon === 'tarantula' ? … : …` special cases at every lookup site. A new
   `PICKER_TAXA` constant (union minus tarantula) carries the colony-picker
   exclusion as a *named* decision — previously that exclusion and "tarantula
   metadata doesn't exist" were the same fact.
2. **`QRSheet` and `PauseFeedingSheet` took a `resource` prop**, and the
   backend gained a taxon-agnostic `POST /inverts/{id}/upload-session`. There
   were already four per-taxon upload-session routes; the six taxa added after
   centipede had silently had no QR at all.
3. **`PhotoViewer` and `PremoltPredictionCard` were mounted** on the unified
   screen.

The redirect (rather than editing all eight call sites) preserves deep links
baked into already-delivered push notifications, which cannot be edited.

## Consequences

**Good.** Adding a feature to the detail screen is now one edit. Adding a taxon
is a registry row. Tarantulas gained provenance, transfer and breeding;
non-tarantula taxa gained a pinned action bar, feeding stats, QR, pause, a
photo viewer, and an uncapped history.

**Also fixed along the way, all consequences of the split:**
- Three `.slice(0, 5)` caps meant a year of feeding history was unreachable.
- The tarantula screen rendered the animal's name three times.
- Tapping a photo thumbnail on the invert screen did nothing.
- The screen inferred "overdue" from a flat day threshold, disagreeing with
  Home, Feeding Day and the daily digest about the same animal. It now reads
  the server's species + life-stage aware `is_overdue`.

**Costs.** `isInvertTaxon('tarantula')` now returns `true`; call sites that used
it to mean "offerable in a colony picker" must use `PICKER_TAXA`. One such site
existed (web colony add) and was updated. The unified screen is ~1,100 lines —
larger than the old invert screen, smaller than the two combined, and covering
strictly more.

**Not addressed here.** Web still has bespoke tarantula pages; the same
argument applies there but the work is separate.
