# Herpetoverse audit (read-only) - 2026-10-08

Paths are relative to apps/. W = web-herpetoverse/src, M = mobile-herpetoverse, API = api/app.
Every finding below was confirmed by reading the cited code.

## HIGH

H1. Deleting an HV animal silently wipes its breeding history.
- API/models/reptile_pairing.py:69-80 and alembic anm_20260514_consolidate_to_animals.py:294-300 make male_animal_id / female_animal_id FK ondelete=CASCADE, so deleting a parent removes its pairings, then clutches, then offspring.
- API/routers/animals.py:684 (delete_animal) does a plain db.delete.
- Neither confirm dialog mentions it. W/app/app/reptiles/[id]/edit/EditAnimalClient.tsx:675-678 says "All logs and photos". M/src/screens/EditReptileScreen.tsx:221-223 says "weigh-ins, feedings, sheds, and photos".
- Breeding is now enabled for all 7 taxa and is premium. Fix: warn with the pairing count, or block delete when the animal is a parent and offer Mark died.

H2. Web has no genetics at all.
- No "genotype" reference in W AnimalDetailClient.tsx, EditAnimalClient.tsx or add/page.tsx.
- Only mobile can record an animal's genes: M/src/components/GenotypeSection.tsx via AnimalDetailScreen.tsx:~478 (snake-only) and M/src/components/forms/AddGenesField.tsx via reptile/add.tsx.
- The web clutch "Predicted outcomes" panel (W breeding/clutches/[id]/page.tsx:~290-330) reads animal_genotypes, so a web-only keeper always sees the "no genotype" note.
- Hold-back creates the animal without copying offspring.recorded_genotype (W breeding/offspring/[id]/page.tsx:246-262; M breeding/offspring/[id].tsx:330-345).
- Once linked, the offspring genotype editor is disabled ("the live record's own genotype is authoritative"), so the hatch genotype is orphaned.

H3. Shared-card links cannot be listed or revoked on web (HV or TV).
- Only M/app/share/cards.tsx plus M/src/lib/share-cards.ts:75-79 call GET/DELETE /card-links/.
- Grep of W and web/src shows no list or revoke UI; the web ShareCardModal only creates links (ShareCardModal.tsx:247-250).
- A web-only keeper has no way to turn a link off, which breaks the spec's revocation promise.

## MEDIUM

M1. A transfer can be claimed twice, so one animal becomes two.
- API/routers/transfers.py:376-424 (create_animal_transfer) only checks transferred_out_at and never cancels an older pending link.
- _claim_animal_transfer (567-640) never re-checks source.transferred_out_at or died_at.
- Two pending links for one animal can both be claimed. The invert path (~1000-1060) has the same gap.
- Also, a link created before the animal died stays claimable afterwards.

M2. HV transfers have no pedigree and no sale bookkeeping.
- The snapshot has dam/sire = None (transfers.py:145-180) and no genotypes are copied.
- The claim path never touches ReptileOffspring. The TV path flips Offspring to SOLD and sets buyer_info (transfers.py:~1040).
- A sold hatchling stays "kept" or "available".

M3. Breeding copy is not taxon-aware, so turtle / tortoise / frog / salamander / other keepers see snake wording.
- Web "Slugs" at breeding/clutches/[id]/page.tsx:206 and clutches/new/page.tsx:246. Mobile at breeding/clutches/[id].tsx:347 and clutches/new.tsx:423.
- "reptiles" in picker hints: W pairings/new/page.tsx:208,306,322; M pairings/new.tsx:252,372,390,741.
- "Cutting strategy" placeholder at M clutches/new.tsx:463.
- "Initial egg count": amphibian egg masses and live-bearers are not eggs.
- "New reptile" in the hold-back flow.
- The pickers themselves are fine. Taxon chips come from owned taxa in registry order (W pairings/new:131-143, M new.tsx:195-210), and the parent filter is same-taxon.
- API/routers/reptile_pairings.py:120,125,130 builds "{taxon}s", so "other" gives "Both parents must be others." and "Male slot must be a male ... other."

