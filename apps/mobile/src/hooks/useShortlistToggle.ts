/**
 * Bookmark state for a single care sheet.
 *
 * Both care sheets use this so the optimistic-update and rollback behaviour
 * is identical, and neither has to remember that a signed-out viewer must
 * not see a bookmark button at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../contexts/AuthContext';
import { addToShortlist, listShortlistIds, removeFromShortlist } from '../lib/shortlist';

export function useShortlistToggle(speciesId: string | undefined) {
  const { user } = useAuth();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!speciesId || !user) {
      setIsBookmarked(false);
      return;
    }
    (async () => {
      try {
        const ids = await listShortlistIds();
        if (!cancelled) setIsBookmarked(ids.includes(speciesId));
      } catch {
        // Non-fatal. An un-lit bookmark is a better failure than blocking
        // the care sheet, and the toggle is idempotent server-side anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [speciesId, user]);

  const toggle = useCallback(async () => {
    if (!speciesId || busy) return;
    const next = !isBookmarked;
    setBusy(true);
    setIsBookmarked(next); // optimistic
    try {
      if (next) await addToShortlist(speciesId);
      else await removeFromShortlist(speciesId);
    } catch {
      setIsBookmarked(!next); // roll back
      Alert.alert(
        next ? 'Could not save' : 'Could not remove',
        'Something went wrong updating your shortlist. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [speciesId, isBookmarked, busy]);

  return {
    isBookmarked,
    bookmarkBusy: busy,
    // Undefined for signed-out viewers, which hides the button rather than
    // showing one that 401s on tap.
    toggle: user ? toggle : undefined,
  };
}
