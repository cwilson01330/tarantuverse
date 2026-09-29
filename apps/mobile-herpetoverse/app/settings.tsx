/**
 * /settings — kept only as a redirect.
 *
 * Everything that lived here (profile, subscription, notifications, sitter
 * links, data export, support & legal, sign out, delete account) moved into
 * the "You" tab, matching Tarantuverse. This route stays so notifications,
 * older builds' links and any stray router.push('/settings') still land
 * somewhere real instead of a missing screen.
 */
import { Redirect } from 'expo-router';

export default function SettingsRedirect() {
  return <Redirect href={'/(tabs)/profile' as never} />;
}