M4. Clutch counts are capped at 200.
- API/schemas/reptile_breeding.py:122-126 (le=200) on expected, fertile, slug, hatched and viable counts.
- Mirrored in W clutches/new/page.tsx:140-141 and M clutches/new.tsx:168-172 ("0-200").
- Frog and toad clutches routinely exceed this, so the 422 blocks recording for the newly enabled taxa.

M5. Wrong-taxon defaults to 'snake'.
- Hold-back submit uses `taxon: holdBackPrefill?.taxon ?? 'snake'` (W breeding/offspring/[id]/page.tsx:250, M breeding/offspring/[id].tsx:334).
- When the prefill chain fails (holdBackPrefillError), the modal can still be submitted and creates a snake record under a frog or turtle pairing.
- Species care sheet to Add CTA ignores the API's `taxon` and guesses from hard-coded family sets, falling back to 'snake' (M species/[id].tsx:113-123,276; W species/[id]/page.tsx:91-128). Unlisted families (Bufonidae, Ranidae, Pipidae, Elapidae, and so on) pre-select Snake with a species linked.

M6. A died animal on web still shows write actions that mobile hides.
- Web Edit link: AnimalDetailClient.tsx:909 (`canKeep` only).
- Web QR upload: :424 (`isOwner`, not gated on `closed`).
- Web photo manage (set main / caption / delete): :441 `canManage={access.canKeep}`.
- Mobile gates all of these on !dead: AnimalDetailScreen.tsx:271,289; ReptilePhotoGalleryScreen.tsx:84-85.
- The server enforces none of it: PUT /animals/{id} (animals.py:~610), POST /animals/{id}/upload-session (qr.py:246-264), POST transfer (transfers.py:376-424) and /animals/bulk-feedings (animals.py:545-548, no active-only filter) all accept a died or transferred animal.

M7. Brumation is a dead feature.
- No client can set brumation_active or brumation_started_at. Grep across W and M finds display only (ReptilePublicProfile.tsx:206, AnimalHero, FeedingCard.tsx:329).
- /animals/feeding-status (animals.py:~470-520) and digest_service ignore it.
- M FeedingCard.tsx:329 tells keepers "Brumation is active. Reminders are silenced." That is untrue for Feeding Day and the digest.

M8. Web is missing detail that mobile shows.
- The web clutch page is headed "Counts & conditions" (clutches/[id]/page.tsx:190) but shows and edits no incubation temps or humidity. Mobile shows them (clutches/[id].tsx:303-330).
- The web offspring detail has no hatch weight or length (only used for hold-back at :258-259). Mobile shows both (offspring/[id].tsx:489-505).
- Neither platform can edit those fields after creation.

M9. Web lacks notification preferences and any search.
- Mobile has app/notification-preferences.tsx (digest, quiet hours). Web has the inbox only, with no preferences UI anywhere in W.
- The mobile Collection tab has local search (index.tsx:124-244). The web Collection page has none, and TopBar.tsx:24 omits search.
- API/routers/search.py does not search HV animals (inverts and colonies only).

M10. No change-taxon for HV.
- TV has POST /inverts/{id}/change-taxon (inverts.py:930, "refusing to let someone fix a mis-tap isn't data integrity").
- HV AnimalUpdate has no taxon and there is no route. The only fix is delete, which triggers H1.

M11. Export omits HV feeder stock.
- API/services/export_service.py has no hv_feeder reference (models/hv_feeder.py exists).
- Animals, logs, genotypes, pairings, clutches, offspring and enclosures are covered.
- A GDPR export is therefore incomplete for feeder keepers.

M12. Per-animal events API has no HV client.
- API/routers/animal_events.py:110-123 serves /animals/{id}/events.
- There is no reference in W or M; TV web has web/src/lib/animal-lifecycle.ts:146+.

## LOW

- Offspring hatch_length_in is Numeric(5,1) (models/reptile_offspring.py:107), but clients parse to 2 dp.
  - 20 cm becomes 7.87 in, stores 7.9, and displays 20.1 cm.
  - 5.25 in stores 5.3. The same value is copied into the held-back animal's current_length_in.
