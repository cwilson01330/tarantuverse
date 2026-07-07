/**
 * Notification center — Herpetoverse mobile.
 *
 * Mirrors the proven Tarantuverse mobile screen (apps/mobile/app/
 * notification-center.tsx) on the shared, animal-aware backend.
 *
 * List of notifications (newest first): tap a row to mark it read and
 * follow its deeplink (if any); per-row ✕ to dismiss; header actions to
 * mark all read / clear all (with a confirm). Empty, loading, and
 * loadError + retry states covered.
 *
 * apiClient's baseURL already includes /api/v1, so the lib helpers start
 * at /notifications. Styling reads ThemeContext colors — this app is
 * dark-first.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import {
  clearAllNotifications,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationResponse,
} from '../src/lib/notifications';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

export default function NotificationCenterScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const { isLoading: authLoading, user } = useAuth();

  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications(30);
      setItems(data);
      setLoadError('');
    } catch (e: any) {
      // A 401 means the session expired; the api interceptor handles the
      // logout redirect, so we stay quiet rather than showing an error.
      if (e?.response?.status === 401) return;
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to load notifications',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Gate the fetch on auth resolving so we don't fire an unauthenticated
  // request during the initial hydration flash.
  useFocusEffect(
    useCallback(() => {
      if (authLoading || !user) return;
      load();
    }, [authLoading, user, load]),
  );

  const hasAny = items.length > 0;
  const hasUnread = items.some((n) => !n.is_read);

  const markAllRead = async () => {
    if (markingAll || !hasUnread) return;
    setMarkingAll(true);
    // Optimistic
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsRead();
      await load();
    } catch {
      await load();
    } finally {
      setMarkingAll(false);
    }
  };

  const dismiss = async (id: string) => {
    const prev = items;
    // Optimistic remove
    setItems((cur) => cur.filter((n) => n.id !== id));
    try {
      await deleteNotification(id);
    } catch {
      // Restore on failure
      setItems(prev);
      await load();
    }
  };

  const clearAll = () => {
    if (clearingAll || !hasAny) return;
    Alert.alert(
      'Clear all notifications?',
      'This will remove all notifications. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            setClearingAll(true);
            // Optimistic
            setItems([]);
            try {
              await clearAllNotifications();
              await load();
            } catch {
              await load();
            } finally {
              setClearingAll(false);
            }
          },
        },
      ],
    );
  };

  const openNotification = (n: NotificationResponse) => {
    if (!n.is_read) {
      setItems((prev) =>
        prev.map((it) => (it.id === n.id ? { ...it, is_read: true } : it)),
      );
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.deeplink) {
      router.push(n.deeplink as never);
    }
  };

  const headerActions =
    hasAny || hasUnread ? (
      <View style={styles.headerActions}>
        {hasUnread ? (
          <TouchableOpacity
            onPress={markAllRead}
            disabled={markingAll}
            hitSlop={8}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
          >
            {markingAll ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <MaterialCommunityIcons
                name="checkbox-multiple-marked-outline"
                size={22}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        ) : null}
        {hasAny ? (
          <TouchableOpacity
            onPress={clearAll}
            disabled={clearingAll}
            hitSlop={8}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Clear all notifications"
          >
            {clearingAll ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={22}
                color={colors.danger}
              />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    ) : undefined;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Notifications"
        leftAction={<HeaderBackButton />}
        rightAction={headerActions}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {loadError !== '' && !loading && (
          <View
            style={[
              styles.errorCard,
              { borderColor: colors.danger, borderRadius: layout.radius.md },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                load();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading notifications"
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && items.length === 0 && (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons
              name="bell-outline"
              size={52}
              color={colors.textTertiary}
              style={{ marginBottom: 12 }}
            />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No notifications yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Feeding reminders, breeding updates, and community activity will
              show up here.
            </Text>
          </View>
        )}

        {!loading &&
          items.map((n) => (
            <View
              key={n.id}
              style={[
                styles.row,
                {
                  backgroundColor: n.is_read ? colors.surface : colors.surfaceRaised,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => openNotification(n)}
                activeOpacity={0.7}
                style={styles.rowMain}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}${n.is_read ? '' : ', unread'}`}
                accessibilityHint={n.body ?? undefined}
              >
                <View style={styles.dotColumn}>
                  {!n.is_read ? (
                    <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                  ) : (
                    <View style={styles.dotSpacer} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.rowTitle, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {n.title}
                  </Text>
                  {n.body ? (
                    <Text
                      style={[styles.rowBody, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {n.body}
                    </Text>
                  ) : null}
                  <Text style={[styles.rowTime, { color: colors.textTertiary }]}>
                    {relativeTime(n.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => dismiss(n.id)}
                hitSlop={8}
                style={styles.dismissBtn}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingTop: 12 },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  errorCard: {
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  errorText: { flex: 1, fontSize: 14 },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: {
    minWidth: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    marginBottom: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    minWidth: 0,
  },
  dismissBtn: { padding: 12, alignSelf: 'flex-start' },
  dotColumn: { width: 10, paddingTop: 5, alignItems: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  dotSpacer: { width: 8, height: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowBody: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowTime: { fontSize: 11, marginTop: 6 },
});
