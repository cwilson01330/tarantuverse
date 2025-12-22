import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';

const PRIVACY_POLICY_URL = 'https://www.tarantuverse.com/privacy-policy';

export default function PrivacyScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.collection_visibility) {
      setVisibility(user.collection_visibility as 'private' | 'public');
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/auth/me/profile', {
        collection_visibility: visibility,
      });

      await refreshUser();

      Alert.alert(
        'Success',
        'Privacy settings updated successfully',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scrollContainer: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    infoBox: {
      backgroundColor: colors.primary + '15',
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      borderWidth: 2,
      marginBottom: 12,
    },
    optionCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    optionCardUnselected: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    radioOuter: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    radioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    optionDescription: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    saveButton: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    linkContent: {
      flex: 1,
      marginLeft: 12,
    },
    linkTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    linkDescription: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Settings</Text>
      </View>

      <ScrollView style={styles.scrollContainer}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Collection Visibility</Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                <Text style={{ fontWeight: '600' }}>Public:</Text> Other keepers can view your profile and tarantulas in the Community section.{'\n\n'}
                <Text style={{ fontWeight: '600' }}>Private:</Text> Only you can see your collection. Your email, prices paid, and notes are never shared.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.optionCard,
                visibility === 'private' ? styles.optionCardSelected : styles.optionCardUnselected,
              ]}
              onPress={() => setVisibility('private')}
            >
              <View style={[styles.radioOuter, { borderColor: visibility === 'private' ? colors.primary : colors.border }]}>
                {visibility === 'private' && <View style={styles.radioInner} />}
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>🔒 Private</Text>
                <Text style={styles.optionDescription}>Only you can see your collection</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionCard,
                visibility === 'public' ? styles.optionCardSelected : styles.optionCardUnselected,
              ]}
              onPress={() => setVisibility('public')}
            >
              <View style={[styles.radioOuter, { borderColor: visibility === 'public' ? colors.primary : colors.border }]}>
                {visibility === 'public' && <View style={styles.radioInner} />}
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>🌍 Public</Text>
                <Text style={styles.optionDescription}>Share with the community</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Legal Links - Required by Apple */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Legal</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL('https://www.tarantuverse.com/terms')}
            >
              <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.primary} />
              <View style={styles.linkContent}>
                <Text style={styles.linkTitle}>Terms of Use</Text>
                <Text style={styles.linkDescription}>View our terms of service</Text>
              </View>
              <MaterialCommunityIcons name="open-in-new" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
            <View style={{ height: 12 }} />
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            >
              <MaterialCommunityIcons name="shield-account" size={24} color={colors.primary} />
              <View style={styles.linkContent}>
                <Text style={styles.linkTitle}>Privacy Policy</Text>
                <Text style={styles.linkDescription}>View our privacy policy</Text>
              </View>
              <MaterialCommunityIcons name="open-in-new" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
