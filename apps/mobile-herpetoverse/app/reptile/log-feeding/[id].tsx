/** Snake log-feeding route — wraps the shared screen with `taxon="snake"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogFeedingScreen } from '../../../src/screens/LogFeedingScreen';

function Page() {
  return <LogFeedingScreen taxon="snake" />;
}

export default withErrorBoundary(Page, 'log-feeding-snake');
