/** Snake log-weight route — wraps the shared screen with `taxon="snake"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogWeightScreen } from '../../../src/screens/LogWeightScreen';

function Page() {
  return <LogWeightScreen taxon="snake" />;
}

export default withErrorBoundary(Page, 'log-weight-snake');
