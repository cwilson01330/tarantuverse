import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reportType: 'forum_post' | 'forum_reply' | 'direct_message' | 'user_profile' | 'other';
  contentId: string;
  reportedUserId?: string;
  contentUrl?: string;
}

const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or Bullying', icon: 'account-alert' },
  { value: 'spam', label: 'Spam or Scam', icon: 'email-alert' },
  { value: 'hate_speech', label: 'Hate Speech', icon: 'alert-octagon' },
  { value: 'illegal', label: 'Illegal Content', icon: 'gavel' },
  { value: 'animal_cruelty', label: 'Animal Cruelty', icon: 'alert' },
  { value: 'inappropriate', label: 'Inappropriate Content', icon: 'eye-off' },
  { value: 'other', label: 'Other', icon: 'dots-horizontal' },
];

export default function ReportModal({
  visible,
  onClose,
  reportType,
  contentId,
  reportedUserId,
  contentUrl,
}: ReportModalProps) {
  const { colors } = useTheme();
  const [selectedReason, setSelectedReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason for reporting');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/reports/', {
        report_type: reportType,
        content_id: contentId,
        reported_user_id: reportedUserId || null,
        content_url: contentUrl || null,
        reason: selectedReason,
        description: description.trim() || null,
      });

      Alert.alert(
        'Report Submitted',
        'Thank you for reporting. Our moderation team will review this within 24 hours.',
        [{ text: 'OK', onPress: () => {
          setSelectedReason('');
          setDescription('');
          onClose();
        }}]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
      paddingTop: 24,
      paddingHorizontal: 20,
      paddingBottom: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    closeButton: {
      padding: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    reasonsContainer: {
      marginBottom: 20,
    },
    reasonButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      borderWidth: 2,
      marginBottom: 12,
    },
    reasonButtonUnselected: {
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    reasonButtonSelected: {
      borderColor: colors.error,
      backgroundColor: colors.error + '10',
    },
    reasonIcon: {
      marginRight: 12,
    },
    reasonText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
    reasonTextUnselected: {
      color: colors.textSecondary,
    },
    reasonTextSelected: {
      color: colors.error,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    textArea: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      color: colors.textPrimary,
      minHeight: 100,
      textAlignVertical: 'top',
      marginBottom: 20,
    },
    submitButton: {
      backgroundColor: colors.error,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Report Content</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Help us keep Tarantuverse safe. All reports are reviewed within 24 hours.
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.reasonsContainer}>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.value}
                  style={[
                    styles.reasonButton,
                    selectedReason === reason.value
                      ? styles.reasonButtonSelected
                      : styles.reasonButtonUnselected,
                  ]}
                  onPress={() => setSelectedReason(reason.value)}
                  disabled={submitting}
                >
                  <MaterialCommunityIcons
                    name={reason.icon as any}
                    size={24}
                    color={selectedReason === reason.value ? colors.error : colors.textSecondary}
                    style={styles.reasonIcon}
                  />
                  <Text
                    style={[
                      styles.reasonText,
                      selectedReason === reason.value
                        ? styles.reasonTextSelected
                        : styles.reasonTextUnselected,
                    ]}
                  >
                    {reason.label}
                  </Text>
                  {selectedReason === reason.value && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={24}
                      color={colors.error}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Additional Details (Optional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Provide any additional context..."
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              editable={!submitting}
            />

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting || !selectedReason}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
