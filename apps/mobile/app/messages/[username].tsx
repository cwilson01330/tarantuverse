import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, Image, ActionSheetIOS, AppState } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ReportModal from '../../src/components/ReportModal';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  is_read: boolean;
  created_at: string;
  is_own: boolean;
}

interface ConversationData {
  conversation_id: string | null;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
  messages: Message[];
}

export default function ConversationScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const username = params.username as string;
  const scrollViewRef = useRef<ScrollView>(null);

  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (username) {
      fetchConversation();

      // Poll every 10 seconds for new messages
      pollingRef.current = setInterval(() => {
        fetchConversation(true);
      }, 10000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [username]);

  // Pause polling when app backgrounds
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      } else if (state === 'active' && username && !pollingRef.current) {
        fetchConversation(true);
        pollingRef.current = setInterval(() => {
          fetchConversation(true);
        }, 10000);
      }
    });
    return () => subscription.remove();
  }, [username]);

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const fetchConversation = async (silent = false) => {
    try {
      if (!silent) setError('');
      const response = await apiClient.get(`/messages/direct/conversation/${username}`);
      setConversation(response.data);
    } catch (err: any) {
      if (!silent) {
        const message = err.response?.data?.detail || err.message || 'Failed to load conversation';
        if (err.response?.status !== 401) {
          setError(message);
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    setError('');
    try {
      await apiClient.post('/messages/direct/send', {
        recipient_username: username,
        content: newMessage,
      });

      setNewMessage('');
      // Small delay to let backend commit before fetching
      setTimeout(() => fetchConversation(true), 300);
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Failed to send message';
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleBlockUser = async () => {
    if (blocking || !conversation) return;

    Alert.alert(
      'Block User',
      `Block ${conversation.other_user.display_name}? They will no longer be able to message you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlocking(true);
            try {
              await apiClient.post('/blocks/', {
                blocked_id: conversation.other_user.id,
                reason: 'Blocked from direct messages',
              });
              Alert.alert('User Blocked', 'You will no longer receive messages from this user.', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to block user');
            } finally {
              setBlocking(false);
            }
          },
        },
      ]
    );
  };

  const showActions = () => {
    if (!conversation) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Report User', 'Block User', 'View Profile'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            setReportModalVisible(true);
          } else if (buttonIndex === 2) {
            handleBlockUser();
          } else if (buttonIndex === 3) {
            router.push(`/community/${conversation.other_user.username}`);
          }
        }
      );
    } else {
      Alert.alert(
        'Actions',
        '',
        [
          { text: 'Report User', onPress: () => setReportModalVisible(true) },
          { text: 'Block User', onPress: handleBlockUser, style: 'destructive' },
          { text: 'View Profile', onPress: () => router.push(`/community/${conversation.other_user.username}`) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const headerBackground = () => (
    <LinearGradient
      colors={[colors.primary, colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    />
  );

  const headerOptions = {
    headerBackground,
    headerTintColor: '#fff',
    headerTitleStyle: { color: '#fff', fontWeight: 'bold' as const },
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...', headerBackTitle: 'Messages', ...headerOptions }} />
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <Text style={styles.loadingEmoji}>💬</Text>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading conversation...</Text>
        </View>
      </>
    );
  }

  if (!conversation) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error', headerBackTitle: 'Messages', ...headerOptions }} />
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <Text style={styles.errorEmoji}>❌</Text>
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Error loading conversation</Text>
          {error ? <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>{error}</Text> : null}
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={[styles.retryButtonLarge, { backgroundColor: colors.primary }]}
              onPress={() => { setLoading(true); setError(''); fetchConversation(); }}
            >
              <Text style={styles.retryButtonLargeText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.backButton, { borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>Back to Messages</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: conversation.other_user.display_name,
          headerBackTitle: 'Messages',
          ...headerOptions,
          headerRight: () => (
            <TouchableOpacity
              onPress={showActions}
              style={{ marginRight: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={scrollToBottom}
        >
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity onPress={() => setError('')} style={styles.errorDismiss}>
                <MaterialCommunityIcons name="close" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          )}

          {conversation.messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Start the conversation!</Text>
            </View>
          ) : (
            conversation.messages.map((msg, index) => {
              const showDate = index === 0 || formatDate(msg.created_at) !== formatDate(conversation.messages[index - 1].created_at);

              return (
                <View key={msg.id}>
                  {showDate && (
                    <View style={styles.dateSeparator}>
                      <View style={[styles.datePill, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.dateText, { color: colors.textTertiary }]}>
                          {formatDate(msg.created_at)}
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={[styles.messageRow, msg.is_own && styles.messageRowOwn]}>
                    <View
                      style={[
                        styles.messageBubble,
                        msg.is_own
                          ? [styles.messageBubbleOwn, { backgroundColor: colors.primary }]
                          : [styles.messageBubbleOther, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }],
                      ]}
                    >
                      <Text style={[styles.messageText, { color: msg.is_own ? '#fff' : colors.textPrimary }]}>
                        {msg.content}
                      </Text>
                      <Text style={[styles.messageTime, { color: msg.is_own ? 'rgba(255,255,255,0.7)' : colors.textTertiary }]}>
                        {formatTime(msg.created_at)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Message Input */}
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.background, color: colors.textPrimary }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary }, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            <MaterialCommunityIcons name="send" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Report Modal */}
      {conversation && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reportType="user_profile"
          contentId={conversation.other_user.id}
          reportedUserId={conversation.other_user.id}
        />
      )}
    </>
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
    padding: 24,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#dc2626',
    fontSize: 14,
    flex: 1,
  },
  errorDismiss: {
    marginLeft: 8,
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  messageBubbleOwn: {
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorActions: {
    marginTop: 16,
    gap: 12,
    alignItems: 'center',
  },
  retryButtonLarge: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonLargeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
