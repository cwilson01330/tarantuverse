/**
 * `/tarantula/[id]` — redirects to the unified animal detail screen.
 *
 * WHAT THIS FILE USED TO BE
 * -------------------------
 * 1,296 lines of bespoke markup. The app's most-visited screen existed twice:
 * this one for tarantulas, `/invert/[id]` for the other ten taxa in a third of
 * the space using shared primitives. They had drifted badly — this screen had
 * the pinned action bar, premolt, feeding stats, QR and pause; that one had
 * provenance, transfer and breeding. Neither had everything, and every feature
 * built after the split either got built twice or landed on one side only.
 * ADR-013 records the merge.
 *
 * WHY A REDIRECT RATHER THAN EDITING THE CALL SITES
 * -------------------------------------------------
 * Eight places push to `/tarantula/{id}`: the collection grid, Home, the
 * premolt alert card, analytics, enclosure inhabitants, offspring links, and
 * the public `/t/{id}` route. Rewriting all eight risks missing one and leaving
 * a dead end. Keeping the route and resolving it here means every existing
 * deep link keeps working — including ones baked into already-delivered push
 * notifications, which we cannot edit after the fact.
 *
 * WHY THIS IS SAFE NOW AND WASN'T BEFORE
 * --------------------------------------
 * `getInvert(id)` reads the consolidated `inverts` table (ADR-005), which has
 * carried every tarantula since the 2026-05-27 backfill. Three things had to
 * land first, or redirecting would have silently deleted shipped features for
 * tarantula keepers:
 *   - `INVERT_TAXA` gained a tarantula entry (ADR-013), so the hero renders a
 *     real label and glyph instead of falling through to "Invert".
 *   - QRSheet + PauseFeedingSheet learned a `resource` prop, and the backend
 *     gained a taxon-agnostic `POST /inverts/{id}/upload-session`.
 *   - PhotoViewer and PremoltPredictionCard were mounted on the unified screen.
 *
 * Sibling routes (`/tarantula/add-feeding`, `/tarantula/edit`, …) are separate
 * files and still exist. The unified screen uses the generic `/invert/*` log
 * screens, which hit the same polymorphic endpoints.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TarantulaDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/invert/${id}` as any} />;
}
