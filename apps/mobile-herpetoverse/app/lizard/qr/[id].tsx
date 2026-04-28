/** Lizard QR upload session route. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { QRUploadSessionScreen } from '../../../src/screens/QRUploadSessionScreen';

function Page() {
  return <QRUploadSessionScreen taxon="lizard" />;
}

export default withErrorBoundary(Page, 'qr-upload-lizard');
