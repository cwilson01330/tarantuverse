/** Snake edit route — wraps the shared (taxon-agnostic) screen. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { EditReptileScreen } from '../../../src/screens/EditReptileScreen';

function Page() {
  return <EditReptileScreen />;
}

export default withErrorBoundary(Page, 'edit-reptile-snake');
