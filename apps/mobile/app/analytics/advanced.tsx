import { Redirect } from 'expo-router';

/** The old Advanced Analytics screen is gone: its content lives on the one Analytics page. Stale deep links land there. */
export default function AdvancedAnalyticsRedirect() {
  return <Redirect href="/analytics" />;
}
