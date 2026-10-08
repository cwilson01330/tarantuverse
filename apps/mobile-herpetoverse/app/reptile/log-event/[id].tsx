/** Log / edit a health or lifecycle event — wraps the shared screen. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { LogEventScreen } from '../../../src/screens/LogEventScreen';

function Page() {
  return <LogEventScreen />;
}

export default withErrorBoundary(Page, 'log-event');
