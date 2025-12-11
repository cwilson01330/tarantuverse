import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../../src/contexts/ThemeContext';
import ReportModal from '../../../../src/components/ReportModal';

interface Author {
  id: string;  // UUID
  username: string;
  display_name?: string;
  avatar_url?: string;
}

interface Post {
  id: number;
  thread_id: number;
  author_id: string;
  author: Author;
  content: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  edited_at?: string;
}

interface Thread {
  id: number;
  title: string;
  slug: string;
  author_id: string;
  author: Author;
  category: {
    id: number;
    name: string;
    slug: string;
  };
  created_at: string;
  is_pinned: boolean;
  is_locked: boolean;
  post_count: number;
  view_count: number;
  first_post?: Post;
}

export default function ThreadDetailScreen() {
  const { slug, threadId } = useLocalSearchParams<{ slug: string; threadId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [thread, setThread] = useState<Thread | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingPost, setReportingPost] = useState<Post | null>(null);

  const fetchThreadData = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

      // Fetch thread details
      const threadResponse = await fetch(`${API_URL}/api/v1/forums/threads/${threadId}`);
      if (!threadResponse.ok) throw new Error('Failed to fetch thread');
      const threadData = await threadResponse.json();
      setThread(threadData);

      // Fetch posts in thread (API returns paginated response)
      const postsResponse = await fetch(`${API_URL}/api/v1/forums/threads/${threadId}/posts?page=1&limit=100`);
      if (!postsResponse.ok) throw new Error('Failed to fetch posts');
      const postsData = await postsResponse.json();

      // API returns: {posts: Post[], total, page, limit, has_more}
      // If thread has first_post, prepend it to avoid duplication
      if (threadData.first_post && postsData.posts) {
        // Filter out first_post if it's in the posts array
        const otherPosts = postsData.posts.filter((p: Post) => p.id !== threadData.first_post.id);
        setPosts([threadData.first_post, ...otherPosts]);
      } else if (postsData.posts) {
        setPosts(postsData.posts);
      }
    } catch (error) {
      console.error('Error fetching thread data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchThreadData();
  }, [threadId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchThreadData();
  };

  const handleReply = async () => {
    if (!replyText.trim() || isReplying) return;

    setIsReplying(true);
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/forums/threads/${threadId}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add authentication token
        },
        body: JSON.stringify({ content: replyText }),
      });

      if (!response.ok) throw new Error('Failed to post reply');

      setReplyText('');
      fetchThreadData(); // Refresh to show new post
    } catch (error) {
      console.error('Error posting reply:', error);
      // TODO: Show error message to user
    } finally {
      setIsReplying(false);
    }
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
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading thread...</Text>
        </View>
      </View>
    );
  }

  if (!thread) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>Thread not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
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
          <View style={styles.headerTitleRow}>
            {thread.is_pinned && <MaterialCommunityIcons name="pin" size={20} color="white" />}
            <Text style={styles.headerTitle} numberOfLines={2}>
              {thread.title}
            </Text>
            {thread.is_locked && <MaterialCommunityIcons name="lock" size={20} color="white" />}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaText}>
              {thread.category.name} • {thread.author.username}
            </Text>
          </View>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <MaterialCommunityIcons name="message" size={16} color="white" />
            <Text style={styles.headerStatText}>{thread.post_count}</Text>
          </View>
          <View style={styles.headerStat}>
            <MaterialCommunityIcons name="eye" size={16} color="white" />
            <Text style={styles.headerStatText}>{thread.view_count}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Posts List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Posts Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Be the first to reply to this thread!
            </Text>
          </View>
        ) : (
          <View style={styles.postList}>
            {posts.map((post, index) => (
              <View
                key={post.id}
                style={[
                  styles.postCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  index === 0 && styles.firstPost,
                ]}
              >
                <View style={styles.postHeader}>
                  <TouchableOpacity
                    style={styles.postAuthor}
                    onPress={() => router.push(`/community/${post.author.username}`)}
                  >
                    <View style={[styles.authorAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.authorAvatarText}>
                        {(post.author.display_name || post.author.username).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.postAuthorInfo}>
                      <Text style={[styles.postAuthorName, { color: colors.primary }]} numberOfLines={1}>
                        {post.author.display_name || post.author.username}
                      </Text>
                      <Text style={[styles.postDate, { color: colors.textTertiary }]} numberOfLines={1}>
                        @{post.author.username} • {formatDate(post.created_at)}
                        {post.is_edited && ' (edited)'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.postActions}>
                    {index === 0 && (
                      <View style={[styles.opBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.opBadgeText}>OP</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setReportingPost(post);
                        setReportModalVisible(true);
                      }}
                      style={styles.reportButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialCommunityIcons name="flag" size={22} color="#f59e0b" />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[styles.postContent, { color: colors.textPrimary }]}>{post.content}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Reply Input */}
      {!thread.is_locked && (
        <View style={[styles.replyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.replyInput, { color: colors.textPrimary }]}
            placeholder="Write a reply..."
            placeholderTextColor={colors.textTertiary}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            onPress={handleReply}
            disabled={!replyText.trim() || isReplying}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={replyText.trim() ? ['#0066ff', '#ff0099'] : [colors.border, colors.border]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButton}
            >
              {isReplying ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <MaterialCommunityIcons
                  name="send"
                  size={20}
                  color={replyText.trim() ? 'white' : colors.textTertiary}
                />
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {thread.is_locked && (
        <View style={[styles.lockedBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="lock" size={16} color={colors.textSecondary} />
          <Text style={[styles.lockedText, { color: colors.textSecondary }]}>This thread is locked</Text>
        </View>
      )}

      {/* Report Modal */}
      {reportingPost && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            setReportingPost(null);
          }}
          reportType="forum_post"
          contentId={reportingPost.id.toString()}
          reportedUserId={reportingPost.author.id.toString()}
        />
      )}
    </KeyboardAvoidingView>
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
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
    lineHeight: 26,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerMetaText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
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
  postList: {
    gap: 12,
  },
  postCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  firstPost: {
    borderWidth: 2,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0, // Allow shrinking
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0, // Prevent shrinking
  },
  reportButton: {
    padding: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  postAuthorInfo: {
    flex: 1,
    minWidth: 0, // Allow text truncation
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  postDate: {
    fontSize: 12,
  },
  opBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  opBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  replyContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
    alignItems: 'flex-end',
  },
  replyInput: {
    flex: 1,
    maxHeight: 100,
    fontSize: 15,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  lockedText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
