import React, { useState, useRef, useEffect, Suspense } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Dimensions,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateInput from '../../src/components/DateInput';
import SpeciesAutocomplete from '../../src/components/SpeciesAutocomplete';
const UpgradeModal = React.lazy(() => import('../../src/components/UpgradeModal'));
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

type Mode = 'guided' | 'quick';
const MODE_KEY = 'add_tarantula_mode';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEPS = [
  { title: 'The Spider',   subtitle: 'What species are you adding?',    optional: false },
  { title: 'Identity',     subtitle: 'Tell us about this individual.',   optional: false },
  { title: 'First Photo',  subtitle: 'Capture your new addition.',       optional: true  },
  { title: 'The Home',     subtitle: 'Where does it live?',             optional: true  },
  { title: 'Environment',  subtitle: 'Climate and care notes.',          optional: true  },
];

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

export default function AddTarantulaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('guided');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Restore user's last preferred mode
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then(val => {
      if (val === 'quick' || val === 'guided') setMode(val);
    });
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep(0);
    AsyncStorage.setItem(MODE_KEY, next);
  };

  const [formData, setFormData] = useState<TarantulaData>({
    name: '',
    common_name: '',
    scientific_name: '',
    water_dish: true,
  });

  const update = (fields: Partial<TarantulaData>) =>
    setFormData(prev => ({ ...prev, ...fields }));

  const animateTo = (nextStep: number) => {
    const direction = nextStep > step ? 1 : -1;
    slideAnim.setValue(direction * SCREEN_WIDTH);
    setStep(nextStep);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 68,
      friction: 11,
      useNativeDriver: true,
    }).start();
  };

  const goNext = () => { if (step < STEPS.length - 1) animateTo(step + 1); };
  const goBack = () => { if (step > 0) animateTo(step - 1); };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery access is needed to select a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const uploadPhoto = async (tarantulaId: string) => {
    if (!photoUri) return;
    try {
      const filename = photoUri.split('/').pop() || 'photo.jpg';
      const ext = /\.(\w+)$/.exec(filename);
      const type = ext ? `image/${ext[1]}` : 'image/jpeg';
      const formData = new FormData();
      formData.append('file', { uri: photoUri, name: filename, type } as any);
      if (photoCaption) formData.append('caption', photoCaption);
      await apiClient.post(`/tarantulas/${tarantulaId}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (err) {
      console.warn('Photo upload failed (non-critical):', err);
    }
  };

  const handleSave = async () => {
    if (!formData.common_name && !formData.scientific_name && !formData.name) {
      Alert.alert('Required', 'Please enter at least a species or name.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.post('/tarantulas/', formData);
      const tarantulaId = response.data.id;
      await uploadPhoto(tarantulaId);
      router.replace(`/tarantula/${tarantulaId}`);
    } catch (error: any) {
      if (error.response?.status === 402) {
        setShowUpgradeModal(true);
        setSaving(false);
        return;
      }
      const detail = error.response?.data?.detail;
      const message = typeof detail === 'object' && detail !== null
        ? detail.message || JSON.stringify(detail)
        : detail || 'Failed to add tarantula';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const isLastStep = step === STEPS.length - 1;
  const canSkip = STEPS[step].optional;

  // ─── Step renderers ────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepContent}>
        <Text style={[styles.stepHint, { color: colors.textSecondary }]}>
          Search our species database to auto-fill names and care details.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Species Lookup</Text>
          <SpeciesAutocomplete
            onSelect={(species) => update({
              species_id: species.id,
              scientific_name: species.scientific_name,
              common_name: species.common_names[0] || '',
            })}
            placeholder="Search by name..."
          />
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or enter manually</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Common Name</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={formData.common_name}
            onChangeText={(t) => update({ common_name: t })}
            placeholder="e.g., Mexican Redknee"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Scientific Name</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={formData.scientific_name}
            onChangeText={(t) => update({ scientific_name: t })}
            placeholder="e.g., Brachypelma hamorii"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
          />
        </View>
      </View>
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepContent}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Pet Name</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={formData.name}
            onChangeText={(t) => update({ name: t })}
            placeholder="e.g., Rosie (optional)"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Sex</Text>
          <View style={styles.chipRow}>
            {[
              { label: '♂  Male',     value: 'male'    },
              { label: '♀  Female',   value: 'female'  },
              { label: '?  Unknown',  value: 'unknown' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  formData.sex === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => update({ sex: opt.value })}
                activeOpacity={0.75}
              >
                <Text style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  formData.sex === opt.value && { color: '#fff', fontWeight: '600' },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Date Acquired</Text>
          <DateInput
            value={formData.date_acquired ? new Date(formData.date_acquired) : new Date()}
            onChange={(date) => update({ date_acquired: date.toISOString().split('T')[0] })}
            maximumDate={new Date()}
            label="Date Acquired"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Source</Text>
          <View style={styles.chipRow}>
            {[
              { label: 'Bred',        value: 'bred'        },
              { label: 'Bought',      value: 'bought'      },
              { label: 'Wild Caught', value: 'wild_caught' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  formData.source === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => update({ source: opt.value })}
                activeOpacity={0.75}
              >
                <Text style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  formData.source === opt.value && { color: '#fff', fontWeight: '600' },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepContent}>
        {photoUri ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
            <TouchableOpacity
              style={styles.photoRemove}
              onPress={() => setPhotoUri(null)}
            >
              <MaterialCommunityIcons name="close-circle" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.photoPlaceholder, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
            <MaterialCommunityIcons name="camera-plus-outline" size={52} color={colors.textTertiary} />
            <Text style={[styles.photoPlaceholderText, { color: colors.textTertiary }]}>
              No photo yet
            </Text>
          </View>
        )}

        <View style={styles.photoActions}>
          <TouchableOpacity
            style={[styles.photoBtn, { backgroundColor: colors.primary }]}
            onPress={takePhoto}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="camera" size={22} color="#fff" />
            <Text style={styles.photoBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoBtn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border }]}
            onPress={pickPhoto}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="image-multiple" size={22} color={colors.textPrimary} />
            <Text style={[styles.photoBtnText, { color: colors.textPrimary }]}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {photoUri && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Caption (optional)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={photoCaption}
              onChangeText={setPhotoCaption}
              placeholder="e.g., Day 1 photo"
              placeholderTextColor={colors.textTertiary}
              maxLength={200}
            />
          </View>
        )}

        <Text style={[styles.photoTip, { color: colors.textTertiary }]}>
          You can always add more photos from the tarantula detail page.
        </Text>
      </View>
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepContent}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Enclosure Type</Text>
          <View style={styles.iconCardRow}>
            {[
              { label: 'Terrestrial', value: 'terrestrial', icon: 'terrain'  },
              { label: 'Arboreal',    value: 'arboreal',    icon: 'tree'     },
              { label: 'Fossorial',   value: 'fossorial',   icon: 'tunnel'   },
            ].map(opt => {
              const active = formData.enclosure_type === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.iconCard,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    active && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
                  ]}
                  onPress={() => update({ enclosure_type: opt.value })}
                  activeOpacity={0.75}
                >
                  <MaterialCommunityIcons
                    name={opt.icon as any}
                    size={28}
                    color={active ? colors.primary : colors.textTertiary}
                  />
                  <Text style={[
                    styles.iconCardText,
                    { color: active ? colors.primary : colors.textSecondary },
                    active && { fontWeight: '600' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Enclosure Size</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={formData.enclosure_size}
            onChangeText={(t) => update({ enclosure_size: t })}
            placeholder="e.g., 10x10x10 inches"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Substrate Type</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={formData.substrate_type}
              onChangeText={(t) => update({ substrate_type: t })}
              placeholder="Coco fiber"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Depth</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={formData.substrate_depth}
              onChangeText={(t) => update({ substrate_depth: t })}
              placeholder="3 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Last Substrate Change</Text>
          <DateInput
            value={formData.last_substrate_change ? new Date(formData.last_substrate_change) : new Date()}
            onChange={(date) => update({ last_substrate_change: date.toISOString().split('T')[0] })}
            maximumDate={new Date()}
            label="Last Substrate Change"
          />
        </View>
      </View>
    </ScrollView>
  );

  const renderStep4 = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepContent}>
        <View style={styles.twoCol}>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Min Temp °F</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={formData.target_temp_min?.toString()}
              onChangeText={(t) => update({ target_temp_min: t ? parseInt(t) : undefined })}
              placeholder="72"
              keyboardType="numeric"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Temp °F</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={formData.target_temp_max?.toString()}
              onChangeText={(t) => update({ target_temp_max: t ? parseInt(t) : undefined })}
              placeholder="78"
              keyboardType="numeric"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Min Humidity %</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={formData.target_humidity_min?.toString()}
              onChangeText={(t) => update({ target_humidity_min: t ? parseInt(t) : undefined })}
              placeholder="60"
              keyboardType="numeric"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Humidity %</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={formData.target_humidity_max?.toString()}
              onChangeText={(t) => update({ target_humidity_max: t ? parseInt(t) : undefined })}
              placeholder="70"
              keyboardType="numeric"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Misting Schedule</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={formData.misting_schedule}
            onChangeText={(t) => update({ misting_schedule: t })}
            placeholder="e.g., Twice weekly"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <TouchableOpacity
          style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => update({ water_dish: !formData.water_dish })}
          activeOpacity={0.75}
        >
          <View style={styles.toggleLabel}>
            <MaterialCommunityIcons name="water" size={22} color={colors.primary} />
            <Text style={[styles.toggleText, { color: colors.textPrimary }]}>Has Water Dish</Text>
          </View>
          <View style={[styles.toggleTrack, { backgroundColor: formData.water_dish ? colors.primary : colors.border }]}>
            <View style={[styles.toggleKnob, { transform: [{ translateX: formData.water_dish ? 18 : 0 }] }]} />
          </View>
        </TouchableOpacity>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={formData.notes}
            onChangeText={(t) => update({ notes: t })}
            placeholder="Anything worth noting..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </View>
    </ScrollView>
  );

  const stepRenderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  // ─── Quick (full-form) renderer ────────────────────────────────────────────

  const renderQuickForm = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.stepContent}>
        {/* Species */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Species</Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Species Lookup</Text>
          <SpeciesAutocomplete
            onSelect={(species) => update({
              species_id: species.id,
              scientific_name: species.scientific_name,
              common_name: species.common_names[0] || '',
            })}
            placeholder="Search by name..."
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Common Name</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.common_name} onChangeText={(t) => update({ common_name: t })} placeholder="e.g., Mexican Redknee" placeholderTextColor={colors.textTertiary} />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Scientific Name</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.scientific_name} onChangeText={(t) => update({ scientific_name: t })} placeholder="e.g., Brachypelma hamorii" placeholderTextColor={colors.textTertiary} autoCapitalize="words" />
        </View>

        {/* Identity */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 28 }]}>Identity</Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Pet Name</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.name} onChangeText={(t) => update({ name: t })} placeholder="e.g., Rosie (optional)" placeholderTextColor={colors.textTertiary} />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Sex</Text>
          <View style={styles.chipRow}>
            {[{ label: '♂  Male', value: 'male' }, { label: '♀  Female', value: 'female' }, { label: '?  Unknown', value: 'unknown' }].map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, formData.sex === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => update({ sex: opt.value })} activeOpacity={0.75}>
                <Text style={[styles.chipText, { color: colors.textSecondary }, formData.sex === opt.value && { color: '#fff', fontWeight: '600' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Date Acquired</Text>
          <DateInput value={formData.date_acquired ? new Date(formData.date_acquired) : new Date()} onChange={(date) => update({ date_acquired: date.toISOString().split('T')[0] })} maximumDate={new Date()} label="Date Acquired" />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Source</Text>
          <View style={styles.chipRow}>
            {[{ label: 'Bred', value: 'bred' }, { label: 'Bought', value: 'bought' }, { label: 'Wild Caught', value: 'wild_caught' }].map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, formData.source === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => update({ source: opt.value })} activeOpacity={0.75}>
                <Text style={[styles.chipText, { color: colors.textSecondary }, formData.source === opt.value && { color: '#fff', fontWeight: '600' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Enclosure */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 28 }]}>Enclosure</Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
          <View style={styles.iconCardRow}>
            {[{ label: 'Terrestrial', value: 'terrestrial', icon: 'terrain' }, { label: 'Arboreal', value: 'arboreal', icon: 'tree' }, { label: 'Fossorial', value: 'fossorial', icon: 'tunnel' }].map(opt => {
              const active = formData.enclosure_type === opt.value;
              return (
                <TouchableOpacity key={opt.value} style={[styles.iconCard, { borderColor: colors.border, backgroundColor: colors.surface }, active && { borderColor: colors.primary, backgroundColor: colors.primary + '18' }]} onPress={() => update({ enclosure_type: opt.value })} activeOpacity={0.75}>
                  <MaterialCommunityIcons name={opt.icon as any} size={24} color={active ? colors.primary : colors.textTertiary} />
                  <Text style={[styles.iconCardText, { color: active ? colors.primary : colors.textSecondary }, active && { fontWeight: '600' }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Enclosure Size</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.enclosure_size} onChangeText={(t) => update({ enclosure_size: t })} placeholder="e.g., 10x10x10 inches" placeholderTextColor={colors.textTertiary} />
        </View>
        <View style={styles.twoCol}>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Substrate</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.substrate_type} onChangeText={(t) => update({ substrate_type: t })} placeholder="Coco fiber" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Depth</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.substrate_depth} onChangeText={(t) => update({ substrate_depth: t })} placeholder="3 inches" placeholderTextColor={colors.textTertiary} />
          </View>
        </View>

        {/* Environment */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 28 }]}>Environment</Text>
        <View style={styles.twoCol}>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Min Temp °F</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.target_temp_min?.toString()} onChangeText={(t) => update({ target_temp_min: t ? parseInt(t) : undefined })} placeholder="72" keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Temp °F</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.target_temp_max?.toString()} onChangeText={(t) => update({ target_temp_max: t ? parseInt(t) : undefined })} placeholder="78" keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Min Humidity %</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.target_humidity_min?.toString()} onChangeText={(t) => update({ target_humidity_min: t ? parseInt(t) : undefined })} placeholder="60" keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={[styles.field, styles.colHalf]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Humidity %</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.target_humidity_max?.toString()} onChangeText={(t) => update({ target_humidity_max: t ? parseInt(t) : undefined })} placeholder="70" keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
          </View>
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Misting Schedule</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.misting_schedule} onChangeText={(t) => update({ misting_schedule: t })} placeholder="e.g., Twice weekly" placeholderTextColor={colors.textTertiary} />
        </View>
        <TouchableOpacity style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => update({ water_dish: !formData.water_dish })} activeOpacity={0.75}>
          <View style={styles.toggleLabel}>
            <MaterialCommunityIcons name="water" size={22} color={colors.primary} />
            <Text style={[styles.toggleText, { color: colors.textPrimary }]}>Has Water Dish</Text>
          </View>
          <View style={[styles.toggleTrack, { backgroundColor: formData.water_dish ? colors.primary : colors.border }]}>
            <View style={[styles.toggleKnob, { transform: [{ translateX: formData.water_dish ? 18 : 0 }] }]} />
          </View>
        </TouchableOpacity>

        {/* Notes */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 28 }]}>Notes</Text>
        <View style={styles.field}>
          <TextInput style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]} value={formData.notes} onChangeText={(t) => update({ notes: t })} placeholder="Anything worth noting..." placeholderTextColor={colors.textTertiary} multiline numberOfLines={4} textAlignVertical="top" />
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 28 }, saving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="check" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Save Tarantula</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ─── UI ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.grow}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={mode === 'quick' || step === 0 ? () => router.back() : goBack}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name={mode === 'quick' || step === 0 ? 'close' : 'arrow-left'}
              size={24}
              color={colors.textPrimary}
            />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {mode === 'quick' ? 'Add Tarantula' : STEPS[step].title}
            </Text>
            {mode === 'guided' && (
              <Text style={[styles.headerSub, { color: colors.textTertiary }]}>
                Step {step + 1} of {STEPS.length}
              </Text>
            )}
          </View>

          {/* Mode toggle */}
          <TouchableOpacity
            onPress={() => switchMode(mode === 'guided' ? 'quick' : 'guided')}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name={mode === 'guided' ? 'view-list' : 'cards-outline'}
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* Progress bar — guided only */}
        {mode === 'guided' && (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${((step + 1) / STEPS.length) * 100}%`,
                },
              ]}
            />
          </View>
        )}

        {/* Subtitle — guided only */}
        {mode === 'guided' && (
          <View style={[styles.subtitleBar, { backgroundColor: colors.background }]}>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {STEPS[step].subtitle}
            </Text>
          </View>
        )}

        {/* Content */}
        {mode === 'quick' ? (
          renderQuickForm()
        ) : (
          <>
            <Animated.View style={[styles.grow, { transform: [{ translateX: slideAnim }] }]}>
              {stepRenderers[step]()}
            </Animated.View>

            {/* Footer — guided only */}
            <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              {isLastStep ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }, saving && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={20} color="#fff" />
                      <Text style={styles.primaryBtnText}>Save Tarantula</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={goNext}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>

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

const styles = StyleSheet.create({
  container:            { flex: 1 },
  grow:                 { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn:            { width: 52, alignItems: 'center', justifyContent: 'center' },
  headerCenter:         { flex: 1, alignItems: 'center' },
  headerTitle:          { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  headerSub:            { fontSize: 12, marginTop: 2 },
  skipText:             { fontSize: 15, fontWeight: '500' },
  progressTrack:        { height: 3 },
  progressFill:         { height: 3, borderRadius: 2 },
  subtitleBar:          { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 },
  subtitle:             { fontSize: 14 },
  stepContent:          { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },
  stepHint:             { fontSize: 14, marginBottom: 4, lineHeight: 20 },
  field:                { marginTop: 18 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  textArea:             { minHeight: 110, textAlignVertical: 'top' },
  twoCol:               { flexDirection: 'row', gap: 12 },
  colHalf:              { flex: 1 },
  chipRow:              { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  chipText:             { fontSize: 15 },
  iconCardRow:          { flexDirection: 'row', gap: 10 },
  iconCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  iconCardText:         { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  dividerRow:           { flexDirection: 'row', alignItems: 'center', marginTop: 22, gap: 10 },
  dividerLine:          { flex: 1, height: 1 },
  dividerText:          { fontSize: 13 },
  photoPreview: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    height: 240,
  },
  photoImage:           { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
  },
  photoPlaceholder: {
    marginTop: 8,
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  photoPlaceholderText: { fontSize: 15 },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  photoBtnText:         { fontSize: 15, fontWeight: '600', color: '#fff' },
  photoTip:             { fontSize: 13, textAlign: 'center', marginTop: 20 },
  sectionHeading:       { fontSize: 16, fontWeight: '700', marginTop: 8 },
  toggleRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleLabel:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleText:           { fontSize: 16, fontWeight: '500' },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  footer:               { padding: 16, borderTopWidth: 1 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  btnDisabled:          { opacity: 0.6 },
  primaryBtnText:       { color: '#fff', fontSize: 17, fontWeight: '700' },
});
