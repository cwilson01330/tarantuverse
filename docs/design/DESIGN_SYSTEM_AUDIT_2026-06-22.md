# Design System Audit — Mobile (Tarantuverse)

**Date:** 2026-06-22
**Scope:** `apps/mobile` (133 screen/component files)
**Method:** Static scan of token definitions, shared primitives, and hardcoded-value usage across `app/` and `src/components/`.

---

## Summary

**Components reviewed:** 11 primitives + token scales | **Issues found:** 4 systemic | **Score: 58/100**

The design system is **well-architected but shallowly adopted.** The token layer (spacing, typography, semantic colors) and the preset architecture (Keeper/Hobbyist layout axis, immutable semantic colors) are clean, documented, and exactly right. The problem is rollout: outside the three newest detail screens and the widely-adopted `AppHeader`, the bulk of the app still hand-rolls `StyleSheet` blocks with raw hex, font sizes, spacing, and radii. The result is a real (not theoretical) light-mode/theme-skinning gap, because hardcoded values don't respond to `colors`, the color presets, or the Keeper/Hobbyist layout tokens.

This is a convergence-debt problem, not a foundation problem. The foundation is good.

---

## Naming Consistency

| Issue | Where | Recommendation |
|-------|-------|----------------|
| Semantic colors re-typed as raw hex | `#ef4444` (×24), `#f97316` (×16), `#eab308` (×12), `#3b82f6` (×11), `#ec4899` (×11) across 49 files | Replace with `colors.error / warning / male / female / info`. These roles already exist in `ThemeContext`. |
| Mixed light/dark literals for the same role | error appears as both `#ef4444` (dark value, ×24) and `#dc2626` (light value, ×11), hardcoded | Always read `colors.error` — it resolves per mode automatically. |
| Component naming is consistent | `AppHeader`, `DateInput`, `PrimaryButton`, `Card`, `Badge`, `Chip` | No renames needed. Naming layer is healthy. |

The naming **conventions** are good; the violation is that values bypass them.

---

## Token Coverage

| Category | Defined | Hardcoded instances found | Adoption |
|----------|---------|---------------------------|----------|
| Colors | ~20 roles (`ThemeContext.ThemeColors`) | **396** hex literals / 49 files | Partial |
| Typography | 8 roles (`TYPE` in `tokens.ts`) | **1,186** raw `fontSize:` / 98 files | Near-zero |
| Spacing | 6-step scale (`SPACING`, 4-pt base) | **2,186** raw `padding/margin:` / 98 files | Near-zero |
| Border radius | 4 tokens per preset (`layout.radius`) | **555** raw `borderRadius:` / 94 files | Near-zero |

The scales exist and are good. The `TYPE` and `SPACING` scales in particular are essentially unused outside `components/ui/`.

---

## Component Completeness

The shared primitives are defined well — typed props, theme + preset aware, documented inline. The gap is **adoption**, shown in the last column.

| Component | States/Variants | Theme-aware | Docs | Files using it | Score |
|-----------|-----------------|-------------|------|----------------|-------|
| `AppHeader` | gradient/flat per preset | ✅ | ✅ | **67** | 9/10 |
| `DateInput` | calendar modal | ✅ | ✅ | **14** (post-2026-06-22 rollout) | 8/10 |
| `PrimaryButton` | default | ✅ | ⚠️ | 9 | 6/10 |
| `Card` | border/shadow per preset | ✅ | ✅ | 3 | 4/10 |
| `SectionCard` | + header/action | ✅ | ✅ | 3 | 4/10 |
| `InfoGrid` / `InfoRow` | — | ✅ | ✅ | 3 | 4/10 |
| `Chip` / `Badge` | neutral / colored | ✅ | ✅ | 3 | 4/10 |
| `AppText` | 8 type variants | ✅ | ✅ | **0** in `app/` | 2/10 |

`components/ui` primitives (Card/SectionCard/InfoRow/InfoGrid/Chip/Badge/AppText) are imported by only **3 of 133 files** — `app/(tabs)/species.tsx`, `app/invert/[id].tsx`, `app/tarantula/[id].tsx`. Everything else (95 files with `StyleSheet.create`) predates the system or was never migrated.

---

## What's working (keep doing this)

- **Semantic-vs-preset separation is correct.** Status/sex colors are immutable and outside the preset system; only accent/gradient/radius/density flex. This is the right architecture and matches `ADR-008`.
- **`AppHeader` rollout proves migration works** — 67 files already use the shared gradient header. The same playbook applies to the rest.
- **`DateInput` is now consistent** across tarantula + invert + breeding forms (this session).
- **The three detail screens** (`tarantula/[id]`, `invert/[id]`, `species`) are the reference implementation — built entirely from primitives. Use them as the migration template.

---

## Priority Actions

1. **Color-token sweep (highest impact, lowest risk).** Replace the ~120 hardcoded semantic hex (`#ef4444→colors.error`, `#3b82f6→colors.male/info`, `#ec4899→colors.female`, `#f97316`/`#eab308`→`colors.warning`) across the 49 offending files. This fixes the light-mode color drift directly and unblocks color-preset skinning. Mechanical, high-confidence, can be done file-by-file. *(Note: the feeding-status badges added this session also hardcode these — fold them into the sweep.)*

2. **Migrate the high-traffic list + form screens to primitives.** `app/(tabs)/collection.tsx`, the `invert/*` and `tarantula/*` add/edit/log forms are the most-seen screens and are 100% hand-rolled. Rebuild their cards/rows/labels on `Card`/`InfoRow`/`AppText`/`Chip`/`Badge`. Biggest visible consistency win.

3. **Adopt `TYPE` + `SPACING` in new code, lint against literals.** Add an ESLint rule (or a CI grep gate) flagging new `fontSize:`/`borderRadius:`/raw-hex in `app/`. Stops the debt from growing while the backlog is worked down.

4. **Promote shared status helpers.** The feeding-status color ramp (green→amber→orange→red by days) is re-implemented inline in collection + detail screens. Extract a `feedingStatusColor(days, colors)` helper so the thresholds and colors live in one place.

---

## Suggested sequencing

Action 1 is a self-contained afternoon and delivers the clearest user-visible fix (light mode). Action 3 (the lint gate) should land right after, so the cleanup doesn't regress. Actions 2 and 4 are larger and can be done screen-by-screen using the three detail screens as the template — no big-bang rewrite needed.

---

*Related prior audits: `PLATFORM_DESIGN_AUDIT_2026-04-13.md`, `AUDIT-2026-04-17-followup.md`.*
