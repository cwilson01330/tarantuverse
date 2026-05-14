/**
 * Feeding-status data layer.
 *
 * Wraps GET /animals/{id}/feeding-status (ADR-003 collapsed the per-taxon
 * snake/lizard endpoints). The server combines:
 *   - the species' interval_days_min/max from life_stage_feeding,
 *   - the most recent ACCEPTED feeding (refusals do not reset the clock),
 *   - and a brumation override
 * into a single "due / overdue / upcoming" status the detail screens
 * render as a colored banner.
 *
 * Lives in mobile-only for now since the JS-bundled OTA can't ship local
 * notifications yet (no expo-notifications in the binary). Visible UI
 * indicators are the v1 substitute. Native push reminders layer on once
 * we cut a fresh native build.
 */
import { apiClient } from '../services/api';

export type FeedingStatusKind =
  | 'no_data'
  | 'no_feedings'
  | 'paused'
  | 'upcoming'
  | 'due'
  | 'overdue';

export interface FeedingStatus {
  status: FeedingStatusKind;
  last_fed_at: string | null;
  interval_days_min: number | null;
  interval_days_max: number | null;
  next_feeding_due_at: string | null;
  next_feeding_overdue_at: string | null;
  /** Days until elapsed reaches interval_min. Negative = past lower bound. */
  days_until_due: number | null;
  is_data_available: boolean;
  note: string | null;
}

export async function fetchFeedingStatus(
  animalId: string,
): Promise<FeedingStatus> {
  const { data } = await apiClient.get<FeedingStatus>(
    `/animals/${encodeURIComponent(animalId)}/feeding-status`,
  );
  return data;
}
