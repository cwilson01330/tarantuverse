/**
 * Unified "Add to collection" — design handoff, screen 7.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Tap FAB → pick one of eleven taxa in a bottom sheet → land in one of three
 * forms → choose between two form modes → fill up to 22 fields. That's four
 * decisions before the keeper types anything, none of which they're thinking
 * about. They're thinking "I bought a Curly Hair."
 *
 * So: SPECIES FIRST. Picking the species sets the taxon, which selects the
 * create endpoint. That retires AddPickerSheet entirely — no taxon picker,
 * no glyph collisions, no unreachable Colony row.
 *
 * PREFILL IS THE POINT. `invert_species` already carries enclosure sizes,
 * substrate, and temp/humidity ranges. The old form asked keepers to retype
 * all of it. Here it's applied by default and shown as a summary they can
 * switch off — visible, not silent, because guessing on someone's behalf and
 * hiding it is how you get wrong data people don't notice.
 *
 * The old wizard's `quickMode` toggle and `currentStep` state are gone; they
 * existed because the form was too long in either mode.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import DateInput from '../src/components/DateInput';
import { parseLocalDate, toISODateLocal } from '../src/utils/date';
import { getImageUrl } from '../src/utils/image-url';
import { INVERT_TAXA } from '../src/lib/inverts';
import { careLevelMeta } from '../src/components/caresheet';
import {
  loadSpeciesCatalog,
  searchCatalog,
  type CatalogSpecies,
} from '../src/lib/species-catalog';

const UpgradeModal = React.lazy(() => import('../src/components/UpgradeModal'));

type Sex = 'male' | 'female' | 'unknown';
type LifeStage = 'sling' | 'juvenile' | 'adult';
type Mode = 'individual' | 'colony';

/**
 * Taxon glyph. Deliberately EMOJI, not MaterialCommunityIcons: the bundled
 * MDI set is missing several names the docs list ('spider' and
 * 'ladybug-outline' render blank / "?" on device). Emoji always draw. Revisit
 * once the icon font has been audited.
 */
function taxonEmoji(taxon: string): string {
  if (taxon === 'tarantula') return '🕷️';
  return (INVERT_TAXA as any)[taxon]?.glyph ?? '🐾';
}

function taxonName(taxon: string): string {
  if (taxon === 'tarantula') return 'Tarantula';
  return (INVERT_TAXA as any)[taxon]?.label ?? taxon;
}

function AddScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Entry from a care sheet's "Add to collection" preselects the species.
  const { speciesId: preselectId } = useLocalSearchParams<{ speciesId?: string }>();

  const [catalog, setCatalog] = useState<CatalogSpecies[]>([]);
  const [catalogPartial, setCatalogPartial] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogSpecies | null>(null);
  const [manual, setManual] = useState(false);

  const [mode, setMode] = useState<Mode>('individual');
  const [nickname, setNickname] = useState('');
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [lifeStage, setLifeStage] = useState<LifeStage>('juvenile');

  const [prefill, setPrefill] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const [dateAcquired, setDateAcquired] = useState('');
  const [source, setSource] = useState<string>('');
  const [pricePaid, setPricePaid] = useState('');
  const [lastFed, setLastFed] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { species, partial } = await loadSpeciesCatalog();
        setCatalog(species);
        setCatalogPartial(partial);
        if (preselectId) {
          const match = species.find((s) => s.id === preselectId);
          if (match) choose(match);
        }
      } finally {
        setCatalogLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectId]);

  const results = useMemo(() => searchCatalog(catalog, query), [catalog, query]);

  const choose = useCallback((s: CatalogSpecies) => {
    setPicked(s);
    setManual(false);
    setQuery('');
    setScientificName(s.scientific_name);
    setCommonName(s.common_names?.[0] ?? '');
    // Colony mode only makes sense for taxa people actually keep communally.
    if (s.taxon === 'tarantula') setMode('individual');
  }, []);

  const clearPick = () => {
    setPicked(null);
    setScientificName('');
    setCommonName('');
    setMode('individual');
  };

  /** Husbandry values the care sheet supplies, shown so the keeper can see
   *  exactly what's being applied rather than trusting a silent toggle. */
  const prefillSummary = useMemo(() => {
    if (!picked) return [];
    const out: string[] = [];
    const enc =
      lifeStage === 'sling'
        ? picked.enclosure_size_sling
        : lifeStage === 'adult'
        ? picked.enclosure_size_adult
        : picked.enclosure_size_juvenile;
    if (enc) out.push(enc);
    if (picked.substrate_type) out.push(picked.substrate_type);
    if (picked.substrate_depth) out.push(`${picked.substrate_depth} deep`);
    if (picked.temperature_min && picked.temperature_max)
      out.push(`${picked.temperature_min}–${picked.temperature_max}°F`);
    if (picked.humidity_min && picked.humidity_max)
      out.push(`${picked.humidity_min}–${picked.humidity_max}%`);
    return out;
  }, [picked, lifeStage]);

  const displayName = nickname || commonName || scientificName || 'animal';
  const canSave = !!(scientificName.trim() || commonName.trim() || nickname.trim());

  /**
   * Husbandry defaults from the care sheet.
   *
   * Target-aware because the two create schemas differ: `ColonyBase` has no
   * `enclosure_type` / `enclosure_size` fields. Pydantic would silently drop
   * them (extra='ignore'), so sending them anyway would "work" while quietly
   * throwing data away — better to be explicit about what each accepts.
   */
  const buildHusbandry = (target: 'animal' | 'colony') => {
    if (!prefill || !picked) return {};
    const shared = {
      substrate_type: picked.substrate_type ?? undefined,
      substrate_depth: picked.substrate_depth ?? undefined,
      target_temp_min: picked.temperature_min ?? undefined,
      target_temp_max: picked.temperature_max ?? undefined,
      target_humidity_min: picked.humidity_min ?? undefined,
      target_humidity_max: picked.humidity_max ?? undefined,
      water_dish:
        typeof picked.water_dish_required === 'boolean'
          ? picked.water_dish_required
          : undefined,
    };
    if (target === 'colony') return shared;

    const enc =
      lifeStage === 'sling'
        ? picked.enclosure_size_sling
        : lifeStage === 'adult'
        ? picked.enclosure_size_adult
        : picked.enclosure_size_juvenile;
    return {
      ...shared,
      enclosure_type: picked.type ?? undefined,
      enclosure_size: enc ?? undefined,
    };
  };

  const save = async (addAnother: boolean) => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const taxon = picked?.taxon ?? 'other';
      const husbandry = buildHusbandry(mode === 'colony' ? 'colony' : 'animal');

      if (mode === 'colony') {
        // Colonies are a different endpoint AND a different concept — this
        // toggle is how the feature becomes discoverable now that the taxon
        // picker (where it was row 11, below the fold) is retired.
        await apiClient.post('/colonies/', {
          name: nickname || commonName || scientificName,
          taxon,
          species_id: picked?.id ?? null,
          stage_counts: { mixed: 0 },
          count_is_estimated: true,
          notes: notes || null,
          ...husbandry,
        });
      } else if (taxon === 'tarantula') {
        const created = await apiClient.post('/tarantulas/', {
          name: nickname || null,
          common_name: commonName || '',
          scientific_name: scientificName || '',
          species_id: picked?.id,
          sex,
          life_stage: lifeStage,
          date_acquired: dateAcquired || undefined,
          source: source || undefined,
          price_paid: pricePaid ? Number(pricePaid) : undefined,
          notes: notes || undefined,
          ...husbandry,
        });
        await seedFirstFeeding(`/tarantulas/${created.data?.id}/feedings`);
      } else {
        const created = await apiClient.post('/inverts/', {
          taxon,
          name: nickname || null,
          common_name: commonName || null,
          scientific_name: scientificName || null,
          species_id: picked?.id ?? null,
          sex,
          life_stage: lifeStage,
          date_acquired: dateAcquired || null,
          source: source || null,
          price_paid: pricePaid ? Number(pricePaid) : null,
          notes: notes || null,
          ...husbandry,
        });
        await seedFirstFeeding(`/inverts/${created.data?.id}/feedings`);
      }

      if (addAnother) {
        // Keep the species selected — someone unboxing a shipment of slings
        // is adding the same species repeatedly.
        setNickname('');
        setSex('unknown');
        setNotes('');
        setPricePaid('');
        setLastFed('');
        Alert.alert('Added', `${displayName} saved. Add another?`);
      } else {
        router.replace('/(tabs)/collection' as any);
      }
    } catch (e: any) {
      // 402 = free-tier cap. Same treatment as every other create path.
      if (e?.response?.status === 402) setShowUpgrade(true);
      else Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /** Non-fatal by design: the animal is saved either way, and failing the
   *  whole add over a log would be a far worse trade. */
  const seedFirstFeeding = async (path: string) => {
    if (!lastFed) return;
    try {
      await apiClient.post(path, { fed_at: new Date(lastFed).toISOString(), accepted: true });
    } catch {
      /* ignore */
    }
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <MaterialCommunityIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add to collection</Text>
        <TouchableOpacity
          onPress={() => router.push('/import' as any)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Import from a spreadsheet"
        >
          <MaterialCommunityIcons name="tray-arrow-down" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        // 'height' on Android — SDK 54 edge-to-edge makes `undefined` leave
        // the keyboard covering the field.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ---------------------------------------------------------- */}
          <Text style={styles.sectionLabel}>WHAT IS IT?</Text>

          {picked ? (
            <View style={styles.pickedCard}>
              <View style={styles.pickedThumb}>
                {picked.image_url ? (
                  <Image
                    source={{ uri: getImageUrl(picked.image_url) }}
                    style={StyleSheet.absoluteFill as any}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 22 }}>{taxonEmoji(picked.taxon)}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickedName} numberOfLines={1}>
                  {picked.common_names?.[0] || picked.scientific_name}
                </Text>
                <Text style={styles.pickedSci} numberOfLines={1}>
                  {picked.scientific_name}
                </Text>
                <Text style={styles.pickedTaxon}>
                  {taxonEmoji(picked.taxon)} {taxonName(picked.taxon)} · taxon set automatically
                </Text>
              </View>
              <TouchableOpacity onPress={clearPick} accessibilityLabel="Choose a different species">
                <MaterialCommunityIcons name="close-circle" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={21} color={colors.textTertiary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search species by name…"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.searchInput}
                  autoCorrect={false}
                  autoFocus={!preselectId}
                />
                {catalogLoading && <ActivityIndicator size="small" color={colors.primary} />}
              </View>

              {catalogPartial && (
                <Text style={styles.warnLine}>
                  Some of the catalog didn&apos;t load — search may be incomplete.
                </Text>
              )}

              {results.length > 0 && (
                <View style={styles.results}>
                  {results.map((s) => {
                    const care = careLevelMeta(s.care_level, colors.textSecondary);
                    return (
                      <TouchableOpacity
                        key={`${s.taxon}-${s.id}`}
                        style={styles.resultRow}
                        onPress={() => choose(s)}
                      >
                        <View style={styles.resultThumb}>
                          {s.image_url ? (
                            <Image
                              source={{ uri: getImageUrl(s.image_url) }}
                              style={StyleSheet.absoluteFill as any}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={{ fontSize: 18 }}>{taxonEmoji(s.taxon)}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {s.common_names?.[0] || s.scientific_name}
                          </Text>
                          <Text style={styles.resultSci} numberOfLines={1}>
                            {s.scientific_name}
                          </Text>
                        </View>
                        {!!s.care_level && (
                          <View style={[styles.pill, { backgroundColor: care.color + '24' }]}>
                            <Text style={[styles.pillText, { color: care.color }]}>
                              {care.text}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {!!query && results.length === 0 && !catalogLoading && (
                <Text style={styles.warnLine}>No species matched “{query}”.</Text>
              )}

              <TouchableOpacity style={styles.manualRow} onPress={() => setManual(true)}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
                <Text style={styles.manualText}>Not listed — enter manually</Text>
              </TouchableOpacity>
            </>
          )}

          {manual && !picked && (
            <View style={{ gap: 10, marginTop: 10 }}>
              <Field label="Common name" colors={colors} styles={styles}>
                <TextInput
                  style={styles.input}
                  value={commonName}
                  onChangeText={setCommonName}
                  placeholder="e.g. Curly Hair"
                  placeholderTextColor={colors.textTertiary}
                />
              </Field>
              <Field label="Scientific name" colors={colors} styles={styles}>
                <TextInput
                  style={styles.input}
                  value={scientificName}
                  onChangeText={setScientificName}
                  placeholder="e.g. Tliltocatl albopilosus"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                />
              </Field>
              <Text style={styles.hintLine}>
                Manual entries aren&apos;t linked to a care sheet, so there&apos;s nothing to
                prefill from.
              </Text>
            </View>
          )}

          {/* --- individual vs population --------------------------------- */}
          {!!picked && picked.taxon !== 'tarantula' && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 22 }]}>HOW ARE YOU KEEPING IT?</Text>
              <View style={styles.segment}>
                <SegmentButton
                  label="One animal"
                  active={mode === 'individual'}
                  onPress={() => setMode('individual')}
                  colors={colors}
                  styles={styles}
                />
                <SegmentButton
                  label="A population"
                  active={mode === 'colony'}
                  onPress={() => setMode('colony')}
                  colors={colors}
                  styles={styles}
                />
              </View>
              {mode === 'colony' && (
                <Text style={styles.hintLine}>
                  Tracked as one entry with headcounts rather than individual animals. You can
                  set the stage counts after it&apos;s created.
                </Text>
              )}
            </>
          )}

          {/* --- naming --------------------------------------------------- */}
          <Text style={[styles.sectionLabel, { marginTop: 22 }]}>
            {mode === 'colony' ? 'NAME THE COLONY' : 'WHAT DO YOU CALL IT?'}
          </Text>
          <Field label="Nickname" colors={colors} styles={styles}>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Optional"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
            />
          </Field>

          {mode === 'individual' && (
            <>
              <Text style={styles.miniLabel}>Sex</Text>
              <View style={styles.segment}>
                {(['female', 'male', 'unknown'] as Sex[]).map((s) => (
                  <SegmentButton
                    key={s}
                    label={s === 'unknown' ? 'Unknown' : s === 'male' ? 'Male' : 'Female'}
                    active={sex === s}
                    onPress={() => setSex(s)}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </View>

              <Text style={styles.miniLabel}>Life stage</Text>
              <View style={styles.segment}>
                {(['sling', 'juvenile', 'adult'] as LifeStage[]).map((s) => (
                  <SegmentButton
                    key={s}
                    label={s.charAt(0).toUpperCase() + s.slice(1)}
                    active={lifeStage === s}
                    onPress={() => setLifeStage(s)}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </View>
            </>
          )}

          {/* --- prefill -------------------------------------------------- */}
          {!!picked && prefillSummary.length > 0 && (
            <View style={styles.prefillCard}>
              <MaterialCommunityIcons name="auto-fix" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.prefillTitle}>Use the care sheet&apos;s husbandry</Text>
                <Text style={styles.prefillBody}>{prefillSummary.join(' · ')}</Text>
              </View>
              <Switch
                value={prefill}
                onValueChange={setPrefill}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          )}

          {/* --- collapsed detail ---------------------------------------- */}
          <Collapsed
            title="Provenance"
            icon="tag-outline"
            preview={dateAcquired ? `Acquired ${dateAcquired}` : 'Not set'}
            open={openSection === 'prov'}
            onToggle={() => setOpenSection(openSection === 'prov' ? null : 'prov')}
            colors={colors}
            styles={styles}
          >
            {/* State stays an ISO string (what the API wants); DateInput
                works in Date objects. Convert at the boundary, matching the
                pattern in invert/add.tsx. `?? new Date()` only supplies what
                the picker OPENS on — it doesn't write a value, so leaving
                the field untouched still sends nothing. */}
            <Field label="Date acquired" colors={colors} styles={styles}>
              <DateInput
                value={parseLocalDate(dateAcquired) ?? new Date()}
                onChange={(d) => setDateAcquired(toISODateLocal(d))}
                maximumDate={new Date()}
                label="Date acquired"
              />
            </Field>
            <Text style={styles.miniLabel}>Source</Text>
            <View style={styles.segment}>
              {['bred', 'bought', 'wild_caught'].map((s) => (
                <SegmentButton
                  key={s}
                  label={s === 'wild_caught' ? 'Wild caught' : s.charAt(0).toUpperCase() + s.slice(1)}
                  active={source === s}
                  onPress={() => setSource(source === s ? '' : s)}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>
            <Field label="Price paid" colors={colors} styles={styles}>
              <TextInput
                style={styles.input}
                value={pricePaid}
                onChangeText={setPricePaid}
                placeholder="Optional"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </Field>
          </Collapsed>

          <Collapsed
            title="Enclosure & environment"
            icon="home-outline"
            preview={prefill && prefillSummary.length ? 'Prefilled' : 'Not set'}
            previewAccent={prefill && prefillSummary.length > 0}
            open={openSection === 'env'}
            onToggle={() => setOpenSection(openSection === 'env' ? null : 'env')}
            colors={colors}
            styles={styles}
          >
            <Text style={styles.hintLine}>
              {prefill && prefillSummary.length
                ? `Using the care sheet's values: ${prefillSummary.join(' · ')}. Turn the prefill off above to leave these blank, then edit the animal to set your own.`
                : 'Nothing set. You can fill this in from the animal’s husbandry tab once it exists.'}
            </Text>
          </Collapsed>

          <Collapsed
            title="Notes & first feeding"
            icon="note-text-outline"
            preview={lastFed ? `Fed ${lastFed}` : notes ? 'Has notes' : 'Not set'}
            open={openSection === 'notes'}
            onToggle={() => setOpenSection(openSection === 'notes' ? null : 'notes')}
            colors={colors}
            styles={styles}
          >
            {mode === 'individual' && (
              <Field label="Last fed" colors={colors} styles={styles}>
                <DateInput
                  value={parseLocalDate(lastFed) ?? new Date()}
                  onChange={(d) => setLastFed(toISODateLocal(d))}
                  maximumDate={new Date()}
                  label="Last fed"
                />
              </Field>
            )}
            <Field label="Notes" colors={colors} styles={styles}>
              <TextInput
                style={[styles.input, { height: 88, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor={colors.textTertiary}
                multiline
              />
            </Field>
          </Collapsed>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.primary, !canSave && { opacity: 0.5 }]}
          disabled={!canSave || saving}
          onPress={() => save(false)}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.primaryText} numberOfLines={1}>
                Add {displayName}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          disabled={!canSave || saving}
          onPress={() => save(true)}
          accessibilityRole="button"
          accessibilityLabel="Save and add another"
        >
          <MaterialCommunityIcons
            name="plus-box-multiple-outline"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showUpgrade && (
        <React.Suspense fallback={null}>
          <UpgradeModal visible={showUpgrade} onClose={() => setShowUpgrade(false)} />
        </React.Suspense>
      )}
    </View>
  );
}

function Field({
  label,
  colors,
  styles,
  children,
}: {
  label: string;
  colors: any;
  styles: any;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.miniLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
  colors,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
  styles: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.segmentButton,
        active
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentText, { color: active ? '#fff' : colors.textPrimary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Collapsed({
  title,
  icon,
  preview,
  previewAccent,
  open,
  onToggle,
  colors,
  styles,
  children,
}: {
  title: string;
  icon: string;
  preview: string;
  previewAccent?: boolean;
  open: boolean;
  onToggle: () => void;
  colors: any;
  styles: any;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.collapsed}>
      <TouchableOpacity
        style={styles.collapsedHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <MaterialCommunityIcons name={icon as any} size={18} color={colors.primary} />
        <Text style={styles.collapsedTitle}>{title}</Text>
        {!open && (
          <Text
            style={[
              styles.collapsedPreview,
              previewAccent && { color: colors.accent, fontWeight: '600' },
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
        )}
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1.1,
      color: colors.textTertiary,
      marginBottom: 8,
    },
    miniLabel: { fontSize: 12.5, color: colors.textTertiary, marginBottom: 6, marginTop: 10 },
    hintLine: { fontSize: 12.5, color: colors.textTertiary, lineHeight: 18, marginTop: 8 },
    warnLine: { fontSize: 12.5, color: colors.textTertiary, marginTop: 10 },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    searchInput: { flex: 1, fontSize: 16, color: colors.textPrimary, padding: 0 },

    results: {
      marginTop: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      padding: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    resultThumb: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    resultName: { fontSize: 14.5, fontWeight: '600', color: colors.textPrimary },
    resultSci: { fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },

    manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
    manualText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

    pickedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primary + '14',
    },
    pickedThumb: {
      width: 52,
      height: 52,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    pickedName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    pickedSci: { fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
    pickedTaxon: { fontSize: 11.5, color: colors.textSecondary, marginTop: 3 },

    segment: { flexDirection: 'row', gap: 8 },
    segmentButton: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 11,
      borderWidth: 1,
      alignItems: 'center',
    },
    segmentText: { fontSize: 13, fontWeight: '600' },

    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 11,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.textPrimary,
    },

    prefillCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: 20,
    },
    prefillTitle: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
    prefillBody: { fontSize: 12.5, color: colors.textTertiary, marginTop: 2 },

    collapsed: {
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: 10,
      overflow: 'hidden',
    },
    collapsedHead: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
    collapsedTitle: { fontSize: 14.5, fontWeight: '600', color: colors.textPrimary },
    collapsedPreview: { flex: 1, fontSize: 12, color: colors.textTertiary, textAlign: 'right' },

    pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
    pillText: { fontSize: 11, fontWeight: '700' },

    actionBar: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    primary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 13,
      backgroundColor: colors.primary,
    },
    primaryText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
    secondary: {
      width: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });

export default withErrorBoundary(AddScreen, 'add');
