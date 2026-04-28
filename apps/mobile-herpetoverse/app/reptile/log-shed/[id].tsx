/** Snake log-shed route — wraps the shared screen with `taxon="snake"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogShedScreen } from '../../../src/screens/LogShedScreen';

function Page() {
  return <LogShedScreen taxon="snake" />;
}

export default withErrorBoundary(Page, 'log-shed-snake');
