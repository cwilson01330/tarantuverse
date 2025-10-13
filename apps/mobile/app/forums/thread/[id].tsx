import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../src/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface Post {
  id: number;
  content: string;
  author: {
    username: string;
    display_name: string;
  };
  created_at: string;
  is_edited: boolean;
  edited_at?: string;
}

interface ThreadDetail {
  id: number;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  post_count: number;
  view_count: number;
}

export default function ThreadDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchThread();
    fetchPosts(true);
  }, []);

  const fetchThread = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/v1/forums/threads/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error('Failed to fetch thread');
      }

      const data = await response.json();
      setThread(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/v1/forums/threads/${id}/posts?page=${currentPage}&limit=20`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }

      const data = await response.json();
      
      if (reset) {
        setPosts(data.posts);
        setPage(1);
      } else {
        setPosts([...posts, ...data.posts]);
      }
      
      setHasMore(data.has_more);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setPostsLoading(false);
    }
  };

  const loadMorePosts = () => {
    if (!postsLoading && hasMore) {
      setPage(page + 1);
      setPostsLoading(true);
      fetchPosts();
    }
  };

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) {
      Alert.alert('Error', 'Reply cannot be empty');
      return;
    }

    try {
      setSubmitting(true);
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        Alert.alert('Error', 'You must be logged in to reply');
        return;
      }

      const response = await fetch(`${API_URL}/api/v1/forums/threads/${id}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: replyContent }),
      });

      if (!response.ok) {
        throw new Error('Failed to post reply');
      }

      // Reset form and refresh posts
      setReplyContent('');
      fetchThread();
      fetchPosts(true);
      Alert.alert('Success', 'Reply posted successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to post reply');
    } finally {
      setSubmitting(false);
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading thread...
          </Text>
        </View>
      </View>
    );
  }

  if (error || !thread) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={64} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error || 'Thread not found'}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={fetchThread}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {/* Thread Header */}
      <View style={[styles.threadHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.threadTitleRow}>
          {thread.is_pinned && (
            <MaterialCommunityIcons name="pin" size={20} color={colors.primary} style={styles.icon} />
          )}
          {thread.is_locked && (
            <MaterialCommunityIcons name="lock" size={20} color={colors.textTertiary} style={styles.icon} />
          )}
          <Text style={[styles.threadTitle, { color: colors.textPrimary }]}>{thread.title}</Text>
        </View>
        <View style={styles.threadMeta}>
          <View style={styles.metaStat}>
            <MaterialCommunityIcons name="comment-multiple" size={16} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{thread.post_count} posts</Text>
          </View>
          <View style={styles.metaStat}>
            <MaterialCommunityIcons name="eye" size={16} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{thread.view_count} views</Text>
          </View>
        </View>
      </View>

      {/* Posts List */}
      <ScrollView
        style={styles.postsContainer}
        contentContainerStyle={styles.postsContent}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const paddingToBottom = 20;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - paddingToBottom
          ) {
            loadMorePosts();
          }
        }}
        scrollEventThrottle={400}
      >
        {posts.map((post, index) => (
          <View key={post.id} style={[styles.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.postHeader}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {getInitials(post.author.display_name || post.author.username)}
                </Text>
              </View>
              <View style={styles.authorInfo}>
                <View style={styles.authorNameRow}>
                  <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                    {post.author.display_name || post.author.username}
                  </Text>
                  {index === 0 && (
                    <View style={[styles.opBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.opBadgeText}>OP</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.postTime, { color: colors.textTertiary }]}>
                  {formatTimeAgo(post.created_at)}
                  {post.is_edited && ' (edited)'}
                </Text>
              </View>
            </View>
            <Text style={[styles.postContent, { color: colors.textSecondary }]}>{post.content}</Text>
          </View>
        ))}

        {hasMore && postsLoading && (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </ScrollView>

      {/* Reply Form */}
      {!thread.is_locked && (
        <View style={[styles.replyForm, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.replyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Write a reply..."
            placeholderTextColor={colors.textTertiary}
            value={replyContent}
            onChangeText={setReplyContent}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: colors.primary },
              (!replyContent.trim() || submitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmitReply}
            disabled={!replyContent.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {thread.is_locked && (
        <View style={[styles.lockedBanner, { backgroundColor: colors.surfaceElevated, borderTopColor: colors.border }]}>
          <MaterialCommunityIcons name="lock" size={20} color={colors.textTertiary} />
          <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
            This thread is locked. No new replies can be added.
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  threadHeader: {
    padding: 16,
    borderBottomWidth: 1,
  },
  threadTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  icon: {
    marginRight: 8,
    marginTop: 2,
  },
  threadTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  threadMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  postsContainer: {
    flex: 1,
  },
  postsContent: {
    padding: 16,
  },
  postCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  authorInfo: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
  },
  opBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  opBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  postTime: {
    fontSize: 12,
    marginTop: 2,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  replyForm: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 100,
  },
  submitButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  lockedText: {
    flex: 1,
    fontSize: 14,
  },
});
