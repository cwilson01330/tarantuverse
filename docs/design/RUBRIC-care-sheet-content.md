# Care-Sheet Content Rubric

**Owner:** Content lead (currently Cory)
**Scope:** All species care sheets and gene entries published on Herpetoverse and Tarantuverse.
**Status:** v1 — adopted 2026-04-22 as Sprint 4 deliverable.
**Supersedes:** Ad-hoc seeding practice from Tarantuverse Sprints 1–3.

---

## Why this rubric exists

We run on the Honesty-First Product Principle. A care sheet is a claim about an animal's welfare; a gene entry can be a claim about a living creature's quality of life. If we publish something wrong, a real animal pays for it.

This rubric is the gate. If a submission does not clear it, it does not ship to `is_verified=True`, regardless of who wrote it.

Two failure modes we are specifically defending against:

1. **Hobby folklore dressed as fact.** Forums repeat husbandry claims that were never measured. A rubric with citation tiers prevents "everyone says so" from becoming our house position.
2. **Overclaiming causation on welfare.** Genes like Spider, Woma, HGW are *associated with* neurological signs in the published literature; the causal mechanism is not always resolved. Our language must reflect that ambiguity, not launder it.

---

## 1. Citation requirements

### Minimum counts

| Content type | Minimum citations | Minimum tier |
|---|---|---|
| Species care sheet | **3** total | At least 1 Tier A or Tier B |
| Gene welfare claim (`welfare_flag IS NOT NULL`) | **3** per claim | At least 1 Tier A |
| Gene non-welfare metadata (inheritance, appearance) | 1 | Tier B or higher |
| Re-review of existing content | 1 new citation if anything has changed in 12 months | Any tier, noted in `content_last_reviewed_at` commit |

A welfare claim is anything that would appear in the `welfare_notes` column, the `welfare_citations` JSONB, or a care-sheet section tagged "safety," "risk," or "handling caution." It also includes temperature, humidity, and enclosure-size ranges when those are given as hard minimums rather than ranges of common practice.

### Citation tier taxonomy

Citations are stored in JSONB with `{title, url, publication_date, source_type, author, accessed_on}`. `source_type` must be one of:

- **`peer_reviewed`** — Tier A. Journal articles, veterinary dissertations, published conference proceedings with peer review. Examples: *Journal of Herpetological Medicine and Surgery*, *Veterinary Record*, *PLOS ONE*.
- **`veterinary`** — Tier A. Veterinary textbooks, veterinary board statements, zoo/aquarium welfare guidelines from accredited institutions (AZA, BIAZA, EAZA, ARAV). A vet's personal blog is **not** Tier A — it is Tier C.
- **`breeder_community`** — Tier B. Established breeder write-ups with demonstrable track record (>5 years, >X pairings), Morelia Python Radio transcripts, Reptiles Magazine feature articles, MorphMarket gene pages when they cite primary sources themselves.
- **`forum_post`** — Tier C. Arachnoboards threads, Reddit, Discord screenshots, Facebook groups. Usable only as supporting evidence when Tier A or B already carries the claim. Never as the sole basis for a welfare flag.
- **`vendor`** — Tier D. Retailer care sheets, pet-store pamphlets. Allowed only to corroborate price ranges and availability, never for husbandry or welfare.

Tier C and D never satisfy the minimum-tier requirement on their own. They can pad the citation count but not replace a Tier A or B.

### What a citation must contain

- Title (required)
- URL or DOI (required — if the source is a physical book, ISBN)
- Publication date (required; "accessed on" is not a substitute)
- Author(s) when attributable
- One-sentence summary of what the source supports — this lives alongside the citation in the JSONB so future reviewers know *why* the citation was pulled, not just that it exists

A citation without a date is not a citation. If the source is undated, it does not count toward the minimum.

---

## 2. Original writing — the "in your own words" rule

Care-sheet prose is written, not paraphrased. Specifically:

