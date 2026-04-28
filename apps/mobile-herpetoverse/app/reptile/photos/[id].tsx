/** Snake photo gallery route — wraps the shared screen with `taxon="snake"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { ReptilePhotoGalleryScreen } from '../../../src/screens/ReptilePhotoGalleryScreen';

function Page() {
  return <ReptilePhotoGalleryScreen taxon="snake" />;
}

export default withErrorBoundary(Page, 'reptile-photos-snake');
