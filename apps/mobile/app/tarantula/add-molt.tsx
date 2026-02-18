import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function AddMoltScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [moltDate, setMoltDate] = useState(new Date());
  const [showMoltDatePicker, setShowMoltDatePicker] = useState(false);
  const [premoltDate, setPremoltDate] = useState<Date | null>(null);
  const [showPremoltDatePicker, setShowPremoltDatePicker] = useState(false);
  const [legSpanBefore, setLegSpanBefore] = useState('');
  const [legSpanAfter, setLegSpanAfter] = useState('');
  const [weightBefore, setWeightBefore] = useState('');
  const [weightAfter, setWeightAfter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/tarantulas/${id}/molts`, {
        molted_at: moltDate.toISOString(),
        premolt_started_at: premoltDate?.toISOString() || undefined,
        leg_span_before: legSpanBefore ? parseFloat(legSpanBefore) : undefined,
        leg_span_after: legSpanAfter ? parseFloat(legSpanAfter) : undefined,
        weight_before: weightBefore ? parseFloat(weightBefore) : undefined,
        weight_after: weightAfter ? parseFloat(weightAfter) : undefined,
        notes: notes.trim() || undefined,
      });

      Alert.alert('Success', 'Molt log added successfully');
      router.back();
    } catch (error: any) {
      console.error('Failed to save molt log:', error);
      Alert.alert('Error', 'Failed to save molt log');
    } finally {
      setSaving(false);
    }
  };

  const onMoltDateChange = (event: any, selectedDate?: Date) => {
    setShowMoltDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setMoltDate(selectedDate);
    }
  };

  const onPremoltDateChange = (event: any, selectedDate?: Date) => {
    setShowPremoltDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setPremoltDate(selectedDate);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Log Molt</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Molt Date */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Molt Date *</Text>
          <TouchableOpacity
            style={[styles.input, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => setShowMoltDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color={colors.primary} />
            <Text style={[styles.inputText, { color: colors.textPrimary }]}>{moltDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          {showMoltDatePicker && (
            <DateTimePicker
              value={moltDate}
              mode="date"
              display="default"
              onChange={onMoltDateChange}
              maximumDate={new Date()}
            />
          )}
        </View>

        {/* Premolt Start Date */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Premolt Started (Optional)</Text>
          <TouchableOpacity
            style={[styles.input, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={() => setShowPremoltDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color={colors.primary} />
            <Text style={[styles.inputText, { color: colors.textPrimary }]}>
              {premoltDate ? premoltDate.toLocaleDateString() : 'Select date'}
            </Text>
          </TouchableOpacity>
          {showPremoltDatePicker && (
            <DateTimePicker
              value={premoltDate || new Date()}
              mode="date"
              display="default"
              onChange={onPremoltDateChange}
              maximumDate={new Date()}
            />
          )}
          {premoltDate && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setPremoltDate(null)}
            >
              <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Measurements */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Measurements (Optional)</Text>

          <View style={styles.row}>
            <View style={styles.measurementGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Leg Span Before (inches)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
                value={legSpanBefore}
                onChangeText={setLegSpanBefore}
                placeholder="0.0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.measurementGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Leg Span After (inches)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
                value={legSpanAfter}
                onChangeText={setLegSpanAfter}
                placeholder="0.0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.measurementGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Weight Before (grams)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
                value={weightBefore}
                onChangeText={setWeightBefore}
                placeholder="0.0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.measurementGroup}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Weight After (grams)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
                value={weightAfter}
                onChangeText={setWeightAfter}
                placeholder="0.0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Notes</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any additional notes..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  inputText: {
    fontSize: 16,
  },
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  measurementGroup: {
    flex: 1,
  },
  textInput: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
  },
  textArea: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    minHeight: 100,
  },
});
