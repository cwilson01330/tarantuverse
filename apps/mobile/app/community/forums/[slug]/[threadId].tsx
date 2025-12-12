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
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../../../src/contexts/ThemeContext';
import ReportModal from '../../../../src/components/ReportModal';

interface Author {
  id: string;
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

      // Fetch posts
      const postsResponse = await fetch(`${API_URL}/api/v1/forums/threads/${threadId}/posts?page=1&limit=100`);
      if (!postsResponse.ok) throw new Error('Failed to fetch posts');
      const postsData = await postsResponse.json();

      // Combine first_post with other posts
      if (threadData.first_post && postsData.posts) {
        const otherPosts = postsData.posts.filter((p: Post) => p.id !== threadData.first_post.id);
        setPosts([threadData.first_post, ...otherPosts]);
      } else if (postsData.posts) {
        setPosts(postsData.posts);
      }
    } catch (error) {
      console.error('Error fetching thread data:', error);
      Alert.alert('Error', 'Failed to load thread');
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

    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      Alert.alert('Login Required', 'Please log in to post replies');
      return;
    }

    setIsReplying(true);
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/forums/threads/${threadId}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: replyText }),
      });

      if (!response.ok) throw new Error('Failed to post reply');

      setReplyText('');
      fetchThreadData();
      Alert.alert('Success', 'Reply posted!');
    } catch (error) {
      Alert.alert('Error', 'Failed to post reply');
    } finally {
      setIsReplying(false);
    }
  };

  const handleUsernamePress = (username: string) => {
    router.push(`/community/${username}`);
  };

  const handleReportPress = (post: Post) => {
    setReportingPost(post);
    setReportModalVisible(true);
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading thread...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!thread) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>Thread not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <View style={styles.headerTitleRow}>
              {thread.is_pinned && <Text style={styles.headerIcon}>📌</Text>}
              {thread.is_locked && <Text style={styles.headerIcon}>🔒</Text>}
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {thread.title}
              </Text>
            </View>
            <Text style={[styles.headerMeta, { color: colors.textSecondary }]}>
              {thread.category.name} • {thread.post_count} posts • {thread.view_count} views
            </Text>
          </View>
        </View>

        {/* Posts List */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
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
            posts.map((post, index) => (
              <View
                key={post.id}
                style={[
                  styles.postCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {/* Post Header with Author and Actions */}
                <View style={styles.postHeaderRow}>
                  {/* Author Info - Clickable */}
                  <TouchableOpacity
                    style={styles.postAuthorSection}
                    onPress={() => handleUsernamePress(post.author.username)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.authorAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.authorAvatarText}>
                        {(post.author.display_name || post.author.username).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.postAuthorInfo}>
                      <Text style={[styles.postAuthorName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {post.author.display_name || post.author.username}
                      </Text>
                      <Text style={[styles.postDate, { color: colors.textTertiary }]} numberOfLines={1}>
                        @{post.author.username} • {formatDate(post.created_at)}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Action Buttons */}
                  <View style={styles.postActionsRow}>
                    {index === 0 && (
                      <View style={[styles.opBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.opBadgeText}>OP</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => handleReportPress(post)}
                      style={[styles.reportButton, { borderColor: colors.border }]}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="flag" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Post Content */}
                <Text style={[styles.postContent, { color: colors.textPrimary }]}>{post.content}</Text>
              </View>
            ))
          )}
        </ScrollView>

        {/* Reply Input */}
        {!thread.is_locked ? (
          <View style={[styles.replyContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.replyInput, { color: colors.textPrimary, backgroundColor: colors.background }]}
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
              style={[
                styles.sendButton,
                { backgroundColor: replyText.trim() ? colors.primary : colors.border }
              ]}
              activeOpacity={0.8}
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
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.lockedBanner, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
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
            reportedUserId={reportingPost.author_id}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBackButton: {
    marginBottom: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  headerIcon: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  headerMeta: {
    fontSize: 13,
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
  postCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  postHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postAuthorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
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
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  postDate: {
    fontSize: 12,
  },
  postActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  reportButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
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
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
  },
  lockedText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
