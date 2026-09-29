/**
 * `/tarantula/add-photo` — redirects to the shared add-photo screen.
 *
 * This was a 405-line copy of the photo picker/uploader that nothing linked to
 * any more (tarantula detail redirects to /invert/[id], which pushes
 * /invert/add-photo). Tarantulas share their id with the inverts row, so the
 * same id works there. Kept as a redirect so any saved navigation state or old
 * link still lands on the working screen — with the preview fix and the photo
 * limit message that this copy never had.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TarantulaAddPhotoRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={{ pathname: '/invert/add-photo', params: id ? { id } : {} } as never} />;
}
