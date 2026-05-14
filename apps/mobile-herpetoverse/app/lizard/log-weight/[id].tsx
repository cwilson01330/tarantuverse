/**
 * Legacy lizard log-weight route — redirects to
 * `/reptile/log-weight/[id]`, forwarding the optional `weightId` edit
 * param. ADR-003 route collapse.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id, weightId } = useLocalSearchParams<{
    id: string;
    weightId?: string;
  }>();
  const href = weightId
    ? `/reptile/log-weight/${id}?weightId=${weightId}`
    : `/reptile/log-weight/${id}`;
  return <Redirect href={href as never} />;
}
