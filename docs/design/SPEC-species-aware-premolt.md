# Species-Aware Premolt Prediction — Scope & Spec

_Status: proposed, unsized — use this doc to decide whether to schedule._

## Why

The current `predict_premolt` algorithm is species-agnostic — the thresholds (3 consecutive refusals, 60% of average molt interval elapsed) apply identically to a 0.5" sling and to a 6" adult female. The same "3 refusals" means very different things biologically:

- **Sling** (feeds every 2-3 days): 3 refusals ≈ 1 week of not eating. Strong premolt signal.
- **Adult female** (feeds every 2-4 weeks): 3 refusals ≈ 2-3 months of not eating. Probably a strong signal. But 2 refusals over 4 weeks could just mean she wasn't hungry.

Net effect today: the algorithm **over-predicts premolt on slings** (one bad week and we flag them) and **under-predicts on adults** (they can go months between meals normally, our 60% threshold fires far earlier than biologically appropriate).

A species-aware version scales thresholds against the individual's life stage and species norms, which should meaningfully improve accuracy for the keeper's actual experience.

## Proposed changes

### 1. Extend the species catalog with structured intervals

Current `species.feeding_frequency_*` columns are free-text (`"every 2-3 days"`). Add structured integer-day fields alongside:

```sql
ALTER TABLE species
  ADD COLUMN typical_feeding_interval_sling_days INTEGER,
  ADD COLUMN typical_feeding_interval_juvenile_days INTEGER,
  ADD COLUMN typical_feeding_interval_adult_days INTEGER,
  ADD COLUMN typical_molt_interval_sling_days INTEGER,
  ADD COLUMN typical_molt_interval_juvenile_days INTEGER,
  ADD COLUMN typical_molt_interval_adult_days INTEGER;
```

Keep the free-text fields in place for the care sheet display; use the structured ones for algorithmic decisions.

### 2. Seed data — this is the bulk of the work

100+ species × 3 life stages × 2 metrics = ~600 data points to research and enter. Sources:

- Tom's Big Spiders, Tarantula Collective, Arachnoboards species threads (feeding cadence)
- Community-contributed molt logs once we have enough user data (long-term calibration)
- Published hobbyist references for common species (G. rosea, B. hamorii, P. metallica, etc.)

Realistic approach:

- **Phase 2a (seed)**: research ~20 most-common species by-hand. Cover the 80% case. ~4-6h.
- **Phase 2b (catch-up)**: remaining ~80 species get sparse data or inferred defaults. Community submissions over time fill gaps.
- **Fallback**: when a species has no structured data, fall back to the current species-agnostic thresholds. Algorithm always has a working path.

### 3. Life stage inference

The algorithm needs to know which life stage a tarantula is in so it can look up the right typical interval. Options, in order of preference:

**A. Inferred from latest molt's `leg_span_after`:**
- `< 1.5"` → sling
- `1.5–3"` → juvenile
- `> 3"` → adult
- Problem: species-dependent. *T. blondi* sling at 1" is a sling, but a mature *Cyriocosmus* is still only 1.5".

**B. Inferred from leg-span relative to species `adult_size`:**
- `< 25% of adult size` → sling
- `25–75%` → juvenile
- `> 75%` → adult
- Better, but requires parsing `adult_size` text (`"6-7 inches"`) into a number. Doable; adds ~1h of parser work.

**C. Explicit `life_stage` field on `Tarantula`:**
- Keepers pick sling / juvenile / subadult / adult when adding a spider.
- Most accurate but adds a form field and a migration.
- Also needs periodic re-evaluation (sling becomes juvenile after a few molts).

**Recommendation**: **B first**, with **C as an optional override** the keeper can set if they disagree with inference. Schema: `Tarantula.life_stage_override VARCHAR(20)`, nullable.

### 4. Algorithm updates

Replace the species-agnostic thresholds with species-scaled ones:

```python
# Pseudocode
stage = infer_life_stage(tarantula, species)
typical_molt = species.typical_molt_interval_{stage}_days  # may be None
typical_feeding = species.typical_feeding_interval_{stage}_days  # may be None

# Refusal threshold: scale by typical feeding cadence. A spider that
# eats every 3 days: 3 refusals ≈ 9 days. A spider that eats every 14
# days: scale threshold down to avoid requiring a ~6-week refusal window.
# Use: threshold = max(2, min(5, ceil(14 / typical_feeding)))

# Interval-progress threshold: keep at 60% when we have the individual's
# own data (3+ molts). Below that, use species typical interval as the
# baseline and nudge the threshold higher (70-75%) because species
# priors are looser than individual history.
```

For spiders with sparse individual history, the species typical interval becomes the anchor. As the keeper logs more molts, the individual's own data progressively dominates:

```python
def effective_molt_interval(individual_intervals, species_typical):
    n = len(individual_intervals)
    if n >= 4:
        return sum(individual_intervals) / n  # trust individual fully
    if n == 0:
        return species_typical  # trust species fully
    # Blend: each individual interval is worth a "vote" against species
    individual_avg = sum(individual_intervals) / n
    weight = n / 4  # 0.25 at n=1, 0.75 at n=3
    return individual_avg * weight + species_typical * (1 - weight)
```

### 5. Confidence signal gets better

Today confidence is `low/medium/high` based on the predicate strength. Species-aware version can express uncertainty more honestly:

- **high**: strong behavioral + temporal signal AND (individual has 4+ molts OR species has structured data)
- **medium**: moderate signal OR strong signal with sparse data
- **low**: temporal signal only, OR no species priors AND sparse individual data

### 6. Ultimate-molt handling (mature males)

Adult males of most tarantula species undergo a final "ultimate molt" after which they don't molt again — they spend the remaining months searching for females. Current algorithm happily predicts premolt for a mature male forever.

Signals we could detect automatically:
- Keeper logs `sex: male` AND most recent molt has `leg_span_after` equal to or larger than species typical max → probably ultimate molt
- Explicit `is_mature_male` boolean on `Tarantula`, defaulting to false; keeper can toggle after noticing palpal bulbs or tibial hooks

Either way, when `is_mature_male=true`, return `{is_premolt_likely: false, data_quality: "post_ultimate_molt"}` and skip the prediction entirely. Surface a small "This male has had his ultimate molt" badge in the UI.

## Effort estimate

| Phase | Work | Time |
| --- | --- | --- |
| Schema | Migration + model updates + Pydantic schemas | 2h |
| Seed research | 20 most-common species, structured intervals across 3 life stages | 6h |
| Life stage inference | Parse `adult_size`, implement stage function + override field | 3h |
| Algorithm rewrite | Scaling logic, blending, new confidence buckets | 4h |
| Mature-male handling | Detection + UI badge | 2h |
| Testing | Unit tests with synthetic data per life stage / species | 3h |
| **Total** | | **~20h** |

## Risk of shipping later vs never

Keeper trust in the premolt feature is probably the gating factor for it being a real selling point. If keepers see clearly wrong predictions for their slings or adults, they'll dismiss the feature and remember it as unreliable even after we fix it. Worth doing before heavy marketing of the analytics story.

The three quick-win fixes shipped alongside this doc should reduce the false-positive rate enough that it's not actively misleading in the meantime, but the underlying species-blindness remains.

## When to schedule

Good candidates:
- Phase 5 / Advanced Features (already listed in CLAUDE.md roadmap)
- During a post-launch analytics push when we have real usage data to calibrate against
- Batched alongside the Smart Feeding Reminders service (`feeding_reminder_service.py`) which is also species-agnostic today — same data additions would improve both
