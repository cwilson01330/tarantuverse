import { Stack } from 'expo-router';

/**
 * Both messages screens render their OWN in-screen header:
 *   - index.tsx      → <AppHeader />
 *   - [username].tsx → custom compact gradient header
 *
 * So this nested stack must NOT render a native header at all. Setting
 * headerShown:false at the Stack (screenOptions) level is the reliable way to
 * do that — per-screen `headerShown:false` was leaving the native gradient
 * header rendered underneath the in-screen headers, producing a doubled-up
 * "huge" header and throwing off keyboard positioning on Android.
 */
export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
