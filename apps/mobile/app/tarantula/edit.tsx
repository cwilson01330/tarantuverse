import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateInput from '../../src/components/DateInput';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

interface TarantulaData {
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  date_acquired?: string;
  source?: string;
  enclosure_type?: string;
  enclosure_size?: string;
  substrate_type?: string;
  substrate_depth?: string;
  last_substrate_change?: string;
  target_temp_min?: number;
  target_temp_max?: number;
  target_humidity_min?: number;
  target_humidity_max?: number;
  water_dish?: boolean;
  misting_schedule?: string;
  notes?: string;
  // Per-tarantula visibility on the keeper's public profile.
  // `public` shows this tarantula to visitors when the owner's
  // profile is public; `private` hides it.
  visibility?: 'public' | 'private';
}

export default function EditTarantulaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<TarantulaData>({
    name: '',
    common_name: '',
    scientific_name: '',
    sex: undefined,
    date_acquired: undefined,
    source: undefined,
    enclosure_type: undefined,
    enclosure_size: undefined,
    substrate_type: undefined,
    substrate_depth: undefined,
    last_substrate_change: undefined,
    target_temp_min: undefined,
    target_temp_max: undefined,
    target_humidity_min: undefined,
    target_humidity_max: undefined,
    water_dish: undefined,
    misting_schedule: undefined,
    notes: undefined,
    visibility: 'public',
  });

  useEffect(() => {
    fetchTarantula();
  }, [id]);

  const fetchTarantula = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}`);
      const data = response.data;

      setFormData({
        name: data.name || '',
        common_name: data.common_name || '',
        scientific_name: data.scientific_name || '',
        sex: data.sex,
        date_acquired: data.date_acquired,
        source: data.source,
        enclosure_type: data.enclosure_type,
        enclosure_size: data.enclosure_size,
        substrate_type: data.substrate_type,
        substrate_depth: data.substrate_depth,
        last_substrate_change: data.last_substrate_change,
        target_temp_min: data.target_temp_min,
        target_temp_max: data.target_temp_max,
        target_humidity_min: data.target_humidity_min,
        target_humidity_max: data.target_humidity_max,
        water_dish: data.water_dish,
        misting_schedule: data.misting_schedule,
        notes: data.notes,
        visibility: data.visibility === 'private' ? 'private' : 'public',
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantula details');
      console.error(error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/tarantulas/${id}`, formData);
      Alert.alert('Success', 'Tarantula updated successfully');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update tarantula');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader
          title="Edit Tarantula"
          leftAction={
            <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close">
              <MaterialCommunityIcons name="close" size={26} color={iconColor} />
            </TouchableOpacity>
          }
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Edit Tarantula"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={26} color={iconColor} />
          </TouchableOpacity>
        }
        rightAction={
          <TouchableOpacity onPress={handleSave} disabled={saving} style={{ opacity: saving ? 0.5 : 1, paddingHorizontal: 4 }}>
            {saving ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : (
              <Text style={{ color: iconColor, fontSize: 16, fontWeight: '600' }}>Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="Pet name (optional, e.g., Rosie)"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Common Name</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.common_name}
              onChangeText={(text) => setFormData({ ...formData, common_name: text })}
              placeholder="e.g., Mexican Redknee"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Scientific Name</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.scientific_name}
              onChangeText={(text) => setFormData({ ...formData, scientific_name: text })}
              placeholder="e.g., Brachypelma hamorii"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Sex</Text>
            <View style={styles.sexButtons}>
              {[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Unknown', value: 'unknown' }].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sexButton,
                    { borderColor: colors.border },
                    formData.sex === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => setFormData({ ...formData, sex: option.value })}
                >
                  <Text style={[
                    styles.sexButtonText,
                    { color: colors.textSecondary },
                    formData.sex === option.value && { color: '#fff' }
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Date Acquired</Text>
            <DateInput
              value={parseLocalDate(formData.date_acquired) ?? new Date()}
              onChange={(date) => setFormData({ ...formData, date_acquired: toISODateLocal(date) })}
              maximumDate={new Date()}
              label="Date Acquired"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Source</Text>
            <View style={styles.sexButtons}>
              {[{ label: 'Bred', value: 'bred' }, { label: 'Bought', value: 'bought' }, { label: 'Wild Caught', value: 'wild_caught' }].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sexButton,
                    { borderColor: colors.border },
                    formData.source === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => setFormData({ ...formData, source: option.value })}
                >
                  <Text style={[
                    styles.sexButtonText,
                    { color: colors.textSecondary },
                    formData.source === option.value && { color: '#fff' }
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Enclosure */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Enclosure Setup</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Enclosure Type</Text>
            <View style={styles.sexButtons}>
              {[{ label: 'Terrestrial', value: 'terrestrial' }, { label: 'Arboreal', value: 'arboreal' }, { label: 'Fossorial', value: 'fossorial' }].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sexButton,
                    { borderColor: colors.border },
                    formData.enclosure_type === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => setFormData({ ...formData, enclosure_type: option.value })}
                >
                  <Text style={[
                    styles.sexButtonText,
                    { color: colors.textSecondary },
                    formData.enclosure_type === option.value && { color: '#fff' }
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Enclosure Size</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.enclosure_size}
              onChangeText={(text) => setFormData({ ...formData, enclosure_size: text })}
              placeholder="e.g., 10x10x10 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Substrate Type</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.substrate_type}
              onChangeText={(text) => setFormData({ ...formData, substrate_type: text })}
              placeholder="e.g., Coco fiber"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Substrate Depth</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.substrate_depth}
              onChangeText={(text) => setFormData({ ...formData, substrate_depth: text })}
              placeholder="e.g., 3 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Last Substrate Change</Text>
            <DateInput
              value={parseLocalDate(formData.last_substrate_change) ?? new Date()}
              onChange={(date) => setFormData({ ...formData, last_substrate_change: toISODateLocal(date) })}
              maximumDate={new Date()}
              label="Last Substrate Change"
            />
          </View>
        </View>

        {/* Environment */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Environment</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Min Temp (°F)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={formData.target_temp_min?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_temp_min: text ? parseInt(text) : undefined })}
                placeholder="72"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Max Temp (°F)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={formData.target_temp_max?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_temp_max: text ? parseInt(text) : undefined })}
                placeholder="78"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Min Humidity (%)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={formData.target_humidity_min?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_humidity_min: text ? parseInt(text) : undefined })}
                placeholder="60"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Max Humidity (%)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={formData.target_humidity_max?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_humidity_max: text ? parseInt(text) : undefined })}
                placeholder="70"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={[styles.checkbox, { borderColor: colors.border }]}
                onPress={() => setFormData({ ...formData, water_dish: !formData.water_dish })}
              >
                {formData.water_dish && (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
              <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Has Water Dish</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Misting Schedule</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.misting_schedule}
              onChangeText={(text) => setFormData({ ...formData, misting_schedule: text })}
              placeholder="e.g., Twice weekly"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Notes */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>

          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              placeholder="Additional notes..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Visibility — mirrors the web edit form. Only meaningful when
            the keeper's profile is public; private-profile owners are
            already fully hidden via the profile-level gate. */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Profile visibility</Text>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() =>
              setFormData({
                ...formData,
                visibility: formData.visibility === 'private' ? 'public' : 'private',
              })
            }
          >
            <View style={[styles.checkbox, { borderColor: colors.border }]}>
              {formData.visibility === 'private' && (
                <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>
                Hide from my public profile
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                Other keepers won&apos;t see this tarantula when viewing your
                profile. Only matters when your collection is public — private
                collections hide everything automatically.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
  },
  sexButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sexButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  sexButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
  },
});
