/**
 * Legacy lizard log-shed route — redirects to `/reptile/log-shed/[id]`,
 * forwarding the optional `shedId` edit param. ADR-003 route collapse.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id, shedId } = useLocalSearchParams<{
    id: string;
    shedId?: string;
  }>();
  const href = shedId
    ? `/reptile/log-shed/${id}?shedId=${shedId}`
    : `/reptile/log-shed/${id}`;
  return <Redirect href={href as never} />;
}
