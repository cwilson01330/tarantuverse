/** Lizard log-shed route — wraps the shared screen with `taxon="lizard"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogShedScreen } from '../../../src/screens/LogShedScreen';

function Page() {
  return <LogShedScreen taxon="lizard" />;
}

export default withErrorBoundary(Page, 'log-shed-lizard');
