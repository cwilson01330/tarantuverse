# Species image sourcing — handoff

**Date:** 2026-06-16
**Companion file:** `species_images_wikimedia.csv`
**Scope:** Open-license images for the 127 existing `invert_species` rows that had `image_url = NULL`.

## What's in the CSV

Join on `scientific_name_lower`. Columns: `scientific_name_lower, taxon, status, license, attribution, image_url, commons_file`.

`status` values:
- **verified** (60 rows) — image URL + license + attribution all confirmed. **Every license is commercial-safe** (CC0, CC BY, CC BY-SA, or public domain — no NC/ND). Ready to use. (Includes 6 added via the 2026-06-16 high-priority recheck: Pandinus imperator, Gromphadorhina portentosa, Leiurus quinquestriatus, Centruroides sculpturatus, Vaejovis spinigerus, Smeringurus mesaensis — all found via direct Commons category search.)
- **license_pending** (4 rows) — image found, license not yet pulled (Scolopendra cingulata, dehaani, alternans, Rhysida longipes). All are Wikimedia Commons files, so almost certainly CC; just need the extmetadata call to confirm before use.
- **review_quality** (1 row) — Antillena rickwesti: the only Commons image is a taxonomic description plate (with figure arrows), not a display photo. Usable but poor for a public landing page; source a better one if possible.

## How to use (image agent)

1. For `verified` rows, set `invert_species.image_url` = the `image_url`, and `image_attribution` = the `attribution` string (already formatted "Author, License, via Wikimedia Commons").
2. **Do not hotlink `upload.wikimedia.org` in production.** Copy each into your own R2 bucket (same as the photo-copy pattern) and point `image_url` at your object. Hotlinking Commons is against their etiquette and risks breakage. Keep the attribution regardless — CC BY/BY-SA require it; CC0/PD don't but crediting is courteous.
3. For `license_pending`, run a Commons `imageinfo&iiprop=extmetadata` lookup on the `commons_file` to capture license + artist before using.

## Yield reality (important)

Wikipedia lead-image coverage is **very uneven**:
- **Charismatic taxa (scorpions, mantises, jumping spiders, roaches, centipedes, whip spiders): high hit rate** — most found, good photos.
- **Obscure / old-world / recently-described tarantulas: low hit rate** (~25%), and several finds are scientific plates rather than vivarium photos.

So 59 of 127 (~46%) were sourced here; the rest have no usable free lead image via this method.

## Not found here — need manual / Commons-category / owner-permission sourcing

**High-priority rechecks — DONE (2026-06-16).** 6 of 7 resolved via direct Commons category search and promoted to `verified` in the CSV. Only `Chicobolus spinigerus` remains unfound — it has **no Commons category** under that binomial; try the common name "Florida ironclad millipede" or the genus `Chicobolus`, otherwise it needs a keeper-permissioned photo.

**Tarantulas not found** (mostly obscure — may need keeper-permissioned photos):
Augacephalus ezendami, Avicularia braunshauseni, Avicularia geroldi, Birupes simoroxigorum, Brachypelma baumgarteni, Bumba cabocla, Ceratogyrus attonitifer, Ceratogyrus brachycephalus, Ceratogyrus sanderi, Cyriopagopus minax, Encyocratella olivacea, Eucratoscelus constrictus, Eucratoscelus pachypus, Grammostola actaeon, Haplocosmia himalayana, Haplopelma vonwirthi, Harpactira baviana, Harpactira dictator, Harpactira marksi, Harpactira namaquensis, Heterothele gabonensis, Heterothele villosella, Holothele longipes, Homoeomma chilensis, Hysterocrates gigas, Hysterocrates hercules, Idiothele nigrofulva, Iridopelma hirsutum, Iridopelma zorodes, Megaphobema mesomelas, Omothymus schioedtei, Omothymus violaceopes, Phormingochilus everetti, Poecilotheria miranda, Psalmopoeus ecclesiasticus, Psalmopoeus emeraldus, Pterinochilus lugardi, Sericopelma rubronitens, Tapinauchenius gigas, Thrixopelma cyaneolum, Xenesthis intermedia.

**Scorpions/other not found:**
Androctonus mauritanicus, Babycurus jacksoni, Diplocentrus melici, Heterometrus silenus, Hottentotta judaicus, Lychas mucronatus, Lucihormetica subcincta (roach), Heterophrynus batesii (whip), Euphrynichus bacillifer (whip).

**Trade-name morphs** (no scientific Wikipedia page exists — need keeper/community photos):
Chilobrachys sp. 'Electric Blue', Cyriopagopus sp. 'Hati Hati', Hapalopus sp. 'Colombia Large', Hapalopus sp. 'Colombia Small', Homoeomma sp. 'Blue', Omothymus sp. 'Valhalla', Pamphobeteus sp. 'machala', Pamphobeteus sp. 'platyomma', Phormictopus sp. 'Dominican Purple', Phormictopus sp. 'Green', Tapinauchenius sp. 'Yasuni'.

## Method (repeatable for new species the care agent adds)

1. Batch query (≤50 titles) `en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|name&formatversion=2&titles=Genus_species|...` → lead image URL + filename.
2. Batch query `commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired&titles=File:...|...` → license + artist.
3. Keep only CC0 / CC BY / CC BY-SA / PD. Reject CC BY-NC / -ND (non-commercial — unusable on a commercial site).
4. Copy the file into R2; never hotlink Commons.
