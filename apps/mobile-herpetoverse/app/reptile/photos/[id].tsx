/**
 * Reptile photo gallery route — wraps the shared, taxon-agnostic
 * ReptilePhotoGalleryScreen. ADR-003: one photo route for every taxon;
 * the legacy `/lizard/photos/[id]` route redirects here.
 */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { ReptilePhotoGalleryScreen } from '../../../src/screens/ReptilePhotoGalleryScreen';

function Page() {
  return <ReptilePhotoGalleryScreen />;
}

export default withErrorBoundary(Page, 'reptile-photos');
