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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
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

export default function EditTarantulaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSubstrateDatePicker, setShowSubstrateDatePicker] = useState(false);

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
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

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

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData({ ...formData, date_acquired: selectedDate.toISOString().split('T')[0] });
    }
  };

  const onSubstrateDateChange = (event: any, selectedDate?: Date) => {
    setShowSubstrateDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData({ ...formData, last_substrate_change: selectedDate.toISOString().split('T')[0] });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Edit Tarantula</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveButtonText, { color: colors.primary }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Name *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="Enter name"
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
              {['Male', 'Female', 'Unknown'].map((sex) => (
                <TouchableOpacity
                  key={sex}
                  style={[
                    styles.sexButton,
                    { borderColor: colors.border },
                    formData.sex === sex && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => setFormData({ ...formData, sex })}
                >
                  <Text style={[
                    styles.sexButtonText,
                    { color: colors.textSecondary },
                    formData.sex === sex && { color: '#fff' }
                  ]}>
                    {sex}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Date Acquired</Text>
            <TouchableOpacity
              style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.dateButtonText, { color: colors.textPrimary }]}>
                {formatDate(formData.date_acquired)}
              </Text>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={formData.date_acquired ? new Date(formData.date_acquired) : new Date()}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Source</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.source}
              onChangeText={(text) => setFormData({ ...formData, source: text })}
              placeholder="Where did you get it?"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Enclosure */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Enclosure Setup</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Enclosure Type</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
              value={formData.enclosure_type}
              onChangeText={(text) => setFormData({ ...formData, enclosure_type: text })}
              placeholder="e.g., Terrestrial, Arboreal"
              placeholderTextColor={colors.textTertiary}
            />
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
            <TouchableOpacity
              style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              onPress={() => setShowSubstrateDatePicker(true)}
            >
              <Text style={[styles.dateButtonText, { color: colors.textPrimary }]}>
                {formatDate(formData.last_substrate_change)}
              </Text>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {showSubstrateDatePicker && (
              <DateTimePicker
                value={formData.last_substrate_change ? new Date(formData.last_substrate_change) : new Date()}
                mode="date"
                display="default"
                onChange={onSubstrateDateChange}
              />
            )}
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  dateButtonText: {
    fontSize: 16,
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