- Public /a/{id} (qr.py:1236-1250) checks only collection_visibility and ignores animal.visibility. Latent, because HV has no per-animal toggle; TV enforces it (/i, public_card).
- Mobile "Share profile link" never passes collectionVisibility (AnimalDetailScreen.tsx:528), so the "your collection is private" banner in ReptileShareSheet.tsx:90 never shows. Web ReptileQRModal has no private warning either.
- Case-only location rename is impossible: canonical_location snaps the new name to the old spelling (utils/locations.py:114-122,156-179) and the clients early-return (W reptiles/page.tsx:265-270). Same on TV.
- Importer maps length / size / svl straight to inches (import_service.py:~540-545). A metric keeper's cm column is stored unconverted; the field label is "Length (in)".
- Mobile add/edit has no length field (web has current_length_in), so length can only be set on web or via import.
- W AnimalDetailClient.tsx:648-650 shows provenance length at 1 dp in imperial but 2 dp-then-1 dp in metric.
- API create_pairing (reptile_pairings.py:~100-131) accepts died or transferred parents. UI filters them, the API does not.
- "Reptile" eyebrow (AnimalDetailClient.tsx:~904) and "Name your new reptile" copy appear on amphibians.
- Mobile "Export your data" only deep-links to web settings (profile.tsx:60,308). Mobile has no achievements screen (web has /app/achievements), no transfers index, and no claim screen (documented).
- Revive is not capped (animals.py:~765). Intentional.

## (1) Web vs mobile parity matrix

| Capability | Web | Mobile | Note |
|---|---|---|---|
| Add / edit animal | yes (+ length) | yes (+ genes in add) | web has current_length_in, mobile has genes (H2) |
| Detail: feeding / shed / weight logs, edit and delete | yes | yes | |
| Weight chart | yes | yes | |
| Photos | yes | yes | |
| Pause feeding, cadence | yes | yes | |
| Brumation | display only | display only | M7 |
| Mark died / restore / deceased archive | yes | yes | M6 on web |
| Locations: picker, grouping, rename/merge, bulk (Feeding Day) | yes | yes | parity |
| Breeding: pairings / clutches / offspring / hold-back | yes | yes | M8 |
| Genetics on animal | no | snake only | H2 |
| Share cards: profile / shed / weight | yes | yes | |
| Card-link list / revoke | no | yes | H3 |
| QR label and /a page | yes | yes | |
| Transfers: create | yes | yes | |
| Transfers: index | yes | no | |
| Transfers: claim | yes | no (by design) | |
| Co-keepers, sitter | yes | yes | |
| Import | yes | yes | |
| Export | in-app | links to web | |
| Notifications | inbox | inbox + preferences | M9 |
| Units setting | yes | yes | |
| Search | none | local only | M9 |
| Achievements | yes | no | |

## (2) HV vs TV, shared platform features

HV lacks the following that TV has: change-taxon (M10), per-animal events client (M12), per-animal visibility toggle and enforcement (LOW), transfer pedigree and sold-offspring flip (M2), global search (M9), export of the feeder module (M11), and web card-link management (H3, which TV also lacks).
Co-keepers, sitter passes, locations, units, share-card pipeline, import/export, and mark-died are all present.

## (3) Newest-work correctness

- Units conversions are consistent. The four copies (API utils/units.py, web and mobile HV lib/units.ts, TV web) share the same formulas and rounding.
- The edit round-trip does not drift. W useUnitField returns the original stored value until the field is typed in (hooks/useUnitField.ts:55-72; EditAnimalClient.tsx:130,148,222). Mobile has no editable unit field.
- Metric temp bounds 5-48 C map inside the server's 40-120 F (clutches/new web :190-191, mobile :90-91).
- The only precision caveat is the Numeric(5,1) offspring length (LOW).
- Location rename and merge is scoped to HV only.
  - Routes use SCOPE_HERPETOVERSE (animals.py:379,394,397,417,294,620; import_export.py:194,233).
  - TV calls default to the TV scope (inverts + colonies).
  - Routes are ordered before /{animal_id}.
  - The importer canonicalises in HV scope.
  - list_locations excludes died and transferred rows.
- Died animals are excluded from active lists, the Feeding Day status query, digest, cap, and sitter pass queries (limits.active_animals_query). Write-action leakage is limited to M6.
- Breeding pickers do cover turtle / tortoise / frog / salamander / other (TaxonStr includes all 7, test-pinned). The problems are copy, the 200 cap, and the snake fallbacks (M3-M5).
