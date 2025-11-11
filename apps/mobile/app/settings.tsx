import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';

const specialtyOptions = [
  { value: 'terrestrial', label: 'Terrestrial' },
  { value: 'arboreal', label: 'Arboreal' },
  { value: 'fossorial', label: 'Fossorial' },
  { value: 'new_world', label: 'New World' },
  { value: 'old_world', label: 'Old World' },
  { value: 'breeding', label: 'Breeding' },
  { value: 'slings', label: 'Slings' },
  { value: 'large_species', label: 'Large Species' },
];

const experienceLevels = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    display_name: '',
    avatar_url: '',
    profile_bio: '',
    profile_location: '',
    profile_experience_level: '',
    profile_years_keeping: '',
    profile_specialties: [] as string[],
    social_links: {
      instagram: '',
      youtube: '',
      website: '',
    },
  });

  useEffect(() => {
    if (user) {
      setFormData({
        display_name: user.display_name || '',
        avatar_url: user.avatar_url || '',
        profile_bio: user.profile_bio || '',
        profile_location: user.profile_location || '',
        profile_experience_level: user.profile_experience_level || '',
        profile_years_keeping: user.profile_years_keeping ? String(user.profile_years_keeping) : '',
        profile_specialties: user.profile_specialties || [],
        social_links: {
          instagram: user.social_links?.instagram || '',
          youtube: user.social_links?.youtube || '',
          website: user.social_links?.website || '',
        },
      });
    }
  }, [user]);

  const handleSpecialtyToggle = (specialty: string) => {
    if (formData.profile_specialties.includes(specialty)) {
      setFormData({
        ...formData,
        profile_specialties: formData.profile_specialties.filter(s => s !== specialty),
      });
    } else {
      setFormData({
        ...formData,
        profile_specialties: [...formData.profile_specialties, specialty],
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build social links object only if at least one link is provided
      const socialLinksData = {
        instagram: formData.social_links.instagram || undefined,
        youtube: formData.social_links.youtube || undefined,
        website: formData.social_links.website || undefined,
      };
      const hasSocialLinks = Object.values(socialLinksData).some(v => v !== undefined);

      const submitData: any = {};

      // Only include fields that have values
      if (formData.display_name) submitData.display_name = formData.display_name;
      if (formData.avatar_url) submitData.avatar_url = formData.avatar_url;
      if (formData.profile_bio) submitData.profile_bio = formData.profile_bio;
      if (formData.profile_location) submitData.profile_location = formData.profile_location;
      if (formData.profile_experience_level) submitData.profile_experience_level = formData.profile_experience_level;
      if (formData.profile_years_keeping) {
        const years = parseInt(formData.profile_years_keeping);
        if (!isNaN(years)) submitData.profile_years_keeping = years;
      }
      if (formData.profile_specialties.length > 0) submitData.profile_specialties = formData.profile_specialties;
      if (hasSocialLinks) submitData.social_links = socialLinksData;

      await apiClient.put('/auth/me/profile', submitData);

      await refreshUser();

      Alert.alert(
        'Success',
        'Profile updated successfully',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update profile');
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
    scrollContent: {
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
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.textPrimary,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    experienceLevelGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    experienceLevelButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 2,
    },
    experienceLevelButtonSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '20',
    },
    experienceLevelButtonUnselected: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    experienceLevelText: {
      fontSize: 14,
      fontWeight: '500',
    },
    experienceLevelTextSelected: {
      color: colors.primary,
    },
    experienceLevelTextUnselected: {
      color: colors.textSecondary,
    },
    specialtiesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    specialtyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 2,
      marginBottom: 8,
    },
    specialtyChipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '20',
    },
    specialtyChipUnselected: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    specialtyText: {
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 4,
    },
    specialtyTextSelected: {
      color: colors.primary,
    },
    specialtyTextUnselected: {
      color: colors.textSecondary,
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButton: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    cancelButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={formData.display_name}
            onChangeText={(text) => setFormData({ ...formData, display_name: text })}
            placeholder="How you want to be known"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={styles.label}>Avatar URL</Text>
          <TextInput
            style={styles.input}
            value={formData.avatar_url}
            onChangeText={(text) => setFormData({ ...formData, avatar_url: text })}
            placeholder="https://example.com/avatar.jpg"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.profile_bio}
            onChangeText={(text) => setFormData({ ...formData, profile_bio: text })}
            placeholder="Tell us about yourself and your tarantula keeping journey..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={formData.profile_location}
            onChangeText={(text) => setFormData({ ...formData, profile_location: text })}
            placeholder="City, Country"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        {/* Experience */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experience</Text>

          <Text style={styles.label}>Experience Level</Text>
          <View style={styles.experienceLevelGrid}>
            {experienceLevels.map((level) => {
              const isSelected = formData.profile_experience_level === level.value;
              return (
                <TouchableOpacity
                  key={level.value}
                  style={[
                    styles.experienceLevelButton,
                    isSelected ? styles.experienceLevelButtonSelected : styles.experienceLevelButtonUnselected,
                  ]}
                  onPress={() => setFormData({ ...formData, profile_experience_level: level.value })}
                >
                  <Text style={[
                    styles.experienceLevelText,
                    isSelected ? styles.experienceLevelTextSelected : styles.experienceLevelTextUnselected,
                  ]}>
                    {level.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Years Keeping</Text>
          <TextInput
            style={styles.input}
            value={formData.profile_years_keeping}
            onChangeText={(text) => setFormData({ ...formData, profile_years_keeping: text })}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Specialties</Text>
          <View style={styles.specialtiesGrid}>
            {specialtyOptions.map((specialty) => {
              const isSelected = formData.profile_specialties.includes(specialty.value);
              return (
                <TouchableOpacity
                  key={specialty.value}
                  style={[
                    styles.specialtyChip,
                    isSelected ? styles.specialtyChipSelected : styles.specialtyChipUnselected,
                  ]}
                  onPress={() => handleSpecialtyToggle(specialty.value)}
                >
                  <Text style={[
                    styles.specialtyText,
                    isSelected ? styles.specialtyTextSelected : styles.specialtyTextUnselected,
                  ]}>
                    {isSelected ? '✓' : '○'} {specialty.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Social Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social Links</Text>

          <Text style={styles.label}>Instagram</Text>
          <TextInput
            style={styles.input}
            value={formData.social_links.instagram}
            onChangeText={(text) => setFormData({
              ...formData,
              social_links: { ...formData.social_links, instagram: text }
            })}
            placeholder="https://instagram.com/username"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>YouTube</Text>
          <TextInput
            style={styles.input}
            value={formData.social_links.youtube}
            onChangeText={(text) => setFormData({
              ...formData,
              social_links: { ...formData.social_links, youtube: text }
            })}
            placeholder="https://youtube.com/@channel"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>Website</Text>
          <TextInput
            style={styles.input}
            value={formData.social_links.website}
            onChangeText={(text) => setFormData({
              ...formData,
              social_links: { ...formData.social_links, website: text }
            })}
            placeholder="https://yourwebsite.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Profile</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