- Copying a sentence and swapping two words is plagiarism and is not acceptable regardless of attribution.
- Tables of ranges (temperature, humidity, enclosure size) may be numerically identical across sources — that is fine, numbers are facts. But the surrounding prose interpreting those numbers is ours.
- Direct quotes longer than a sentence require quotation marks and inline attribution. Use sparingly; prefer synthesis.
- If the same passage would read the same in three different keepers' handwriting, rewrite it until it sounds like you.

A simple test: if a reader arrived at our care sheet from another well-known care sheet, would they notice they are reading the same thing twice? If yes, it is not original.

---

## 3. Welfare language policy

We do not say *causes*. We say *associated with*, *correlated with*, *commonly reported to*.

Examples of acceptable phrasing:

> "The Spider gene is consistently associated with a neurological condition commonly called 'head wobble,' reported across the breeder community and documented in veterinary case studies. The underlying mechanism is not fully characterized."

> "Super Black Pastel is reported to be lethal in the homozygous form — sacs containing super-form offspring have shown non-viability in breeder records. This is consistent with the pattern seen in several other dominant ball python genes."

Examples of language we do **not** use:

- "The Spider gene *causes* wobble." — overclaims causation.
- "Super Cinnamon is *always* lethal." — absolutism without the evidentiary base to back it.
- "Keeping a Woma is *unethical*." — editorial, not a welfare claim we can cite.

When a welfare flag is set, the `welfare_notes` column must include the phrase "associated with" or an equivalent hedge. Linting for this will happen at content-review time; eventually we may add a schema-level check.

### The ethics clause we do allow

We can editorialize in *one* specific place: the care-sheet's "Should you keep this?" section, if we add one. Editorializing there must (a) be labeled as opinion, (b) still cite the factual basis, and (c) never be the first paragraph a reader sees.

---

## 4. Photo sourcing policy

Every image on a species or gene page must have a documented provenance. In order of preference:

1. **Our own photos** — taken by Cory, a verified Tarantuverse/Herpetoverse user who has given permission, or under an explicit shoot agreement. Store the photographer's name in the image metadata. Best option.
2. **Public domain** — Wikimedia Commons images tagged PD-self or PD-expired, USGS/NPS photos, government wildlife-agency images. Verify the PD claim by clicking through to the source license page; do not trust the thumbnail tag.
3. **Creative Commons with attribution** — CC BY, CC BY-SA. Attribution must appear on the page where the image is displayed, not buried in a footer. For CC BY-SA, any derivative (crop, color correction) inherits the license — note this in the image record.
4. **Explicit written permission** — an email, DM, or forum post from the photographer explicitly granting use on Herpetoverse/Tarantuverse. Screenshot and archive the permission message. Non-commercial grants must match our use (currently non-commercial; will need re-clearance if that changes).

**Never acceptable:** right-clicking a Google Images result, a MorphMarket listing photo, a Reddit image without the poster's consent, or an Instagram screenshot. "It's on the internet" is not a license.

For photos of living animals with visible welfare concerns (e.g., a wobbly Spider), the photographer's written consent is **required** even if the image is otherwise CC — the photographer may not want their animal used as an illustration of a welfare claim.

---

## 5. Reviewer sign-off workflow

Every new submission goes through three states:

1. **Draft** — the author's working copy. `is_verified=False`, not shown in default search results.
2. **In review** — author has requested review. A reviewer is assigned. The reviewer runs the checklist below. If anything fails, the submission returns to Draft with specific line-item feedback.
3. **Published** — `is_verified=True`, `verified_by` and `verified_at` stamped. Appears everywhere. Triggers re-review countdown.

### Reviewer qualifications

A reviewer must be one of:

- A superuser (`is_superuser=True`) for the v1 period. This is currently Cory.
- A keeper with a documented track record in the relevant taxon — for reptiles, >3 years keeping and a public collection on the platform; for gene entries, >5 years breeding that specific species or a confirmed relationship with a breeder who meets that bar.
- A veterinarian in good standing (verified out-of-band, noted in `profile_specialties`).

Reviewers cannot review their own submissions. Two reviewers are required for any submission where the welfare flag is set — four eyes on welfare claims, minimum.

