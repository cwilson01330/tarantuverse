/**
 * Legacy lizard edit route — redirects to the unified
 * `/reptile/edit/[id]`. ADR-003 route collapse.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/reptile/edit/${id}` as never} />;
}
