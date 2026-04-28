/** Lizard log-weight route — wraps the shared screen with `taxon="lizard"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogWeightScreen } from '../../../src/screens/LogWeightScreen';

function Page() {
  return <LogWeightScreen taxon="lizard" />;
}

export default withErrorBoundary(Page, 'log-weight-lizard');
