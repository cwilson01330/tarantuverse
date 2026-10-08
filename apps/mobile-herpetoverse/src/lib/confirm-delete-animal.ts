/**
 * Delete-an-animal confirm, shared by the edit screen and the detail
 * screen (for died / transferred records, where Edit isn't offered).
 *
 * Deleting an animal also deletes every pairing it is a parent in (FK
 * cascade), and those take their clutches and offspring records with them.
 * The old confirm only mentioned logs and photos. This asks the API what
 * else goes (GET /animals/{id}/delete-impact) and says so, with counts,
 * before the keeper confirms. If the count can't be loaded the message
 * says pairings MAY go rather than implying nothing else does.
 */
import { Alert } from 'react-native';
import {
  type DeleteImpact,
  deleteAnimal,
  deleteAnimalConfirmText,
  getDeleteImpact,
} from './animals';

export async function confirmDeleteAnimal(opts: {
  id: string;
  title: string;
  /** Living records get the "mark as died instead" nudge. */
  offerMarkDied: boolean;
  onStart: () => void;
  onDeleted: () => void;
  onError: (err: unknown) => void;
}): Promise<void> {
  let impact: DeleteImpact | null = null;
  try {
    impact = await getDeleteImpact(opts.id);
  } catch {
    impact = null;
  }
  const breeding = impact != null && impact.pairings > 0;
  const body =
    deleteAnimalConfirmText(impact) +
    (breeding && opts.offerMarkDied
      ? '\n\nIf it died, marking it as died keeps the record and its breeding history instead.'
      : '');

  Alert.alert(`Delete ${opts.title}?`, body, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        opts.onStart();
        try {
          await deleteAnimal(opts.id);
          opts.onDeleted();
        } catch (err) {
          opts.onError(err);
        }
      },
    },
  ]);
}
