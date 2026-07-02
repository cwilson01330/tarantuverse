import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../src/components/AppHeader';
import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  deeplink: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

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
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.get<Notification[]>('/notifications/?limit=40');
      setItems(res.data ?? []);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const hasUnread = items.some((n) => !n.is_read);

  const markAllRead = async () => {
    if (markingAll || !hasUnread) return;
    setMarkingAll(true);
    // Optimistic
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await apiClient.post('/notifications/read-all');
      await fetchNotifications();
    } catch {
      await fetchNotifications();
    } finally {
      setMarkingAll(false);
    }
  };

  const dismissNotification = async (id: string) => {
    // Optimistic remove
    const prev = items;
    setItems((cur) => cur.filter((n) => n.id !== id));
    try {
      await apiClient.delete(`/notifications/${id}`);
    } catch {
      // Restore by refetching on error
      setItems(prev);
      await fetchNotifications();
    }
  };

  const clearAll = () => {
    if (clearingAll || items.length === 0) return;
    Alert.alert('Clear all notifications?', 'This will remove all notifications. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: async () => {
          setClearingAll(true);
          // Optimistic
          setItems([]);
          try {
            await apiClient.delete('/notifications/');
            await fetchNotifications();
          } catch {
            await fetchNotifications();
          } finally {
            setClearingAll(false);
          }
        },
      },
    ]);
  };

  const openNotification = async (n: Notification) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, is_read: true } : it)));
      apiClient.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    const data = n.data ?? {};
    switch (n.type) {
      case 'direct_message':
        if (data.sender) router.push(`/messages/${data.sender}`);
        break;
      case 'forum_reply':
        if (data.thread_id) router.push(`/community/forums/thread/${data.thread_id}`);
        break;
      case 'new_follower':
        if (data.follower) router.push(`/community/${data.follower}`);
        break;
      default:
        break;
    }
  };

  const backAction = (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityLabel="Back"
      accessibilityRole="button"
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const hasAny = items.length > 0;

  const headerActions =
    hasUnread || hasAny ? (
      <View style={styles.headerActions}>
        {hasUnread ? (
          <TouchableOpacity
            onPress={markAllRead}
            disabled={markingAll}
            accessibilityLabel="Mark all as read"
            accessibilityRole="button"
            style={{ paddingLeft: 4 }}
          >
            {markingAll ? (
              <ActivityIndicator color={iconColor} />
            ) : (
              <MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={24} color={iconColor} />
            )}
          </TouchableOpacity>
        ) : null}
        {hasAny ? (
          <TouchableOpacity
            onPress={clearAll}
            disabled={clearingAll}
            accessibilityLabel="Clear all notifications"
            accessibilityRole="button"
            style={{ paddingLeft: 4 }}
          >
            {clearingAll ? (
              <ActivityIndicator color={iconColor} />
            ) : (
              <MaterialCommunityIcons name="trash-can-outline" size={24} color={iconColor} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    ) : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Notifications" leftAction={backAction} rightAction={headerActions} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchNotifications();
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
              { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: colors.error ?? '#ef4444', borderRadius: layout.radius.md },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                fetchNotifications();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading notifications"
            >
              <Text style={[styles.retryText, { color: colors.error ?? '#b91c1c' }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No notifications yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              You'll see messages, forum replies, and follows here.
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
                  backgroundColor: n.is_read ? colors.surface : `${colors.primary}14`,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => openNotification(n)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}${n.is_read ? '' : ', unread'}`}
                accessibilityHint={n.body ?? undefined}
                style={styles.rowMain}
              >
                <View style={styles.dotColumn}>
                  {!n.is_read ? (
                    <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                  ) : (
                    <View style={styles.dotSpacer} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {n.title}
                  </Text>
                  {n.body ? (
                    <Text style={[styles.rowBody, { color: colors.textSecondary }]} numberOfLines={2}>
                      {n.body}
                    </Text>
                  ) : null}
                  <Text style={[styles.rowTime, { color: colors.textTertiary }]}>
                    {relativeTime(n.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => dismissNotification(n.id)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.dismissBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
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
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
