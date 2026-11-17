import { Redirect } from 'expo-router';

// Community left the bottom bar (Feeding took its slot) and is now a stack
// screen opened from the You tab. Old links to this route land there.
export default function CommunityRedirect() {
  return <Redirect href="/community-feed" />;
}
