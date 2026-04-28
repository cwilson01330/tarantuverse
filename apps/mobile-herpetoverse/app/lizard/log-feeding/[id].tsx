/** Lizard log-feeding route — wraps the shared screen with `taxon="lizard"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogFeedingScreen } from '../../../src/screens/LogFeedingScreen';

function Page() {
  return <LogFeedingScreen taxon="lizard" />;
}

export default withErrorBoundary(Page, 'log-feeding-lizard');
