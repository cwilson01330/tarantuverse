/**
 * Admin: fill in missing species catalog images, from the phone.
 *
 * WHY THIS EXISTS ON MOBILE AND NOT JUST WEB
 * ------------------------------------------
 * The photo is on the phone. Every other route — shell script, web upload —
 * means getting it off the phone first, and that friction is exactly why 220
 * of 413 species still have no picture. Here the flow is: open the enclosure,
 * take the shot, pick the species, done.
 *
 * Camera leads the two options for the same reason. Gallery is the fallback,
 * not the default.
 *
 * SAME GUARDS AS THE WEB SCREEN
 * -----------------------------
 * Gap-filling by default (the list shows what's missing), replacing needs a
 * confirm, and attribution is required. Those rules live on the server —
 * POST /admin/species-images/{id} enforces all three — so this screen can't
 * quietly diverge from the web one.
 *
 * Module-level StyleSheet (the StyleSheet-in-component note).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppHeader } from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/ThemeContext';
import { INVERT_TAXA, type InvertTaxon } from '../../src/lib/inverts';
import {
  listSpeciesImageStatus,
  uploadSpeciesImage,
  type SpeciesImageRow,
} from '../../src/lib/admin-species-images';
import { getErrorMessage } from '../../src/utils/errors';

const ATTRIBUTION_KEY = 'admin_species_image_attribution';

export default function AdminSpeciesImagesScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [rows, setRows] = useState<SpeciesImageRow[]>([]);
  const [totals, setTotals] = useState({ total: 0, withImage: 0 });
  const [taxon, setTaxon] = useState<InvertTaxon | ''>('');
  const [search, setSearch] = useState('');
  const [attribution, setAttribution] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  // Your own name doesn't change between species. Remembering it turns five
  // uploads into five photos rather than five photos and five retypings.
  useEffect(() => {
    AsyncStorage.getItem(ATTRIBUTION_KEY)
      .then((v) => { if (v) setAttribution(v); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSpeciesImageStatus({ taxon: taxon || undefined, missingOnly: true });
      setRows(data.species);
      setTotals({ total: data.total_species, withImage: data.total_with_image });
      setLoadError('');
    } catch (e: any) {
      setLoadError(getErrorMessage(e, 'Could not load the species list.'));
    } finally {
      setLoading(false);
    }
  }, [taxon]);

  useEffect(() => { load(); }, [load]);

  const ensure = async (source: 'camera' | 'gallery') => {
    const res = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!res.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access to photograph a species.'
          : 'Allow photo access to pick an image.',
      );
      return false;
    }
    return true;
  };

  const capture = async (row: SpeciesImageRow, source: 'camera' | 'gallery') => {
    if (!attribution.trim()) {
      Alert.alert('Add a credit first', 'It applies to every image you upload here.');
      return;
    }
    if (!(await ensure(source))) return;

    // 4:3 and quality 0.8 match the rest of the app's photo flows. The server
    // downsizes to 1400px anyway, so shipping a 12MP original would only buy a
    // slower upload on mobile data.
    // Annotated rather than `as const`: the readonly tuple `as const` produces
    // isn't assignable to the mutable MediaType[] the SDK expects, so hoisting
    // these options into a variable broke a shape that type-checks fine when
    // written inline at the call site (as every other photo flow does).
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    };
    const r = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.[0]) return;

    await doUpload(row, r.assets[0].uri);
  };

  const doUpload = async (row: SpeciesImageRow, uri: string) => {
    setBusyId(row.id);
    try {
      const filename = uri.split('/').pop() || 'species.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      const form = new FormData();
      form.append('file', { uri, name: filename, type } as any);
      form.append('attribution', attribution.trim());
      if (row.image_url) form.append('replace', 'true');

      const saved = await uploadSpeciesImage(row.id, form);
      await AsyncStorage.setItem(ATTRIBUTION_KEY, attribution.trim()).catch(() => {});

      // Update in place rather than reloading. The list only shows species
      // WITHOUT an image, so a reload would make the row vanish the instant it
      // succeeded — which reads as "did that work?". Seeing the photo appear
      // is the confirmation.
      setRows((prev) => prev.map((r) => (r.id === row.id
        ? { ...r, image_url: saved.image_url, image_attribution: saved.image_attribution }
        : r)));
      setTotals((t) => ({ ...t, withImage: t.withImage + (row.image_url ? 0 : 1) }));
    } catch (e: any) {
      Alert.alert('Could not upload', getErrorMessage(e, 'Upload failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const onPressUpload = (row: SpeciesImageRow) => {
    const actions: any[] = [
      { text: 'Take photo', onPress: () => capture(row, 'camera') },
      { text: 'Choose from library', onPress: () => capture(row, 'gallery') },
      { text: 'Cancel', style: 'cancel' },
    ];
    if (row.image_url) {
      // Replacing a curated image is not something to do by accident.
      Alert.alert(
        'Replace this image?',
        `${row.scientific_name} already has one.\n\nCurrent credit: ${row.image_attribution || '(none recorded)'}`,
        actions,
      );
      return;
    }
    // Android caps Alert at three buttons — this is exactly three.
    Alert.alert(row.scientific_name, 'Add a catalog photo', actions);
  };

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.scientific_name, ...(r.common_names || [])].join(' ').toLowerCase().includes(q);
  });

  const styles = makeStyles(colors);
  const taxa = Object.keys(INVERT_TAXA) as InvertTaxon[];

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Species images"
        subtitle={`${totals.withImage} of ${totals.total} have a picture`}
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.controls}>
          <Text style={styles.fieldLabel}>Credit — applies to every upload</Text>
          <TextInput
            style={styles.input}
            value={attribution}
            onChangeText={setAttribution}
            placeholder="Cory Wilson, Appalachian Tarantulas"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.hint}>
            Required. Name the morph in the credit when the photo shows one — a Dairy Cow
            standing in for every Porcellio laevis would misrepresent the species.
          </Text>

          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search species…"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
          />

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 10 }}
            data={['' as const, ...taxa]}
            keyExtractor={(t) => t || 'all'}
            contentContainerStyle={{ gap: 8, paddingRight: 16 }}
            renderItem={({ item }) => {
              const selected = taxon === item;
              return (
                <TouchableOpacity
                  onPress={() => setTaxon(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                >
                  <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                    {item ? INVERT_TAXA[item].label : 'All'}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : loadError ? (
          <View style={styles.center}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }}>{loadError}</Text>
            <TouchableOpacity onPress={load} style={styles.retry}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              Nothing missing here — every species in this filter has a picture.
            </Text>
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.thumb}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.thumbImage} />
                  ) : (
                    <Text style={{ fontSize: 22 }}>
                      {INVERT_TAXA[item.taxon as InvertTaxon]?.glyph ?? '🐾'}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sciName} numberOfLines={1}>{item.scientific_name}</Text>
                  {item.common_names?.length > 0 && (
                    <Text style={styles.commonNames} numberOfLines={1}>
                      {item.common_names.join(' · ')}
                    </Text>
                  )}
                  {item.image_attribution ? (
                    <Text style={styles.commonNames} numberOfLines={1}>{item.image_attribution}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => onPressUpload(item)}
                  disabled={busyId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.image_url ? 'Replace' : 'Add'} photo for ${item.scientific_name}`}
                  style={[styles.uploadBtn, { borderColor: colors.primary, opacity: busyId === item.id ? 0.5 : 1 }]}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialCommunityIcons
                      name={item.image_url ? 'refresh' : 'camera'}
                      size={18}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    controls: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    fieldLabel: {
      fontSize: 12, fontWeight: '700', color: colors.textTertiary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
      color: colors.textPrimary, backgroundColor: colors.surface,
    },
    hint: { fontSize: 12, lineHeight: 17, color: colors.textTertiary, marginTop: 6 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.surface, padding: 10,
    },
    thumb: {
      width: 52, height: 52, borderRadius: 8, overflow: 'hidden',
      backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    },
    thumbImage: { width: '100%', height: '100%' },
    sciName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, fontStyle: 'italic' },
    commonNames: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
    uploadBtn: {
      width: 40, height: 40, borderRadius: 20, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    retry: {
      backgroundColor: colors.primary, paddingHorizontal: 18,
      paddingVertical: 10, borderRadius: 10,
    },
  });
