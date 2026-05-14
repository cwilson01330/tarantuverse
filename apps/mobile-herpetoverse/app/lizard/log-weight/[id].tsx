/** Lizard log-weight route — wraps the shared (taxon-agnostic) screen. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogWeightScreen } from '../../../src/screens/LogWeightScreen';

function Page() {
  return <LogWeightScreen />;
}

export default withErrorBoundary(Page, 'log-weight-lizard');
