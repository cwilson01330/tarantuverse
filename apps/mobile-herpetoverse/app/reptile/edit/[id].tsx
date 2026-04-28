/** Snake edit route — wraps the shared screen with `taxon="snake"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { EditReptileScreen } from '../../../src/screens/EditReptileScreen';

function Page() {
  return <EditReptileScreen taxon="snake" />;
}

export default withErrorBoundary(Page, 'edit-reptile-snake');
