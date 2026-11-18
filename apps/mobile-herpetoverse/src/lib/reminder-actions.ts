/**
 * Notification-button helpers (Effortless logging, task 4). Pure.
 *
 * The push categories `feeding_due` and `feeding_summary` carry buttons whose
 * identifiers are mapped here to the API's `reminder-action` values.
 */
export type ReminderAction = 'fed' | 'refused' | 'tomorrow';

/** Button id → action. `open_feeding_day` (and anything unknown) → null. */
export function actionFromIdentifier(id: string): ReminderAction | null {
  if (id === 'fed' || id === 'refused' || id === 'tomorrow') return id;
  return null;
}

/** Text for the toast: the server's own message, else the error, else a fallback. */
export function toastFor(result: { message: string } | null, error?: string): string {
  if (result && result.message) return result.message;
  if (error) return error;
  return 'Something went wrong. Please try again.';
}
