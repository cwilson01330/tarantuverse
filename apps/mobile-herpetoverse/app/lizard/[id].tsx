/**
 * Legacy lizard detail route — redirects to the unified `/reptile/[id]`.
 *
 * ADR-003 collapsed the per-taxon route trees into one. The lizard
 * detail screen is gone; this shim keeps old deep links and any saved
 * navigation state working.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/reptile/${id}` as never} />;
}
