import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface Thread {
  id: number;
  title: string;
  author: {
    username: string;
    display_name: string;
  };
  post_count: number;
  view_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  last_post_at: string;
}

export default function CategoryScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams();
  const { colors } = useTheme();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'pinned'>('recent');
  const [categoryName, setCategoryName] = useState('');

  useEffect(() => {
    fetchThreads(true);
  }, [sortBy]);

  const fetchThreads = async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      const token = await AsyncStorage.getItem('auth_token');
      const response = await fetch(
        `${API_URL}/api/v1/forums/categories/${category}/threads?page=${currentPage}&limit=20&sort=${sortBy}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch threads');
      }

      const data = await response.json();
      
      if (reset) {
        setThreads(data.threads);
        setPage(1);
      } else {
        setThreads([...threads, ...data.threads]);
      }
      
      setHasMore(data.has_more);
      if (data.threads.length > 0 && !categoryName) {
        // Get category name from first thread or fetch separately
        setCategoryName(String(category).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
      }
      setError('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchThreads(true);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage(page + 1);
      fetchThreads();
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  };

  if (loading && page === 1) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading threads...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && threads.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={64} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => fetchThreads(true)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header with back button and title */}
      <View style={[styles.pageHeader, { backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {categoryName || String(category).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Sort tabs */}
      <View style={[styles.sortTabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['recent', 'popular', 'pinned'] as const).map((sort) => (
          <TouchableOpacity
            key={sort}
            style={[
              styles.sortTab,
              sortBy === sort && styles.sortTabActive,
            ]}
            onPress={() => setSortBy(sort)}
          >
            <Text
              style={[
                styles.sortTabText,
                { color: colors.textSecondary },
                sortBy === sort && { color: colors.primary, fontWeight: '600' },
              ]}
            >
              {sort.charAt(0).toUpperCase() + sort.slice(1)}
            </Text>
            {sortBy === sort && (
              <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const paddingToBottom = 20;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - paddingToBottom
          ) {
            loadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {threads.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="message-text-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No threads yet in this category
            </Text>
            <TouchableOpacity
              style={[styles.newThreadButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/forums/new-thread?category=${category}`)}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#fff" />
              <Text style={styles.newThreadButtonText}>Start Discussion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {threads.map((thread) => (
              <TouchableOpacity
                key={thread.id}
                style={[styles.threadCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/forums/thread/${thread.id}`)}
              >
                <View style={styles.threadHeader}>
                  <View style={styles.threadTitleRow}>
                    {thread.is_pinned && (
                      <MaterialCommunityIcons name="pin" size={16} color={colors.primary} style={styles.pinIcon} />
                    )}
                    {thread.is_locked && (
                      <MaterialCommunityIcons name="lock" size={16} color={colors.textTertiary} style={styles.lockIcon} />
                    )}
                    <Text style={[styles.threadTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      {thread.title}
                    </Text>
                  </View>
                </View>

                <View style={styles.threadFooter}>
                  <View style={styles.threadAuthor}>
                    <MaterialCommunityIcons name="account-circle" size={16} color={colors.textTertiary} />
                    <Text style={[styles.authorName, { color: colors.textSecondary }]}>
                      {thread.author.display_name || thread.author.username}
                    </Text>
                  </View>

                  <View style={styles.threadStats}>
                    <View style={styles.stat}>
                      <MaterialCommunityIcons name="comment-multiple" size={14} color={colors.textTertiary} />
                      <Text style={[styles.statText, { color: colors.textSecondary }]}>{thread.post_count}</Text>
                    </View>
                    <View style={styles.stat}>
                      <MaterialCommunityIcons name="eye" size={14} color={colors.textTertiary} />
                      <Text style={[styles.statText, { color: colors.textSecondary }]}>{thread.view_count}</Text>
                    </View>
                    <Text style={[styles.timeText, { color: colors.textTertiary }]}>
                      {formatTimeAgo(thread.last_post_at || thread.created_at)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {hasMore && (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* FAB for new thread */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push(`/forums/new-thread?category=${category}`)}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  pageTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerSpacer: {
    width: 32,
  },
  sortTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  sortTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  sortTabActive: {
    // Active state handled by text color and indicator
  },
  sortTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 12,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 20,
  },
  newThreadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  newThreadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  threadCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  threadHeader: {
    marginBottom: 10,
  },
  threadTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pinIcon: {
    marginRight: 5,
    marginTop: 2,
  },
  lockIcon: {
    marginRight: 5,
    marginTop: 2,
  },
  threadTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  threadFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threadAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 13,
  },
  threadStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
  },
  timeText: {
    fontSize: 12,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
