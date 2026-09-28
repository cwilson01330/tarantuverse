# Premium Scope — engineering reply

Thanks — the ranking and the three gating rules hold up against the code, and we're adopting the per-feature entitlement key approach as written (it matches how `can_use_analytics` works today; it currently just mirrors `can_use_breeding`). Below: what we verified, what's changed since the June data, and what's already shipped from "Fix first".

## "Fix first" — status

**1. HV checkout — needs rewording.** Checkout exists: expo-iap in the HV app, Stripe Checkout on herpetoverse.com/pricing. The problem is that no one can reach it, and in two places:

- **iOS:** there are no HV App Store products yet. The modal correctly offers no purchase path on iOS (Guideline 3.1.1), so iOS keepers hit the wall with nothing to buy. This is the single biggest HV revenue item, but it's an App Store Connect task (create and submit the products), not a build.
- **Web:** the HV web upgrade modal still said "There's no self-serve checkout yet — Premium is part of an Appalachian Tarantulas membership", months after Stripe shipped. It also headlined breeding and feeder prompts "Free plan limit reached." **Fixed:** titles now depend on why the prompt opened, and it links to /pricing.

Result so far: the `herpetoverse_premium` plan has **zero subscribers, ever**. HV's only revenue is one All-Access bundle, bought through Google Play.

Please update the card to: *"HV checkout exists but is unreachable: no App Store products on iOS, and the web prompt said there was no checkout (now fixed)."*

**2. TV pricing copy — confirmed, fixed.** The mobile pricing table said 20 free animals, while the plan card on the same screen said 15; export was marked premium-only and listed a PDF export that doesn't exist. The TV upgrade modal also sold "Data export" as a premium perk. All three are fixed. Export is free on every surface now.

**3. Source tracking — shipped**, on all four surfaces (TV/HV × app/web) and all 31 prompts. Events:

- `upgrade_prompt_shown`, `upgrade_prompt_clicked`, `upgrade_prompt_dismissed` (dismiss excludes closes that followed a click)
- `pricing_viewed`
- `upgrade_purchased` — covers app-store purchases and Stripe; the source travels through login and Stripe's `success_url`

HV-app `shown` events also carry `purchase_path` (`store` / `web_link` / `none`), so iOS keepers who see a wall with no way to pay are now a number rather than a guess.

Source vocabulary. The eight feature keys are already reserved, so previews can ship tagged:

- Existing walls: `collection_cap`, `photo_cap`, `breeding`, `advanced_analytics`, `feeders`, `settings`
- Reserved: `forecast`, `benchmark`, `genetics_planner`, `care_routines`, `breeder_desk`, `vet_case_file`, `sensors`, `shared_keeping`

**Ask:** every preview placement in future designs should name its source key. New keys have to be added to four files kept in lockstep, so please flag them in the handoff.

## Corrections to the numbers

- **Paying customers: 6, not 4** — 4 Apple monthly (TV), 1 Stripe lifetime, 1 Google All-Access. There are also **13 admin-granted promo subscriptions**. Please report paid and comped separately, since a raw count of 19 overstates revenue about three-fold.
- **HV's premium set, per the server:** unlimited animals, breeding, feeder tracking. Import and export are free. The HV app modal had listed spreadsheet import as a premium perk and said premium "only lifts the count cap"; both HV modals now match the server.
- **Not re-verified:** "13% of active keepers at the cap" and "photo cap binds on nine animals." Happy to refresh them if they'll drive decisions.

## On the features

No objections to the order. Forecasts first is right: `premolt_service` and feeding pause already exist, so the free/premium split is mostly presentation. One note on sketch 02: the benchmark line should only render when the species clears the ADR-018 bar (≥3 keepers / ≥15 intervals). Below that bar, show nothing rather than a thin comparison.

Tracking went live with this release, so the first two weeks of data are the baseline. We'd hold off judging any Wave 1 feature until then.