### Reviewer checklist

Before stamping `is_verified=True`, the reviewer must confirm:

- [ ] Citation count meets the minimum for the content type.
- [ ] At least one citation is Tier A (or A+B as required).
- [ ] Every citation has a date; URLs resolve; summaries in the JSONB match what the source actually says.
- [ ] Prose reads original, not paraphrased. Spot-check the first and last paragraph against the cited sources.
- [ ] All welfare claims use hedging language ("associated with," not "causes").
- [ ] All images have a provenance record that matches §4.
- [ ] Ranges (temp/humidity/enclosure) are *ranges*, not single points, unless the source specifies a single point.
- [ ] For gene entries: inheritance mode matches the breeder-community consensus, lethal flag is only set with Tier A backing.
- [ ] `content_last_reviewed_at` is set to today's date on commit.

The reviewer leaves a signed note in the commit message: `Reviewed-by: <username>` — analogous to a git trailer. This gives us a paper trail.

---

## 6. Staleness and re-review cadence

Content is not "done" — it's correct as of a date.

- **Annual re-review** is required for any entry where `welfare_flag IS NOT NULL`. The re-review can be light — confirm the cited sources still exist, confirm no newer peer-reviewed work contradicts our claim — but `content_last_reviewed_at` must be updated.
- **Triennial re-review** (every 3 years) for non-flagged entries.
- **Triggered re-review** when a new peer-reviewed paper lands on a flagged gene, when a vendor discontinues or renames a morph, or when community consensus on husbandry shifts (e.g., humidity norms for a species being revised).

A stale flagged entry (welfare flag + `content_last_reviewed_at` older than 12 months) should be surfaced in an admin triage view — this is why the partial index `ix_genes_welfare_flag WHERE welfare_flag IS NOT NULL` exists. Sprint 5 will add the admin dashboard that consumes it.

---

## 7. Handling disputes

If a submission fails review and the author disagrees with the reviewer, the escalation path is:

1. The author adds a counter-argument in the PR/submission thread with their own citations.
2. A second reviewer (not the original) adjudicates.
3. If still deadlocked, Cory decides. The decision is logged in `docs/design/decisions/` so we have a record.

Welfare-language disputes in particular should err on the side of hedging. If one reviewer says "causes" and another says "associated with," we ship "associated with."

---

## 8. What happens when we get something wrong

When we find an error in published content — ours or someone else's catching it:

1. Fix it immediately. Do not wait for a batched content release.
2. Update `content_last_reviewed_at`.
3. If the correction materially changes a welfare claim, note it in a short changelog on the entry itself. Do not silently edit welfare claims — readers may have made husbandry decisions based on the prior version.
4. If the error came from a cited source being wrong, note the source as unreliable in an internal list. Consider removing it from future citations.

---

## 9. Out of scope for v1

Explicitly **not** required by this rubric, to keep it shippable:

- Formal IRB-style review for user-submitted content (we're not a research institution).
- Professional translation for non-English citations (use the citation as-is, note language in the JSONB).
- Real-time reviewer workload queueing (reviewers grab submissions manually until volume forces automation).
- Public audit log of every reviewer decision (internal for now; can become public if users request transparency).

---

## Appendix A: Quick reference card

> **For writers:** 3 citations minimum. At least one Tier A or B. Own words. "Associated with," not "causes." Photo provenance documented. Date everything.
>
> **For reviewers:** Checklist in §5. Four eyes on welfare. Sign the commit. Set `content_last_reviewed_at`.
>
> **For everyone:** If you are not sure whether a claim needs a citation, it does.

## Appendix B: Related documents

- `PRD-herpetoverse-v1.md` §5.3, §5.4 — data model for species and genes
- `ADR-002` — decision to use separate `reptile_species` table with richer fields
- `IMAGE_SOURCING_STRATEGY.md` — operational detail behind §4 of this rubric
- Migration `gns_20260422_add_genes_table` — introduces `welfare_citations` JSONB and `content_last_reviewed_at`
