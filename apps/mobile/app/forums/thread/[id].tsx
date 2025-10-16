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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../src/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface Post {
  id: number;
  content: string;
  author: {
    id: string;
    username: string;
    display_name: string;
  };
  author_id: string;
  created_at: string;
  is_edited: boolean;
  edited_at?: string;
}

interface ThreadDetail {
  id: number;
  title: string;
  author_id: string;
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
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingThread, setEditingThread] = useState(false);
  const [editThreadTitle, setEditThreadTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchCurrentUser();
    fetchThread();
    fetchPosts(true);
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      console.log('[Thread] Fetching current user, token exists:', !!token);
      if (!token) return;

      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('[Thread] Auth response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[Thread] Current user ID:', data.id);
        setCurrentUserId(data.id);
      }
    } catch (err) {
      console.error('Failed to fetch current user:', err);
    }
  };

  const fetchThread = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
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
      const token = await AsyncStorage.getItem('auth_token');
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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchCurrentUser();
      await fetchThread();
      await fetchPosts(true);
    } finally {
      setRefreshing(false);
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
      const token = await AsyncStorage.getItem('auth_token');

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

  const handleEditPost = async (postId: number) => {
    if (!editContent.trim()) {
      Alert.alert('Error', 'Post cannot be empty');
      return;
    }

    try {
      setSubmitting(true);
      const token = await AsyncStorage.getItem('auth_token');

      if (!token) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const response = await fetch(`${API_URL}/api/v1/forums/posts/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: editContent }),
      });

      if (!response.ok) {
        throw new Error('Failed to update post');
      }

      const updatedPost = await response.json();

      // Update post in state
      setPosts(posts.map(p => p.id === postId ? { ...p, content: updatedPost.content, is_edited: true, edited_at: updatedPost.edited_at } : p));
      
      setEditingPostId(null);
      setEditContent('');
      Alert.alert('Success', 'Post updated successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: number, index: number) => {
    if (index === 0) {
      Alert.alert('Error', 'Cannot delete the first post. Delete the thread instead.');
      return;
    }

    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('auth_token');

              if (!token) {
                Alert.alert('Error', 'You must be logged in');
                return;
              }

              const response = await fetch(`${API_URL}/api/v1/forums/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (!response.ok) {
                throw new Error('Failed to delete post');
              }

              // Remove post from state
              setPosts(posts.filter(p => p.id !== postId));
              fetchThread(); // Refresh to update post count
              Alert.alert('Success', 'Post deleted successfully');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const startEdit = (post: Post) => {
    setEditingPostId(post.id);
    setEditContent(post.content);
  };

  const cancelEdit = () => {
    setEditingPostId(null);
    setEditContent('');
  };

  const startEditThread = () => {
    if (thread) {
      setEditingThread(true);
      setEditThreadTitle(thread.title);
    }
  };

  const cancelEditThread = () => {
    setEditingThread(false);
    setEditThreadTitle('');
  };

  const handleEditThread = async () => {
    if (!editThreadTitle.trim()) {
      Alert.alert('Error', 'Thread title cannot be empty');
      return;
    }

    try {
      setSubmitting(true);
      const token = await AsyncStorage.getItem('auth_token');

      if (!token) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const response = await fetch(`${API_URL}/api/v1/forums/threads/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editThreadTitle }),
      });

      if (!response.ok) {
        throw new Error('Failed to update thread');
      }

      const updatedThread = await response.json();
      setThread(updatedThread);
      setEditingThread(false);
      setEditThreadTitle('');
      Alert.alert('Success', 'Thread title updated successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update thread');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteThread = async () => {
    Alert.alert(
      'Delete Thread',
      'Are you sure you want to delete this entire thread? This will delete all posts and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('auth_token');

              if (!token) {
                Alert.alert('Error', 'You must be logged in');
                return;
              }

              const response = await fetch(`${API_URL}/api/v1/forums/threads/${id}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (!response.ok) {
                throw new Error('Failed to delete thread');
              }

              Alert.alert('Success', 'Thread deleted successfully');
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete thread');
            }
          },
        },
      ]
    );
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading thread...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !thread) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Page Header with Back Button */}
      <View style={[styles.pageHeader, { backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {thread?.title || 'Thread'}
        </Text>
        {/* Header Action Buttons */}
        <View style={styles.headerActions}>
          {currentUserId && thread && thread.author_id === currentUserId && !editingThread && (
            <>
              <TouchableOpacity
                onPress={startEditThread}
                style={styles.headerActionButton}
              >
                <MaterialCommunityIcons name="pencil" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteThread}
                style={styles.headerActionButton}
              >
                <MaterialCommunityIcons name="delete" size={22} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
      {/* Thread Info Bar */}
      <View style={[styles.threadInfoBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {editingThread ? (
          <View style={styles.editThreadContainer}>
            <TextInput
              style={[styles.editThreadInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
              value={editThreadTitle}
              onChangeText={setEditThreadTitle}
              placeholder="Thread title..."
              placeholderTextColor={colors.textTertiary}
              maxLength={200}
            />
            <View style={styles.editThreadActions}>
              <TouchableOpacity
                style={[styles.editThreadButton, { backgroundColor: colors.primary }]}
                onPress={handleEditThread}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.editThreadButtonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editThreadButton, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}
                onPress={cancelEditThread}
                disabled={submitting}
              >
                <Text style={[styles.editThreadButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.threadMetaRow}>
            <View style={styles.threadBadges}>
              {thread.is_pinned && (
                <MaterialCommunityIcons name="pin" size={16} color={colors.primary} style={styles.metaIcon} />
              )}
              {thread.is_locked && (
                <MaterialCommunityIcons name="lock" size={16} color={colors.textTertiary} style={styles.metaIcon} />
              )}
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
        )}
      </View>

      {/* Posts List */}
      <ScrollView
        style={styles.postsContainer}
        contentContainerStyle={styles.postsContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
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
              
              {/* Edit/Delete Buttons */}
              {(() => {
                const canEdit = currentUserId && post.author.id === currentUserId && editingPostId !== post.id;
                if (index === 0) {
                  console.log('[Thread] Edit check for first post:', {
                    currentUserId,
                    authorId: post.author.id,
                    canEdit,
                    editingPostId
                  });
                }
                return canEdit;
              })() && (
                <View style={styles.postActions}>
                  <TouchableOpacity
                    onPress={() => startEdit(post)}
                    style={styles.actionButton}
                  >
                    <MaterialCommunityIcons name="pencil" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  {index !== 0 && (
                    <TouchableOpacity
                      onPress={() => handleDeletePost(post.id, index)}
                      style={styles.actionButton}
                    >
                      <MaterialCommunityIcons name="delete" size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Edit Mode */}
            {editingPostId === post.id ? (
              <View style={styles.editContainer}>
                <TextInput
                  style={[styles.editInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  maxLength={5000}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: colors.primary }]}
                    onPress={() => handleEditPost(post.id)}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.editButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}
                    onPress={cancelEdit}
                    disabled={submitting}
                  >
                    <Text style={[styles.editButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={[styles.postContent, { color: colors.textSecondary }]}>{post.content}</Text>
            )}
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
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerActionButton: {
    padding: 4,
  },
  threadInfoBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  threadMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  threadBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaIcon: {
    marginRight: 4,
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
    padding: 12,
  },
  postCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
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
  postActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  actionButton: {
    padding: 6,
    borderRadius: 6,
  },
  editContainer: {
    marginTop: 8,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  editButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
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
  editThreadContainer: {
    padding: 16,
  },
  editThreadInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  editThreadActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editThreadButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  editThreadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  threadActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  threadActionButton: {
    padding: 6,
    borderRadius: 6,
  },
});
