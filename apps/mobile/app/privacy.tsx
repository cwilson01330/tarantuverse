import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';

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
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Privacy Settings',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      />
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
