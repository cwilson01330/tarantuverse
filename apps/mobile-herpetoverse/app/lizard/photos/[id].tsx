/** Lizard photo gallery route — wraps the shared screen with `taxon="lizard"`. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { ReptilePhotoGalleryScreen } from '../../../src/screens/ReptilePhotoGalleryScreen';

function Page() {
  return <ReptilePhotoGalleryScreen taxon="lizard" />;
}

export default withErrorBoundary(Page, 'reptile-photos-lizard');
