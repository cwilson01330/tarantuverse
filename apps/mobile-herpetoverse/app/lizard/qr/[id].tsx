/**
 * Legacy lizard QR upload session route — redirects to
 * `/reptile/qr/[id]`. ADR-003 route collapse.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/reptile/qr/${id}` as never} />;
}
