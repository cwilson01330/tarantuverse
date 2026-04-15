import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const POLL_INTERVAL_MS = 30_000;

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const fetchCount = useCallback(async () => {
    if (!user) return;
    try {
      const response = await apiClient.get('/messages/direct/unread-count');
      setUnreadCount(response.data?.unread_count ?? 0);
    } catch {
      // Silent — never disrupt the UI for a badge count failure
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      // Resume polling when the app comes back to the foreground
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        fetchCount();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
        }
      }
      // Pause polling when backgrounded to save battery
      if (nextState.match(/inactive|background/) && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      appStateRef.current = nextState;
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [user, fetchCount]);

  return { unreadCount, refresh: fetchCount };
}
