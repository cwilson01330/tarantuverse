/** Lizard edit route — wraps the shared screen with `taxon="lizard"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { EditReptileScreen } from '../../../src/screens/EditReptileScreen';

function Page() {
  return <EditReptileScreen taxon="lizard" />;
}

export default withErrorBoundary(Page, 'edit-reptile-lizard');
