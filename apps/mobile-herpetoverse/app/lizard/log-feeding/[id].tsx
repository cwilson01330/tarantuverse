/** Lizard log-feeding route — wraps the shared (taxon-agnostic) screen. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogFeedingScreen } from '../../../src/screens/LogFeedingScreen';

function Page() {
  return <LogFeedingScreen />;
}

export default withErrorBoundary(Page, 'log-feeding-lizard');
