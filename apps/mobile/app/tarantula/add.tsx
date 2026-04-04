import React, { useState, Suspense } from 'react';
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
import SpeciesAutocomplete from '../../src/components/SpeciesAutocomplete';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

const UpgradeModal = React.lazy(() => import('../../src/components/UpgradeModal'));

interface TarantulaData {
  name: string;
  common_name: string;
  scientific_name: string;
  species_id?: string;
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

const STEPS = [
  { title: 'Basic Info', subtitle: 'Species, name & origin' },
  { title: 'Enclosure', subtitle: 'Setup & substrate' },
  { title: 'Environment', subtitle: 'Temps, humidity & notes' },
];

export default function AddTarantulaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

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
    setSaving(true);
    try {
      const response = await apiClient.post('/tarantulas/', formData);
      Alert.alert('Success', 'Tarantula added successfully');
      router.replace(`/tarantula/${response.data.id}`);
    } catch (error: any) {
      if (error.response?.status === 402) {
        setShowUpgradeModal(true);
        setSaving(false);
        return;
      }
      const detail = error.response?.data?.detail;
      const message =
        typeof detail === 'object' && detail !== null
          ? detail.message || JSON.stringify(detail)
          : detail || 'Failed to add tarantula';
      Alert.alert('Error', message);
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backButton: { padding: 8 },
    headerTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    modeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    modeToggleText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    saveButton: { paddingHorizontal: 16, paddingVertical: 8 },
    saveButtonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
    content: { flex: 1 },
    // Step indicator
    stepIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    stepCircleActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    stepCircleDone: { borderColor: colors.primary, backgroundColor: colors.primary },
    stepNumber: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
    stepNumberActive: { color: '#fff' },
    stepConnector: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
    stepConnectorDone: { backgroundColor: colors.primary },
    stepLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 2, textAlign: 'center' },
    stepLabelActive: { color: colors.primary, fontWeight: '600' },
    // Step header
    stepHeader: { padding: 20, paddingBottom: 0 },
    stepTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    stepSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    // Sections (simple mode)
    section: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 16 },
    // Fields
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    textArea: { minHeight: 100 },
    optionRow: { flexDirection: 'row', gap: 8 },
    optionButton: {
      flex: 1,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      alignItems: 'center',
    },
    optionButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionButtonText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    optionButtonTextActive: { color: '#fff' },
    row: { flexDirection: 'row', gap: 12 },
    halfWidth: { flex: 1 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center' },
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
    checkboxLabel: { fontSize: 16, color: colors.textPrimary },
    // Wizard bottom nav
    wizardNav: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    navBack: {
      flex: 1,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      alignItems: 'center',
    },
    navBackText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    navNext: {
      flex: 2,
      paddingVertical: 14,
      backgroundColor: colors.primary,
      borderRadius: 10,
      alignItems: 'center',
    },
    navNextText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  });

  // ─── Shared field renderers ────────────────────────────────────────────────

  const renderBasicFields = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Species Lookup</Text>
        <SpeciesAutocomplete
          onSelect={(species) =>
            setFormData({
              ...formData,
              species_id: species.id,
              scientific_name: species.scientific_name,
              common_name: species.common_names[0] || '',
            })
          }
          placeholder="Search species by name..."
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
        <Text style={styles.label}>Nickname</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData({ ...formData, name: text })}
          placeholder="e.g., Rosie (optional)"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Sex</Text>
        <View style={styles.optionRow}>
          {[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Unknown', value: 'unknown' }].map((o) => (
            <TouchableOpacity
              key={o.value}
              style={[styles.optionButton, formData.sex === o.value && styles.optionButtonActive]}
              onPress={() => setFormData({ ...formData, sex: o.value })}
            >
              <Text style={[styles.optionButtonText, formData.sex === o.value && styles.optionButtonTextActive]}>
                {o.label}
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
        <View style={styles.optionRow}>
          {[{ label: 'Bred', value: 'bred' }, { label: 'Bought', value: 'bought' }, { label: 'Wild Caught', value: 'wild_caught' }].map((o) => (
            <TouchableOpacity
              key={o.value}
              style={[styles.optionButton, formData.source === o.value && styles.optionButtonActive]}
              onPress={() => setFormData({ ...formData, source: o.value })}
            >
              <Text style={[styles.optionButtonText, formData.source === o.value && styles.optionButtonTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
  );

  const renderEnclosureFields = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Enclosure Type</Text>
        <View style={styles.optionRow}>
          {[{ label: 'Terrestrial', value: 'terrestrial' }, { label: 'Arboreal', value: 'arboreal' }, { label: 'Fossorial', value: 'fossorial' }].map((o) => (
            <TouchableOpacity
              key={o.value}
              style={[styles.optionButton, formData.enclosure_type === o.value && styles.optionButtonActive]}
              onPress={() => setFormData({ ...formData, enclosure_type: o.value })}
            >
              <Text style={[styles.optionButtonText, formData.enclosure_type === o.value && styles.optionButtonTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
    </>
  );

  const renderEnvironmentFields = () => (
    <>
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

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Notes</Text>
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
    </>
  );

  // ─── Wizard step indicator ─────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((step, index) => (
        <React.Fragment key={index}>
          <View style={{ alignItems: 'center' }}>
            <View style={[
              styles.stepCircle,
              index === currentStep && styles.stepCircleActive,
              index < currentStep && styles.stepCircleDone,
            ]}>
              {index < currentStep ? (
                <MaterialCommunityIcons name="check" size={14} color="#fff" />
              ) : (
                <Text style={[styles.stepNumber, index === currentStep && styles.stepNumberActive]}>
                  {index + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, index === currentStep && styles.stepLabelActive]}>
              {step.title}
            </Text>
          </View>
          {index < STEPS.length - 1 && (
            <View style={[styles.stepConnector, index < currentStep && styles.stepConnectorDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Tarantula</Text>
        <View style={styles.headerRight}>
          {/* Mode toggle */}
          <TouchableOpacity
            style={styles.modeToggle}
            onPress={() => { setQuickMode(!quickMode); setCurrentStep(0); }}
          >
            <MaterialCommunityIcons
              name={quickMode ? 'format-list-bulleted-square' : 'view-sequential'}
              size={14}
              color={colors.textSecondary}
            />
            <Text style={styles.modeToggleText}>{quickMode ? 'Guided' : 'All fields'}</Text>
          </TouchableOpacity>
          {/* Save button only visible in simple/all-fields mode */}
          {quickMode && (
            <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── GUIDED WIZARD MODE ─────────────────────────────────────────── */}
      {!quickMode && (
        <>
          {renderStepIndicator()}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>{STEPS[currentStep].title}</Text>
              <Text style={styles.stepSubtitle}>{STEPS[currentStep].subtitle}</Text>
            </View>
            <View style={styles.section}>
              {currentStep === 0 && renderBasicFields()}
              {currentStep === 1 && renderEnclosureFields()}
              {currentStep === 2 && renderEnvironmentFields()}
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
          {/* Wizard navigation */}
          <View style={styles.wizardNav}>
            {currentStep > 0 && (
              <TouchableOpacity style={styles.navBack} onPress={() => setCurrentStep(currentStep - 1)}>
                <Text style={styles.navBackText}>Back</Text>
              </TouchableOpacity>
            )}
            {currentStep < STEPS.length - 1 ? (
              <TouchableOpacity style={styles.navNext} onPress={() => setCurrentStep(currentStep + 1)}>
                <Text style={styles.navNextText}>Next →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navNext} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.navNextText}>Save Tarantula</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ── SIMPLE SCROLL MODE (all fields) ────────────────────────────── */}
      {quickMode && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            {renderBasicFields()}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Enclosure Setup</Text>
            {renderEnclosureFields()}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Environment & Notes</Text>
            {renderEnvironmentFields()}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Suspense fallback={null}>
        <UpgradeModal
          visible={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title="Collection Limit Reached"
          message="You've reached the free tier limit of 15 tarantulas."
          feature="Unlimited Tarantulas"
        />
      </Suspense>
    </SafeAreaView>
  );
}
