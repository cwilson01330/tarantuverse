/**
 * Import Collection — bring a keeper's reptiles/amphibians in from a
 * Google Sheet link or an uploaded CSV/Excel file.
 *
 * Ported from the proven Tarantuverse mobile screen (apps/mobile/app/
 * import.tsx) onto the Herpetoverse unified `animals` surface. The shared
 * FastAPI import endpoints take a `target` form field — HV always sends
 * `target: 'animal'` so rows land in the animals table (default is
 * 'invert' for Tarantuverse).
 *
 * Flow: pick a source (Sheet link OR uploaded file) + a default taxon →
 * POST /import/analyze returns column inference + a per-row preview →
 * confirm the auto-mapping and duplicate handling → POST /import/commit.
 *
 * apiClient baseURL already includes /api/v1 (see services/api.ts), so
 * the calls here start at /import/... — never /api/v1/import/...
 *
 * Theme: dark-first via ThemeContext. HV has no `error` color — status
 * uses `danger`; on-primary text is #0B0B0B (matches feeding-day.tsx and
 * the collection FAB). expo-document-picker is a native dependency: HV
 * isn't on any store yet, so it batches into the first build.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';
import { ANIMAL_TAXA, ANIMAL_TAXON_ORDER, type AnimalTaxon } from '../src/lib/animals';

type Step = 'source' | 'confirm' | 'result';
type SourceMode = 'sheet' | 'file';
type Confidence = 'high' | 'medium' | 'low' | 'none';
type RowStatus = 'new' | 'duplicate' | 'error';
type DuplicateMode = 'skip' | 'update';

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

interface ColumnInfo {
  header: string;
  suggested_field: string | null;
  confidence: Confidence;
  sample_values: string[];
}

interface FieldInfo {
  field: string;
  label: string;
  type: string;
}

interface PreviewRow {
  row: number;
  display_name: string;
  taxon: string;
  taxon_source: string;
  species_matched: boolean;
  species_name: string | null;
  status: RowStatus;
  errors: string[];
}

interface AnalyzeSummary {
  new: number;
  duplicate: number;
  error_rows: number;
  species_matched: number;
  unmapped_columns: string[];
}

interface AnalyzeResponse {
  row_count: number;
  columns: ColumnInfo[];
  fields: FieldInfo[];
  taxa: string[];
  default_taxon: string;
  preview: PreviewRow[];
  summary: AnalyzeSummary;
}

interface CommitResponse {
  imported: number;
  updated: number;
  skipped_duplicates: number;
  error_rows: number;
  errors: string[];
  cap_reached: boolean;
}

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#dc2626',
  none: '#6b7280',
};

function statusMeta(status: RowStatus) {
  switch (status) {
    case 'duplicate':
      return { label: 'Duplicate', color: '#d97706' };
    case 'error':
      return { label: 'Error', color: '#dc2626' };
    default:
      return { label: 'New', color: '#16a34a' };
  }
}

function titleCase(s: string): string {
  return s
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Display label for a taxon — prefer the ANIMAL_TAXA registry so HV
 * herp groups read as "Snake" / "Frogs & toads" rather than a raw slug.
 * Falls back to title-case for any taxon the registry doesn't know.
 */
function taxonLabel(t: string): string {
  return ANIMAL_TAXA[t as AnimalTaxon]?.label ?? titleCase(t);
}

function ImportScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('source');

  // Source state
  const [sourceMode, setSourceMode] = useState<SourceMode>('sheet');
  const [sheetUrl, setSheetUrl] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  // Default-taxon options: the ANIMAL_TAXA registry before analyze, then
  // whatever the analyze response returned (the backend echoes the taxa
  // it recognized). Default is 'snake' — HV's most common keep.
  const [taxa, setTaxa] = useState<string[]>([...ANIMAL_TAXON_ORDER]);
  const [defaultTaxon, setDefaultTaxon] = useState<string>('snake');
  const [taxonPickerOpen, setTaxonPickerOpen] = useState(false);

  // Analyze result / confirm state
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [fieldPickerHeader, setFieldPickerHeader] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<CommitResponse | null>(null);

  // Shared UI state
  const [analyzing, setAnalyzing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');

  const backAction =
    step === 'source' ? (
      <HeaderBackButton />
    ) : (
      <TouchableOpacity
        onPress={() => {
          if (step === 'confirm') setStep('source');
          else if (step === 'result') resetAll();
        }}
        accessibilityLabel="Back"
        hitSlop={8}
        style={{ paddingRight: 4 }}
      >
        <MaterialCommunityIcons name="arrow-left" size={26} color={colors.textPrimary} />
      </TouchableOpacity>
    );

  const resetAll = () => {
    setStep('source');
    setSourceMode('sheet');
    setSheetUrl('');
    setFile(null);
    setDefaultTaxon('snake');
    setTaxa([...ANIMAL_TAXON_ORDER]);
    setAnalysis(null);
    setMapping({});
    setDuplicateMode('skip');
    setResult(null);
    setError('');
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset) return;
      setFile({
        uri: asset.uri,
        name: asset.name ?? 'import.csv',
        mimeType: asset.mimeType ?? 'application/octet-stream',
      });
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not open that file.');
    }
  };

  /**
   * Build the multipart body shared by analyze + commit. Always tags
   * `target: 'animal'` so the shared backend routes rows into the HV
   * animals table. Sends either the picked file or the sheet URL based
   * on the active source mode.
   */
  const buildFormData = () => {
    const fd = new FormData();
    fd.append('target', 'animal');
    fd.append('default_taxon', defaultTaxon);
    if (sourceMode === 'file' && file) {
      // React Native FormData file shape: { uri, name, type }.
      fd.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as any);
    } else {
      fd.append('sheet_url', sheetUrl.trim());
    }
    return fd;
  };

  const analyze = async () => {
    if (sourceMode === 'sheet' && !sheetUrl.trim()) {
      setError('Paste a Google Sheet link to continue.');
      return;
    }
    if (sourceMode === 'file' && !file) {
      setError('Choose a CSV or Excel file to continue.');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const fd = buildFormData();
      const res = await apiClient.post<AnalyzeResponse>('/import/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      setAnalysis(data);
      // Seed mapping from suggested fields
      const seeded: Record<string, string | null> = {};
      data.columns.forEach((c) => {
        seeded[c.header] = c.suggested_field;
      });
      setMapping(seeded);
      if (data.taxa?.length) setTaxa(data.taxa);
      setStep('confirm');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setError(e?.response?.data?.detail || e?.message || 'Failed to analyze the source.');
    } finally {
      setAnalyzing(false);
    }
  };

  const commit = async () => {
    if (!analysis) return;
    setCommitting(true);
    setError('');
    try {
      const fd = buildFormData();
      fd.append('mapping', JSON.stringify(mapping));
      fd.append('duplicate_mode', duplicateMode);
      fd.append('unmapped_to_notes', 'true');
      const res = await apiClient.post<CommitResponse>('/import/commit', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setStep('result');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setError(e?.response?.data?.detail || e?.message || 'Failed to import.');
    } finally {
      setCommitting(false);
    }
  };

  const headerSubtitle =
    step === 'source'
      ? 'Bring in your collection'
      : step === 'confirm'
        ? 'Review the auto-mapping, then import'
        : 'Import complete';

  const fieldLabelFor = (field: string | null): string => {
    if (!field) return 'Ignore';
    const f = analysis?.fields.find((x) => x.field === field);
    return f ? f.label : titleCase(field);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Import Collection" subtitle={headerSubtitle} leftAction={backAction} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentInner, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
        >
          {error !== '' && (
            <View
              style={[
                styles.errorCard,
                { backgroundColor: colors.surface, borderColor: colors.danger, borderRadius: layout.radius.md },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          )}

          {/* ---------- STEP 1: SOURCE ---------- */}
          {step === 'source' && (
            <View>
              {/* Source mode toggle: Sheet link vs. file upload */}
              <View style={styles.toggleRow}>
                {(['sheet', 'file'] as const).map((m) => {
                  const active = sourceMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        setSourceMode(m);
                        setError('');
                      }}
                      style={[
                        styles.toggleBtn,
                        {
                          backgroundColor: active ? colors.primary : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                          borderRadius: layout.radius.md,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.toggleText, { color: active ? '#0B0B0B' : colors.textSecondary }]}>
                        {m === 'sheet' ? 'Google Sheet' : 'Upload file'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {sourceMode === 'sheet' ? (
                <View style={{ marginTop: 20 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Google Sheet link</Text>
                  <TextInput
                    value={sheetUrl}
                    onChangeText={setSheetUrl}
                    placeholder="https://docs.google.com/spreadsheets/..."
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: layout.radius.sm,
                      },
                    ]}
                  />
                  <Text style={[styles.hint, { color: colors.textTertiary }]}>
                    Share as &quot;Anyone with the link → Viewer&quot; or Publish to web so we can read it.
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 20 }}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CSV or Excel file</Text>
                  <TouchableOpacity
                    onPress={pickFile}
                    style={[
                      styles.filePickRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: file ? colors.primary : colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={file ? `Selected file ${file.name}` : 'Choose a file'}
                  >
                    <MaterialCommunityIcons
                      name={file ? 'file-check-outline' : 'file-upload-outline'}
                      size={22}
                      color={file ? colors.primary : colors.textTertiary}
                    />
                    <Text
                      style={[styles.filePickText, { color: file ? colors.textPrimary : colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {file ? file.name : 'Choose a CSV or Excel file'}
                    </Text>
                    {file ? (
                      <MaterialCommunityIcons name="swap-horizontal" size={20} color={colors.textTertiary} />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
                    )}
                  </TouchableOpacity>
                  <Text style={[styles.hint, { color: colors.textTertiary }]}>
                    We support .csv and .xlsx exports from most tracking apps and spreadsheets.
                  </Text>
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 24 }]}>Default taxon</Text>
              <Text style={[styles.hint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>
                Used for rows where the taxon can&apos;t be detected.
              </Text>
              <TouchableOpacity
                onPress={() => setTaxonPickerOpen(true)}
                style={[
                  styles.selectRow,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.sm },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Default taxon, ${taxonLabel(defaultTaxon)}`}
              >
                <Text style={[styles.selectValue, { color: colors.textPrimary }]}>{taxonLabel(defaultTaxon)}</Text>
                <MaterialCommunityIcons name="chevron-down" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          )}

          {/* ---------- STEP 2: CONFIRM ---------- */}
          {step === 'confirm' && analysis && (
            <View>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
                ]}
              >
                <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
                  {analysis.row_count} {analysis.row_count === 1 ? 'row' : 'rows'} found
                </Text>
                <Text style={[styles.summaryLine, { color: colors.textSecondary }]}>
                  {analysis.summary.new} new · {analysis.summary.duplicate} dup · {analysis.summary.error_rows} errors ·{' '}
                  {analysis.summary.species_matched} matched
                </Text>
                {analysis.summary.unmapped_columns.length > 0 && (
                  <Text style={[styles.summaryMuted, { color: colors.textTertiary }]}>
                    Unmapped columns saved to notes: {analysis.summary.unmapped_columns.join(', ')}
                  </Text>
                )}
              </View>

              {/* Duplicate handling toggle */}
              <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>Duplicates</Text>
              <View style={styles.toggleRow}>
                {(['skip', 'update'] as const).map((m) => {
                  const active = duplicateMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setDuplicateMode(m)}
                      style={[
                        styles.toggleBtn,
                        {
                          backgroundColor: active ? colors.primary : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                          borderRadius: layout.radius.md,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.toggleText, { color: active ? '#0B0B0B' : colors.textSecondary }]}>
                        {m === 'skip' ? 'Skip duplicates' : 'Update duplicates'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Column mapping cards */}
              <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>Column mapping</Text>
              {analysis.columns.map((col) => {
                const mapped = mapping[col.header] ?? null;
                const sample = col.sample_values.find((v) => v && v.trim() !== '');
                return (
                  <View
                    key={col.header}
                    style={[
                      styles.mapCard,
                      { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
                    ]}
                  >
                    <View style={styles.mapCardTop}>
                      <Text style={[styles.mapHeader, { color: colors.textPrimary }]} numberOfLines={1}>
                        {col.header}
                      </Text>
                      <View style={[styles.confChip, { backgroundColor: `${CONFIDENCE_COLORS[col.confidence]}22` }]}>
                        <Text style={[styles.confChipText, { color: CONFIDENCE_COLORS[col.confidence] }]}>
                          {col.confidence}
                        </Text>
                      </View>
                    </View>
                    {sample ? (
                      <Text style={[styles.mapSample, { color: colors.textTertiary }]} numberOfLines={1}>
                        e.g. {sample}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => setFieldPickerHeader(col.header)}
                      style={[
                        styles.mapSelect,
                        { backgroundColor: colors.background, borderColor: colors.border, borderRadius: layout.radius.sm },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Mapped to ${fieldLabelFor(mapped)}`}
                    >
                      <MaterialCommunityIcons name="arrow-right-thin" size={18} color={colors.textTertiary} />
                      <Text
                        style={[
                          styles.mapSelectValue,
                          { color: mapped ? colors.textPrimary : colors.textTertiary },
                        ]}
                        numberOfLines={1}
                      >
                        {fieldLabelFor(mapped)}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Preview */}
              <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>Preview</Text>
              {analysis.preview.slice(0, 8).map((row) => {
                const meta = statusMeta(row.status);
                return (
                  <View
                    key={row.row}
                    style={[
                      styles.previewRow,
                      { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.sm },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.previewName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {row.display_name || 'Unnamed'}
                      </Text>
                      <Text style={[styles.previewMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                        {taxonLabel(row.taxon)}
                        {row.species_matched && row.species_name ? `  ·  ✓ ${row.species_name}` : ''}
                      </Text>
                      {row.status === 'error' && row.errors.length > 0 ? (
                        <Text style={[styles.previewError, { color: colors.danger }]} numberOfLines={2}>
                          {row.errors.join('; ')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.pill, { backgroundColor: `${meta.color}22` }]}>
                      <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                );
              })}
              {analysis.preview.length > 8 ? (
                <Text style={[styles.moreText, { color: colors.textTertiary }]}>
                  + {analysis.row_count - 8} more
                </Text>
              ) : null}
            </View>
          )}

          {/* ---------- STEP 3: RESULT ---------- */}
          {step === 'result' && result && (
            <View>
              <View style={styles.resultHeaderWrap}>
                <Text style={styles.resultEmoji}>🎉</Text>
                <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>Import complete</Text>
              </View>

              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
                ]}
              >
                <ResultLine label="Imported" value={result.imported} colors={colors} />
                <ResultLine label="Updated" value={result.updated} colors={colors} />
                <ResultLine label="Skipped duplicates" value={result.skipped_duplicates} colors={colors} />
                <ResultLine label="Error rows" value={result.error_rows} colors={colors} last />
              </View>

              {result.cap_reached && (
                <View
                  style={[
                    styles.capCard,
                    { backgroundColor: colors.surface, borderColor: colors.warning, borderRadius: layout.radius.md },
                  ]}
                >
                  <MaterialCommunityIcons name="alert" size={20} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.capText, { color: colors.warning }]}>
                      You hit the free collection limit — some rows weren&apos;t imported.
                    </Text>
                    <TouchableOpacity onPress={() => router.push('/settings' as never)}>
                      <Text style={[styles.capLink, { color: colors.warning }]}>Upgrade to import the rest →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {result.errors.length > 0 && (
                <View
                  style={[
                    styles.errorsCard,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
                  ]}
                >
                  <Text style={[styles.errorsTitle, { color: colors.textSecondary }]}>Issues</Text>
                  {result.errors.slice(0, 10).map((e, i) => (
                    <Text key={i} style={[styles.errorLine, { color: colors.textTertiary }]}>
                      • {e}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* ---------- BOTTOM ACTION BAR ---------- */}
        <View
          style={[
            styles.actionBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 },
          ]}
        >
          {step === 'source' && (
            <TouchableOpacity
              onPress={analyze}
              disabled={analyzing}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.primary, borderRadius: layout.radius.lg, opacity: analyzing ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Analyze the source"
            >
              {analyzing ? (
                <ActivityIndicator color="#0B0B0B" />
              ) : (
                <Text style={styles.actionBtnText}>Analyze</Text>
              )}
            </TouchableOpacity>
          )}

          {step === 'confirm' && analysis && (
            <TouchableOpacity
              onPress={commit}
              disabled={committing}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.primary, borderRadius: layout.radius.lg, opacity: committing ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              {committing ? (
                <ActivityIndicator color="#0B0B0B" />
              ) : (
                <Text style={styles.actionBtnText}>
                  Import {analysis.summary.new + (duplicateMode === 'update' ? analysis.summary.duplicate : 0)}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {step === 'result' && (
            <View style={styles.resultActions}>
              <TouchableOpacity
                onPress={resetAll}
                style={[styles.ghostBtn, { borderColor: colors.border, borderRadius: layout.radius.md }]}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Import more</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.replace('/(tabs)' as never)}
                style={[
                  styles.actionBtn,
                  { flex: 1, backgroundColor: colors.primary, borderRadius: layout.radius.lg },
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.actionBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ---------- TAXON PICKER MODAL ---------- */}
      <Modal
        visible={taxonPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTaxonPickerOpen(false)}
      >
        <View style={styles.modalWrap}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Default taxon</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {taxa.map((t) => {
                const active = defaultTaxon === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => {
                      setDefaultTaxon(t);
                      setTaxonPickerOpen(false);
                    }}
                    style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pickerItemText, { color: active ? colors.primary : colors.textPrimary }]}>
                      {taxonLabel(t)}
                    </Text>
                    {active && <MaterialCommunityIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- FIELD PICKER MODAL ---------- */}
      <Modal
        visible={fieldPickerHeader !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setFieldPickerHeader(null)}
      >
        <View style={styles.modalWrap}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              Map &quot;{fieldPickerHeader}&quot;
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {/* Ignore option */}
              <TouchableOpacity
                onPress={() => {
                  if (fieldPickerHeader) {
                    setMapping((prev) => ({ ...prev, [fieldPickerHeader]: null }));
                  }
                  setFieldPickerHeader(null);
                }}
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    { color: fieldPickerHeader && !mapping[fieldPickerHeader] ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Ignore
                </Text>
                {fieldPickerHeader && !mapping[fieldPickerHeader] && (
                  <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
              {(analysis?.fields ?? []).map((f) => {
                const active = fieldPickerHeader ? mapping[fieldPickerHeader] === f.field : false;
                return (
                  <TouchableOpacity
                    key={f.field}
                    onPress={() => {
                      if (fieldPickerHeader) {
                        setMapping((prev) => ({ ...prev, [fieldPickerHeader]: f.field }));
                      }
                      setFieldPickerHeader(null);
                    }}
                    style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pickerItemText, { color: active ? colors.primary : colors.textPrimary }]}>
                      {f.label}
                    </Text>
                    {active && <MaterialCommunityIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ResultLine({
  label,
  value,
  colors,
  last,
}: {
  label: string;
  value: number;
  colors: any;
  last?: boolean;
}) {
  return (
    <View style={[styles.resultLine, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Text style={[styles.resultLineLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.resultLineValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

export default withErrorBoundary(ImportScreen, 'import');

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16 },

  errorCard: { padding: 14, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 14 },

  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },

  filePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  filePickText: { flex: 1, fontSize: 15, fontWeight: '600' },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectValue: { fontSize: 15, fontWeight: '600' },

  summaryCard: { borderWidth: 1, padding: 16, marginBottom: 8 },
  summaryTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  summaryLine: { fontSize: 14, fontWeight: '600' },
  summaryMuted: { fontSize: 12, marginTop: 8, lineHeight: 17 },

  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },

  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '700' },

  mapCard: { borderWidth: 1, padding: 14, marginBottom: 10 },
  mapCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mapHeader: { flex: 1, fontSize: 15, fontWeight: '700' },
  confChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  confChipText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  mapSample: { fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  mapSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  mapSelectValue: { flex: 1, fontSize: 14, fontWeight: '600' },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  previewName: { fontSize: 14, fontWeight: '600' },
  previewMeta: { fontSize: 12, marginTop: 2 },
  previewError: { fontSize: 11, marginTop: 3 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
  moreText: { fontSize: 12, textAlign: 'center', marginTop: 4, fontWeight: '600' },

  resultHeaderWrap: { alignItems: 'center', paddingVertical: 16 },
  resultEmoji: { fontSize: 52, marginBottom: 8 },
  resultTitle: { fontSize: 20, fontWeight: '700' },
  resultLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  resultLineLabel: { fontSize: 15 },
  resultLineValue: { fontSize: 15, fontWeight: '700' },

  capCard: { flexDirection: 'row', gap: 10, borderWidth: 1, padding: 14, marginTop: 12, alignItems: 'flex-start' },
  capText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  capLink: { fontSize: 13, fontWeight: '700', marginTop: 6 },

  errorsCard: { borderWidth: 1, padding: 14, marginTop: 12 },
  errorsTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  errorLine: { fontSize: 12, lineHeight: 18 },

  actionBar: { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  resultActions: { flexDirection: 'row', gap: 10, flex: 1 },
  ghostBtn: { borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },

  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderWidth: 1, padding: 20 },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerItemText: { fontSize: 16, fontWeight: '600' },
});
