# Fresh audit — 2026-10-08

Run after the 2026-10-05 taxon-consistency audit was fully worked through
(A, B, C, units, taxon drift test). Four independent read-only reviews; every
finding was checked against the code (file:line in each report):

- `audit2-animals.md` — every taxon's journey (TV web + mobile + API)
- `audit2-colonies.md` — the full colony lifecycle
- `audit2-hv.md` — Herpetoverse web vs mobile, and vs TV
- `audit2-crosscutting.md` — units, privacy/access, older builds, memory, copy, docs

## Fixed the same day

| Finding | Fix |
| --- | --- |
| Public `/keepers/` and `/keepers/{username}/` returned every public keeper's **email** and admin/premium flags | `PublicKeeperResponse`; tests `test_public_keeper_privacy.py` |
| Public collection returned price paid, source, notes, death/enclosure notes, location | blanked for visitors (`PRIVATE_ANIMAL_FIELDS_CLEARED`) |
| One animal could be claimed twice (several pending links, or two simultaneous claims) | claim locks the transfer + source; `_refuse_handed_off_source`; `test_transfer_single_claim.py` |
| TV mobile terms named Google Play on iOS | platform-specific store wording |
| CLAUDE.md said ten taxa / 24 h tokens | eleven taxa / 14 days |

## Open — suggested order

### 1. Data correctness (keepers see wrong things)
**[FIXED 2026-10-08 — every item below; plus the anonymous `/keeper/{u}/{slug}` route no longer returns animal or molt notes and 404s for private collections]**
- Dead/sold centipedes, whip spiders, scorpions stay in collection lists, counts and the cap notice (legacy per-taxon list endpoints). *animals H1*
- Public keeper profile + stats read only the legacy tarantula table: no other taxon shows; dead/sold tarantulas counted. *animals H2*
- Unlinked millipedes/isopods/roaches get a 7-day feeding default and show as overdue on web/Feeding Day/digest. *animals M14*
- Basic analytics include dead animals; "Add Your First Tarantula" copy. *animals M15*
- Colony event sign: a positive death/removed count grows the population on web (mobile forces the sign; server doesn't validate). *colonies M4*
- Colony bucket-key casing ("Unsexed" vs "unsexed") splits one stage into two. *colonies M5*
- Created/imported colonies have no baseline "added" event, so the population chart starts short; deleting/renaming a bucket on edit drops or double-counts animals with no event. *colonies M6, M7*
- Archived colonies still reachable on `/col`, link previews and card links. *colonies M3*
- Web dashboard count/cap gate leaves out colonies. *colonies M1*
- HV transfer claim doesn't mark the source offspring sold. *hv M2*

> **Groups 2–4 done and verified 2026-10-09** (2280 API tests pass; tsc clean on
> all four apps after one HV mobile type fix; token gate and lint clean).
> Still open after this batch: HV web genetics UI (hv H2), HV web notifications
> page + search (hv M9), HV per-animal events client (hv M12), HV feeder-stock
> export (hv M11), and the two decisions in section 5.

### 2. Safety / destructive actions
- Deleting an HV animal silently cascades to its pairings, clutches and offspring; neither confirm says so. *hv H1*
- Died HV animals still editable on web (and the server accepts writes). *hv M6*

### 3. Parity gaps (one platform has it, the other doesn't)
- Web: no deceased archive (can't find or restore a died animal). *animals H3*
- Web: no share-card link list/revoke (both apps). *hv H3*
- HV web: no genetics UI. *hv H2*
- Web: no health events; web feeding form lost prey size; log histories capped at 8 with no "show all". *animals M3–M5*
- Web colony edit has no species picker; web colony add ignores per-taxon stage buckets. *colonies M8, M9*
- Mobile: no public/private toggle for non-tarantulas; long-press sheet tarantula-only and opens the legacy edit screen. *animals M9, M10*
- Web collection: feeding badges/Last Fed tarantula-only; nicknames ignored in cards/search. *animals M1, M2*
- Reminder toggles do nothing (only retired screens read them); digest has no on/off/hour setting. *animals H4*
- HV: web clutch/offspring details missing incubation and hatch fields; no notifications page/search on web; brumation can't be set by any client. *hv M7–M9*

### 4. Taxon-awareness
- Food picker is a tarantula feeder list for every taxon (no fruit flies, leaf litter). *animals M6*
- Web add form: tarantula defaults for every taxon; life stage tarantula-only. *animals M7, M8*
- HV breeding copy says "slugs", "egg count" for frogs/turtles; clutch count capped at 200 (frogs lay more); hold-back falls back to snake. *hv M3–M5*
- Enclosure inhabitants tarantula-only. *animals M12*

### 5. Decisions for Cory
- **Collection goes public → every hidden animal becomes public** (`auth.py::_cascade_collection_to_public`). Deliberate so new public profiles aren't empty, but it overrides per-animal hides on a re-flip. Option: only flip animals that were never explicitly hidden.
- **HV change-taxon** doesn't exist (fixing a wrong taxon = delete, which cascades breeding). *hv M10*
- Export omits HV feeder stock and some colony husbandry fields. *hv M11, colonies M10*

LOW items are in each report.
