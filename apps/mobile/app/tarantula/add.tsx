/**
 * `/tarantula/add` — redirects to the unified add screen (`/add`).
 *
 * This used to be the 721-line two-mode wizard (`quickMode` / `currentStep`)
 * that the design handoff (screen 7) retired in favour of species-first
 * `/add`. The route stays so app-icon shortcuts pinned before the change,
 * saved navigation state and any old links still land somewhere useful.
 * `enclosure_id` (the old enclosure "Add inhabitant" param) is carried over.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TarantulaAddRedirect() {
  const { enclosure_id } = useLocalSearchParams<{ enclosure_id?: string }>();
  return (
    <Redirect
      href={{ pathname: '/add', params: enclosure_id ? { enclosureId: enclosure_id } : {} } as never}
    />
  );
}
