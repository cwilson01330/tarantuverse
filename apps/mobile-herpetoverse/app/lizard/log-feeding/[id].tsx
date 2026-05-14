/**
 * Legacy lizard log-feeding route — redirects to
 * `/reptile/log-feeding/[id]`, forwarding the optional `feedingId` edit
 * param. ADR-003 route collapse.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id, feedingId } = useLocalSearchParams<{
    id: string;
    feedingId?: string;
  }>();
  const href = feedingId
    ? `/reptile/log-feeding/${id}?feedingId=${feedingId}`
    : `/reptile/log-feeding/${id}`;
  return <Redirect href={href as never} />;
}
