/**
 * How a colony event reads — design handoff, screen 8.
 *
 * Activity rows used to say "Birth / +120 nymphs · Jul 14" next to an emoji.
 * They now read as a sentence ("120 nymphs born"), with an icon and a colour
 * that mean the same thing everywhere a colony event is drawn.
 *
 * Deaths use a neutral minus mark rather than a skull: same register as the
 * animal "End of record" work (ADR-015) — a count going down is a record, not
 * a tragedy we illustrate.
 */
import type { ColonyEvent, ColonyEventType } from './colonies';
import { daysBetween } from '../utils/date';

export type EventTone = 'success' | 'error' | 'warning' | 'accent' | 'muted';

export const COLONY_EVENT_MDI: Record<ColonyEventType, string> = {
  birth: 'egg-outline',
  death: 'minus-circle-outline',
  added: 'plus-circle-outline',
  removed: 'export',
  cannibalism: 'alert-octagon-outline',
  aggression: 'sword-cross',
  molt_found: 'layers-outline',
  split: 'call-split',
  merge: 'call-merge',
  observation: 'note-text-outline',
  count_correction: 'counter',
};

export const COLONY_EVENT_TONE: Record<ColonyEventType, EventTone> = {
  birth: 'success',
  death: 'error',
  added: 'success',
  removed: 'warning',
  cannibalism: 'error',
  aggression: 'warning',
  molt_found: 'muted',
  split: 'warning',
  merge: 'success',
  observation: 'muted',
  count_correction: 'accent',
};

/** "nymphs" / "adult females" / "animals" — the stage as it reads mid-sentence. */
function who(stage: string | null | undefined, n: number): string {
  const s = (stage ?? '').trim();
  if (!s || s.toLowerCase() === 'mixed') return n === 1 ? 'animal' : 'animals';
  return s.toLowerCase();
}

/** The event as one short sentence. */
export function colonyEventSentence(ev: Pick<ColonyEvent, 'event_type' | 'stage' | 'count_delta' | 'notes'>): string {
  const n = Math.abs(ev.count_delta ?? 0);
  const has = ev.count_delta != null && ev.count_delta !== 0;
  const count = n.toLocaleString();
  switch (ev.event_type) {
    case 'birth':
      return has ? `${count} ${who(ev.stage, n)} born` : 'Young born';
    case 'death':
      return has ? `${count} ${who(ev.stage, n)} died` : 'Losses recorded';
    case 'added':
      return has ? `${count} ${who(ev.stage, n)} added` : 'Animals added';
    case 'removed':
      return has ? `${count} ${who(ev.stage, n)} removed` : 'Animals removed';
    case 'cannibalism':
      return has ? `Cannibalism — ${count} lost` : 'Cannibalism';
    case 'aggression':
      return 'Aggression seen';
    case 'molt_found':
      return 'Molt found';
    case 'split':
      return has ? `Split off ${count} ${who(ev.stage, n)}` : 'Colony split';
    case 'merge':
      return has ? `Merged in ${count} ${who(ev.stage, n)}` : 'Colonies merged';
    case 'count_correction':
      return ev.stage && ev.stage.toLowerCase() !== 'mixed' ? `Recounted ${ev.stage.toLowerCase()}` : 'Recounted';
    case 'observation':
    default: {
      const first = (ev.notes ?? '').split('\n')[0].trim();
      return first ? (first.length > 60 ? `${first.slice(0, 57)}…` : first) : 'Observation';
    }
  }
}

/** "Today" / "Yesterday" / "5 days ago" / "Jul 14" for a YYYY-MM-DD date. */
export function relativeDay(date: string | null | undefined): string {
  const d = daysBetween(date);
  if (d == null) return '';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 14) return `${d} days ago`;
  const [y, m, dd] = (date ?? '').split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, dd ?? 1);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(dt.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
