/** Snake QR upload session route. */
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { QRUploadSessionScreen } from '../../../src/screens/QRUploadSessionScreen';

function Page() {
  return <QRUploadSessionScreen taxon="snake" />;
}

export default withErrorBoundary(Page, 'qr-upload-snake');
