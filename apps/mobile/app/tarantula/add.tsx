import React, { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateInput from '../../src/components/DateInput';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

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
}

export default function AddTarantulaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
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
    water_dish: true,
    misting_schedule: undefined,
    notes: undefined,
  });

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const response = await apiClient.post('/tarantulas/', formData);
      Alert.alert('Success', 'Tarantula added successfully');
      router.replace(`/tarantula/${response.data.id}`);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const message = typeof detail === 'object' && detail !== null
        ? detail.message || JSON.stringify(detail)
        : detail || 'Failed to add tarantula';
      Alert.alert('Error', message);
      console.error(error);
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
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    saveButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    content: {
      flex: 1,
    },
    section: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    inputGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
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
      borderColor: colors.border,
      borderRadius: 8,
      alignItems: 'center',
    },
    sexButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sexButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    sexButtonTextActive: {
      color: '#fff',
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
      borderColor: colors.border,
      borderRadius: 4,
      marginRight: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxLabel: {
      fontSize: 16,
      color: colors.textPrimary,
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Tarantula</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="Enter name"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Common Name</Text>
            <TextInput
              style={styles.input}
              value={formData.common_name}
              onChangeText={(text) => setFormData({ ...formData, common_name: text })}
              placeholder="e.g., Mexican Redknee"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Scientific Name</Text>
            <TextInput
              style={styles.input}
              value={formData.scientific_name}
              onChangeText={(text) => setFormData({ ...formData, scientific_name: text })}
              placeholder="e.g., Brachypelma hamorii"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.sexButtons}>
              {['Male', 'Female', 'Unknown'].map((sex) => (
                <TouchableOpacity
                  key={sex}
                  style={[
                    styles.sexButton,
                    formData.sex === sex && styles.sexButtonActive
                  ]}
                  onPress={() => setFormData({ ...formData, sex })}
                >
                  <Text style={[
                    styles.sexButtonText,
                    formData.sex === sex && styles.sexButtonTextActive
                  ]}>
                    {sex}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date Acquired</Text>
            <DateInput
              value={formData.date_acquired ? new Date(formData.date_acquired) : new Date()}
              onChange={(date) => setFormData({ ...formData, date_acquired: date.toISOString().split('T')[0] })}
              maximumDate={new Date()}
              label="Date Acquired"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Source</Text>
            <TextInput
              style={styles.input}
              value={formData.source}
              onChangeText={(text) => setFormData({ ...formData, source: text })}
              placeholder="Where did you get it?"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Enclosure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enclosure Setup</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Enclosure Type</Text>
            <TextInput
              style={styles.input}
              value={formData.enclosure_type}
              onChangeText={(text) => setFormData({ ...formData, enclosure_type: text })}
              placeholder="e.g., Terrestrial, Arboreal"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Enclosure Size</Text>
            <TextInput
              style={styles.input}
              value={formData.enclosure_size}
              onChangeText={(text) => setFormData({ ...formData, enclosure_size: text })}
              placeholder="e.g., 10x10x10 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Substrate Type</Text>
            <TextInput
              style={styles.input}
              value={formData.substrate_type}
              onChangeText={(text) => setFormData({ ...formData, substrate_type: text })}
              placeholder="e.g., Coco fiber"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Substrate Depth</Text>
            <TextInput
              style={styles.input}
              value={formData.substrate_depth}
              onChangeText={(text) => setFormData({ ...formData, substrate_depth: text })}
              placeholder="e.g., 3 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Substrate Change</Text>
            <DateInput
              value={formData.last_substrate_change ? new Date(formData.last_substrate_change) : new Date()}
              onChange={(date) => setFormData({ ...formData, last_substrate_change: date.toISOString().split('T')[0] })}
              maximumDate={new Date()}
              label="Last Substrate Change"
            />
          </View>
        </View>

        {/* Environment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Min Temp (°F)</Text>
              <TextInput
                style={styles.input}
                value={formData.target_temp_min?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_temp_min: text ? parseInt(text) : undefined })}
                placeholder="72"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Max Temp (°F)</Text>
              <TextInput
                style={styles.input}
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
              <Text style={styles.label}>Min Humidity (%)</Text>
              <TextInput
                style={styles.input}
                value={formData.target_humidity_min?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_humidity_min: text ? parseInt(text) : undefined })}
                placeholder="60"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Max Humidity (%)</Text>
              <TextInput
                style={styles.input}
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
                style={styles.checkbox}
                onPress={() => setFormData({ ...formData, water_dish: !formData.water_dish })}
              >
                {formData.water_dish && (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
              <Text style={styles.checkboxLabel}>Has Water Dish</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Misting Schedule</Text>
            <TextInput
              style={styles.input}
              value={formData.misting_schedule}
              onChangeText={(text) => setFormData({ ...formData, misting_schedule: text })}
              placeholder="e.g., Twice weekly"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>

          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
