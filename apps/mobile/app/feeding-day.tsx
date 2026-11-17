import { Redirect } from 'expo-router';

// Feeding Day is now the Feeding tab. In-app callers go straight to the tab with
// router.navigate('/(tabs)/feeding'); this stub exists only for OLD external
// links (bookmarks, old notifications) that still open '/feeding-day'. (The tab
// file is `feeding`, not `feeding-day`, so the two routes never share a URL.)
export default function FeedingDayRedirect() {
  return <Redirect href="/(tabs)/feeding" />;
}
