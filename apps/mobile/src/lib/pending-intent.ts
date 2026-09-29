/**
 * One-shot hand-off from a form to the animal's detail screen.
 *
 * expo-router's back() can't carry params. So a form that wants the detail
 * screen to do something next leaves a note here, and the detail screen takes
 * it once it has loaded the animal and resolved the viewer's role.
 *
 * Used for handoff §14.9: after a molt logged as fatal, "Mark as died" goes to
 * the animal and opens the sheet there — never automatically, and never
 * before the molt has saved. The note expires quickly so an abandoned one
 * can't pop the sheet open on some later, unrelated visit.
 */
const TTL_MS = 60_000;
let pending: { id: string; at: number } | null = null;

export function requestMarkDied(animalId: string): void {
  pending = { id: animalId, at: Date.now() };
}

/** Is there a fresh request for this animal? Doesn't consume it. */
export function hasMarkDied(animalId: string | null | undefined): boolean {
  if (!pending) return false;
  if (Date.now() - pending.at > TTL_MS) {
    pending = null;
    return false;
  }
  return pending.id === animalId;
}

export function clearMarkDied(): void {
  pending = null;
}
