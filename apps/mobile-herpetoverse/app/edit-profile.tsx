/**
 * Edit profile — Herpetoverse mobile.
 *
 * The keeper account is shared with Tarantuverse (one login, one
 * profile), so this edits the same `users` record. v1 fields: display
 * name, bio, location, experience level, years keeping, and collection
 * visibility — all generic keeper attributes. Avatar upload, the
 * username change (30-day cooldown), specialties, and social links are
 * deferred to later bundles.
 *
 * Saves via `PUT /auth/me/profile`. The endpoint validates
 * experience_level against a fixed set and 400s on a null/empty value,
 * so experience is only included in the payload when actually chosen.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  extractErrorMessage,
  type ChipOption,
} from '../src/components/forms/FormPrimitives';

// Mirrors the backend's accepted experience levels — the PUT endpoint
// rejects anything outside this set.
const EXPERIENCE_OPTIONS: ChipOption<string>[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

const VISIBILITY_OPTIONS: ChipOption<string>[] = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
];

interface MeResponse {
  display_name: string | null;
  profile_bio: string | null;
  profile_location: string | null;
  profile_experience_level: string | null;
  profile_years_keeping: number | null;
  collection_visibility: string | null;
}

function EditProfileScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [experience, setExperience] = useState('');
  const [yearsKeeping, setYearsKeeping] = useState('');
  const [visibility, setVisibility] = useState('private');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await apiClient.get<MeResponse>('/auth/me');
      setDisplayName(data.display_name ?? '');
      setBio(data.profile_bio ?? '');
      setLocation(data.profile_location ?? '');
      setExperience(data.profile_experience_level ?? '');
      setYearsKeeping(
        data.profile_years_keeping != null
          ? String(data.profile_years_keeping)
          : '',
      );
      setVisibility(
        data.collection_visibility === 'public' ? 'public' : 'private',
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const years = parseInt(yearsKeeping, 10);
      const payload: Record<string, unknown> = {
        display_name: displayName.trim() || null,
        profile_bio: bio.trim() || null,
        profile_location: location.trim() || null,
        profile_years_keeping:
          Number.isFinite(years) && years >= 0 ? years : null,
        collection_visibility: visibility,
      };
      // The endpoint 400s if experience_level is present but not one of
      // beginner/intermediate/advanced/expert — so only send it when set.
      if (experience) {
        payload.profile_experience_level = experience;
      }
      await apiClient.put('/auth/me/profile', payload);
      // Refresh the cached user so the Profile tab reflects the change.
      await refreshUser();
      router.back();
    } catch (err) {
      setSaveError(
        extractErrorMessage(
          err,
          'Could not save your profile. Please try again.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Edit profile" leftAction={<HeaderBackButton />} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Couldn't load your profile.
          </Text>
          <TouchableOpacity
            onPress={load}
            style={[styles.retryButton, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Display name" hint="Shown on your profile and posts.">
            <ThemedInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              maxLength={100}
            />
          </Field>

          <Field label="Bio">
            <ThemedInput
              value={bio}
              onChangeText={setBio}
              placeholder="A little about you and your animals"
              multiline
              numberOfLines={4}
              style={styles.bioInput}
            />
          </Field>

          <Field label="Location">
            <ThemedInput
              value={location}
              onChangeText={setLocation}
              placeholder="City, country"
              maxLength={255}
            />
          </Field>

          <Field label="Experience level">
            <ChipGroup
              options={EXPERIENCE_OPTIONS}
              value={experience}
              onChange={setExperience}
            />
          </Field>

          <Field label="Years keeping">
            <ThemedInput
              value={yearsKeeping}
              onChangeText={setYearsKeeping}
              placeholder="0"
              keyboardType="number-pad"
              maxLength={3}
            />
          </Field>

          <Field
            label="Collection visibility"
            hint={
              visibility === 'public'
                ? 'Other keepers can view your collection.'
                : 'Only you can see your collection.'
            }
          >
            <ChipGroup
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onChange={setVisibility}
            />
          </Field>

          {saveError ? <FormErrorBanner message={saveError} /> : null}

          <SubmitButton
            label="Save changes"
            busy={saving}
            onPress={handleSave}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: { fontSize: 14 },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 10,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
  content: {
    padding: 16,
    paddingBottom: 120,
    gap: 18,
  },
  bioInput: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});

export default withErrorBoundary(EditProfileScreen, 'edit-profile');
