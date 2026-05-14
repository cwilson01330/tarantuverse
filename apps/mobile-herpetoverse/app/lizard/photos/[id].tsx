/**
 * Legacy lizard photo gallery route — redirects to
 * `/reptile/photos/[id]`. ADR-003 route collapse.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/reptile/photos/${id}` as never} />;
}
