/** Lizard log-shed route — wraps the shared (taxon-agnostic) screen. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogShedScreen } from '../../../src/screens/LogShedScreen';

function Page() {
  return <LogShedScreen />;
}

export default withErrorBoundary(Page, 'log-shed-lizard');
