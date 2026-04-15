import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';
import { AppHeader } from '../src/components/AppHeader';

const SUPPORT_USERNAME = 'gwizard202';

const QUICK_TOPICS = [
  { label: 'Bug Report', prefix: '[Bug] ' },
  { label: 'Feature Request', prefix: '[Feature Request] ' },
  { label: 'Account Issue', prefix: '[Account] ' },
  { label: 'Other', prefix: '' },
];

export default function SupportScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const closeAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close">
      <MaterialCommunityIcons name="close" size={26} color={iconColor} />
    </TouchableOpacity>
  );
  const [message, setMessage] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message.');
      return;
    }

    setSending(true);
    try {
      const topic = QUICK_TOPICS.find(t => t.label === selectedTopic);
      const prefix = topic?.prefix || '';
      const fullMessage = `${prefix}${message.trim()}`;

      await apiClient.post('/messages/direct/send', {
        recipient_username: SUPPORT_USERNAME,
        content: fullMessage,
      });

      setSent(true);
    } catch (error: any) {
      console.error('Support message error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Support" leftAction={closeAction} />

        <View style={styles.sentContainer}>
          <View style={[styles.sentIcon, { backgroundColor: '#dcfce7' }]}>
            <MaterialCommunityIcons name="check-circle" size={48} color="#16a34a" />
          </View>
          <Text style={[styles.sentTitle, { color: colors.textPrimary }]}>Message Sent!</Text>
          <Text style={[styles.sentText, { color: colors.textSecondary }]}>
            We'll get back to you as soon as possible. You can check for a reply in your Messages.
          </Text>
          <TouchableOpacity
            style={[styles.sentBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.sentBtnText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sentBtnOutline, { borderColor: colors.border }]}
            onPress={() => router.push('/messages')}
          >
            <Text style={[styles.sentBtnOutlineText, { color: colors.primary }]}>View Messages</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Contact Support" leftAction={closeAction} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Having an issue or want to share feedback? Send us a message and we'll get back to you.
          </Text>

          {/* Topic Selection */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>What's this about?</Text>
          <View style={styles.topicRow}>
            {QUICK_TOPICS.map(topic => (
              <TouchableOpacity
                key={topic.label}
                style={[
                  styles.topicChip,
                  { borderColor: colors.border },
                  selectedTopic === topic.label && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setSelectedTopic(topic.label)}
              >
                <Text style={[
                  styles.topicChipText,
                  { color: colors.textSecondary },
                  selectedTopic === topic.label && { color: '#fff' },
                ]}>
                  {topic.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Message Input */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Your message</Text>
          <TextInput
            style={[styles.messageInput, {
              borderColor: colors.border,
              color: colors.textPrimary,
              backgroundColor: colors.surfaceElevated,
            }]}
            placeholder="Describe your issue or feedback..."
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
            maxLength={2000}
          />
          <Text style={[styles.charCount, { color: colors.textTertiary }]}>
            {message.length}/2000
          </Text>

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: sending || !message.trim() ? 0.5 : 1 }]}
            onPress={handleSend}
            disabled={sending || !message.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
                <Text style={styles.sendBtnText}>Send Message</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  topicChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  topicChipText: { fontSize: 13, fontWeight: '500' },
  messageInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 160,
    lineHeight: 22,
  },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4, marginBottom: 20 },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Sent state
  sentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  sentIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  sentTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  sentText: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  sentBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  sentBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sentBtnOutline: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center', borderWidth: 1 },
  sentBtnOutlineText: { fontSize: 16, fontWeight: '600' },
});
