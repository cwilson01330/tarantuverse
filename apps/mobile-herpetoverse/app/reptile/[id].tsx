/**
 * Reptile detail route — wraps the shared, taxon-agnostic
 * AnimalDetailScreen.
 *
 * ADR-003 follow-through: the snake- and lizard-shaped detail screens
 * collapsed into one. This is the canonical detail route for every
 * taxon; the legacy `/lizard/[id]` route redirects here.
 */
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { AnimalDetailScreen } from '../../src/screens/AnimalDetailScreen';

function Page() {
  return <AnimalDetailScreen />;
}

export default withErrorBoundary(Page, 'reptile-detail');
