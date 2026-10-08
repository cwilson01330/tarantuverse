/**
 * Per-animal events — health & lifecycle notes (ADR-015 D5, audit-2 M12).
 *
 * Herpetoverse client for the shared events router
 * (apps/api/app/routers/animal_events.py):
 *
 *   GET/POST   /animals/{animal_id}/events
 *   PUT/DELETE /animal-events/{event_id}
 *
 * Mirrors TV mobile's events half of apps/mobile/src/lib/inverts.ts and HV
 * web's src/lib/animalEvents.ts — same types, order and copy; keep the three
 * in step. One deliberate difference from TV: the API's `bad_molt` type is
 * labelled "Bad shed" here, because reptiles and amphibians shed rather than
 * molt (the same event — a stuck or incomplete ecdysis).
 */
import { apiClient } from '../services/api';

export type AnimalEventType =
  | 'injury'
  | 'illness'
  | 'bad_molt'
  | 'escape'
  | 'recovered'
  | 'rehoused'
  | 'vet_visit'
  | 'observation'
  | 'death';

export type AnimalEventSeverity = 'minor' | 'moderate' | 'severe';

export interface AnimalEvent {
  id: string;
  invert_id: string | null;
  animal_id: string | null;
  event_type: AnimalEventType;
  /** YYYY-MM-DD — a date, not a timestamp. */
  occurred_at: string;
  severity: AnimalEventSeverity | null;
  notes: string | null;
  created_at: string;
  /** Co-keeper attribution — who logged it, when it wasn't the owner. */
  logged_by_user_id?: string | null;
  logged_by_name?: string | null;
}

export interface AnimalEventPayload {
  event_type: AnimalEventType;
  occurred_at?: string | null;
  severity?: AnimalEventSeverity | null;
  notes?: string | null;
}

export const ANIMAL_EVENT_LABELS: Record<AnimalEventType, string> = {
  injury: 'Injury',
  illness: 'Illness',
  bad_molt: 'Bad shed',
  escape: 'Escaped',
  recovered: 'Recovered',
  rehoused: 'Rehoused',
  vet_visit: 'Vet visit',
  observation: 'Observation',
  // The type is `death`; the label is "Died" — the record's own wording.
  death: 'Died',
};

/** Picker order: `observation` first (the catch-all), `death` last so
 *  nobody taps it by accident. */
export const ANIMAL_EVENT_ORDER: AnimalEventType[] = [
  'observation',
  'injury',
  'illness',
  'bad_molt',
  'recovered',
  'escape',
  'rehoused',
  'vet_visit',
  'death',
];

export const ANIMAL_EVENT_SEVERITIES: AnimalEventSeverity[] = ['minor', 'moderate', 'severe'];

/** A prompt for the keeper's own words, which are the point of this log. */
export const ANIMAL_EVENT_NOTE_HINT: Record<AnimalEventType, string> = {
  injury: 'e.g. rostral rub from nosing the lid',
  illness: 'What you noticed, and what you changed',
  bad_molt: 'What went wrong, and how they are now',
  escape: 'How they got out, and where you found them',
  recovered: 'Which problem this answers',
  rehoused: 'What they moved into, and why',
  vet_visit: 'What was found, and what was advised',
  observation: 'Anything worth remembering',
  death: 'Marking them as died is on the animal’s own page — this is just a note',
};

/** Severity only means something for injury and illness. */
export function eventHasSeverity(t: AnimalEventType): boolean {
  return t === 'injury' || t === 'illness';
}

/** "Injury · Moderate" or just "Observation". */
export function eventTitle(e: Pick<AnimalEvent, 'event_type' | 'severity'>): string {
  const label = ANIMAL_EVENT_LABELS[e.event_type] ?? 'Event';
  return e.severity ? `${label} · ${e.severity[0].toUpperCase()}${e.severity.slice(1)}` : label;
}

export async function listAnimalEvents(animalId: string): Promise<AnimalEvent[]> {
  const { data } = await apiClient.get<AnimalEvent[]>(
    `/animals/${encodeURIComponent(animalId)}/events`,
  );
  return data;
}

export async function createAnimalEvent(
  animalId: string,
  payload: AnimalEventPayload,
): Promise<AnimalEvent> {
  const { data } = await apiClient.post<AnimalEvent>(
    `/animals/${encodeURIComponent(animalId)}/events`,
    payload,
  );
  return data;
}

export async function updateAnimalEvent(
  eventId: string,
  payload: Partial<AnimalEventPayload>,
): Promise<AnimalEvent> {
  const { data } = await apiClient.put<AnimalEvent>(
    `/animal-events/${encodeURIComponent(eventId)}`,
    payload,
  );
  return data;
}

export async function deleteAnimalEvent(eventId: string): Promise<void> {
  await apiClient.delete(`/animal-events/${encodeURIComponent(eventId)}`);
}
