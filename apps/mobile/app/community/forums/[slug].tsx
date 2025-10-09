import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../src/contexts/ThemeContext';

interface Thread {
  id: number;
  title: string;
  slug: string;
  author: {
    id: number;
    username: string;
  };
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  is_locked: boolean;
  post_count: number;
  view_count: number;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  thread_count: number;
  post_count: number;
}

export default function ForumCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCategoryData = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      
      // Fetch category details
      const categoryResponse = await fetch(`${API_URL}/api/v1/forums/categories/${slug}`);
      if (!categoryResponse.ok) throw new Error('Failed to fetch category');
      const categoryData = await categoryResponse.json();
      setCategory(categoryData);

      // Fetch threads in category
      const threadsResponse = await fetch(`${API_URL}/api/v1/forums/categories/${slug}/threads`);
      if (!threadsResponse.ok) throw new Error('Failed to fetch threads');
      const threadsData = await threadsResponse.json();
      setThreads(threadsData);
    } catch (error) {
      console.error('Error fetching category data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCategoryData();
  }, [slug]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCategoryData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading threads...</Text>
        </View>
      </View>
    );
  }

  if (!category) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>Category not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0066ff', '#ff0099']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          {category.icon && <Text style={styles.headerIcon}>{category.icon}</Text>}
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{category.name}</Text>
            {category.description && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {category.description}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <MaterialCommunityIcons name="message-text" size={16} color="white" />
            <Text style={styles.headerStatText}>{category.thread_count}</Text>
          </View>
          <View style={styles.headerStat}>
            <MaterialCommunityIcons name="chat" size={16} color="white" />
            <Text style={styles.headerStatText}>{category.post_count}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Thread List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {threads.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Threads Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Be the first to start a discussion in this category!
            </Text>
          </View>
        ) : (
          <View style={styles.threadList}>
            {threads.map((thread) => (
              <TouchableOpacity
                key={thread.id}
                style={[styles.threadCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/community/forums/${slug}/${thread.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.threadHeader}>
                  <View style={styles.threadTitleRow}>
                    {thread.is_pinned && (
                      <MaterialCommunityIcons name="pin" size={16} color={colors.primary} />
                    )}
                    <Text
                      style={[
                        styles.threadTitle,
                        { color: colors.textPrimary },
                        thread.is_pinned && styles.threadTitlePinned,
                      ]}
                      numberOfLines={2}
                    >
                      {thread.title}
                    </Text>
                    {thread.is_locked && (
                      <MaterialCommunityIcons name="lock" size={16} color={colors.textTertiary} />
                    )}
                  </View>
                </View>
                <View style={styles.threadMeta}>
                  <View style={styles.threadAuthor}>
                    <MaterialCommunityIcons name="account" size={14} color={colors.textTertiary} />
                    <Text style={[styles.threadAuthorText, { color: colors.textSecondary }]}>
                      {thread.author.username}
                    </Text>
                  </View>
                  <Text style={[styles.threadDate, { color: colors.textTertiary }]}>
                    {formatDate(thread.updated_at)}
                  </Text>
                </View>
                <View style={styles.threadStats}>
                  <View style={styles.threadStat}>
                    <MaterialCommunityIcons name="message" size={14} color={colors.primary} />
                    <Text style={[styles.threadStatText, { color: colors.textTertiary }]}>
                      {thread.post_count} replies
                    </Text>
                  </View>
                  <View style={styles.threadStat}>
                    <MaterialCommunityIcons name="eye" size={14} color={colors.primary} />
                    <Text style={[styles.threadStatText, { color: colors.textTertiary }]}>
                      {thread.view_count} views
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New Thread FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          // TODO: Navigate to create thread screen
          console.log('Create new thread');
        }}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#0066ff', '#ff0099']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <MaterialCommunityIcons name="plus" size={28} color="white" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerBackButton: {
    marginBottom: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerIcon: {
    fontSize: 32,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  headerStats: {
    flexDirection: 'row',
    gap: 16,
  },
  headerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerStatText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  threadList: {
    gap: 12,
  },
  threadCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  threadHeader: {
    marginBottom: 8,
  },
  threadTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  threadTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    lineHeight: 22,
  },
  threadTitlePinned: {
    fontWeight: '800',
  },
  threadMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  threadAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  threadAuthorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  threadDate: {
    fontSize: 12,
  },
  threadStats: {
    flexDirection: 'row',
    gap: 16,
  },
  threadStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  threadStatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
