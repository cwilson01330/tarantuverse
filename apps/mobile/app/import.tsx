import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { AppHeader } from '../src/components/AppHeader';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';

/** A file the keeper chose from their device to import (CSV / Excel). */
interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

type Step = 'source' | 'confirm' | 'result';
type Confidence = 'high' | 'medium' | 'low' | 'none';
type RowStatus = 'new' | 'duplicate' | 'error';
type DuplicateMode = 'skip' | 'update';

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

export default function ImportScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [step, setStep] = useState<Step>('source');

  // Source state — the keeper imports from EITHER a picked file OR a sheet link.
  const [sheetUrl, setSheetUrl] = useState('');
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [taxa, setTaxa] = useState<string[]>(['tarantula']);
  const [defaultTaxon, setDefaultTaxon] = useState('tarantula');
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

  const backAction = (
    <TouchableOpacity
      onPress={() => {
        if (step === 'confirm') {
          setStep('source');
        } else if (step === 'result') {
          resetAll();
        } else {
          router.back();
        }
      }}
      accessibilityLabel="Back"
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const resetAll = () => {
    setStep('source');
    setSheetUrl('');
    setPickedFile(null);
    setDefaultTaxon('tarantula');
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
          // Some Android providers report a generic type; allow-through.
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setPickedFile({
        uri: a.uri,
        name: a.name || 'import.csv',
        mimeType: a.mimeType || 'text/csv',
      });
      setSheetUrl(''); // a file and a sheet link are mutually exclusive
      setError('');
    } catch {
      setError('Could not open the file picker. Please try again.');
    }
  };

  const buildFormData = () => {
    const fd = new FormData();
    if (pickedFile) {
      // React Native FormData file part.
      fd.append('file', {
        uri: pickedFile.uri,
        name: pickedFile.name,
        type: pickedFile.mimeType,
      } as any);
    } else {
      fd.append('sheet_url', sheetUrl.trim());
    }
    fd.append('default_taxon', defaultTaxon);
    return fd;
  };

  const analyze = async () => {
    if (!pickedFile && !sheetUrl.trim()) {
      setError('Choose a CSV/Excel file or paste a Google Sheet link to continue.');
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
      setError(e?.response?.data?.detail || e?.message || 'Failed to analyze the sheet.');
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
      ? 'Bring in your collection from a sheet'
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentInner, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
        >
          {error !== '' && (
            <View
              style={[
                styles.errorCard,
                { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: colors.error ?? '#ef4444', borderRadius: layout.radius.md },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>{error}</Text>
            </View>
          )}

          {/* ---------- STEP 1: SOURCE ---------- */}
          {step === 'source' && (
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Import a file</Text>
              {pickedFile ? (
                <View
                  style={[
                    styles.selectRow,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.sm },
                  ]}
                >
                  <MaterialCommunityIcons name="file-check-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.selectValue, { color: colors.textPrimary, flex: 1, marginLeft: 8 }]} numberOfLines={1}>
                    {pickedFile.name}
                  </Text>
                  <TouchableOpacity onPress={() => setPickedFile(null)} accessibilityLabel="Remove file">
                    <MaterialCommunityIcons name="close" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={pickFile}
                  style={[
                    styles.selectRow,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.sm },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a CSV or Excel file"
                >
                  <MaterialCommunityIcons name="file-upload-outline" size={20} color={colors.textPrimary} />
                  <Text style={[styles.selectValue, { color: colors.textPrimary, flex: 1, marginLeft: 8 }]}>
                    Choose a CSV or Excel file
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                Pick a .csv or .xlsx from your phone or a cloud drive.
              </Text>

              <View style={styles.orDivider}>
                <View style={[styles.orLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.orText, { color: colors.textTertiary }]}>or</Text>
                <View style={[styles.orLine, { backgroundColor: colors.border }]} />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Google Sheet link</Text>
              <TextInput
                value={sheetUrl}
                onChangeText={(t) => { setSheetUrl(t); if (t) setPickedFile(null); }}
                placeholder="https://docs.google.com/spreadsheets/..."
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!pickedFile}
                style={[
                  styles.input,
                  { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, borderRadius: layout.radius.sm, opacity: pickedFile ? 0.5 : 1 },
                ]}
              />
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                Share as "Anyone with the link → Viewer" or Publish to web so we can read it.
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 20 }]}>Default taxon</Text>
              <Text style={[styles.hint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>
                Used for rows where the taxon can't be detected.
              </Text>
              <TouchableOpacity
                onPress={() => setTaxonPickerOpen(true)}
                style={[
                  styles.selectRow,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.sm },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Default taxon, ${titleCase(defaultTaxon)}`}
              >
                <Text style={[styles.selectValue, { color: colors.textPrimary }]}>{titleCase(defaultTaxon)}</Text>
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
                      <Text style={[styles.toggleText, { color: active ? '#fff' : colors.textSecondary }]}>
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
                      <MaterialCommunityIcons
                        name="arrow-right-thin"
                        size={18}
                        color={colors.textTertiary}
                      />
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
                        {titleCase(row.taxon)}
                        {row.species_matched && row.species_name ? `  ·  ✓ ${row.species_name}` : ''}
                      </Text>
                      {row.status === 'error' && row.errors.length > 0 ? (
                        <Text style={[styles.previewError, { color: colors.error ?? '#dc2626' }]} numberOfLines={2}>
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
                    { backgroundColor: 'rgba(217, 119, 6, 0.12)', borderColor: '#d97706', borderRadius: layout.radius.md },
                  ]}
                >
                  <MaterialCommunityIcons name="alert" size={20} color="#d97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.capText, { color: '#b45309' }]}>
                      You hit the free collection limit — some rows weren't imported.
                    </Text>
                    <TouchableOpacity onPress={() => router.push('/subscription')}>
                      <Text style={[styles.capLink, { color: '#b45309' }]}>Upgrade to import the rest →</Text>
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
            <PrimaryButton
              onPress={analyze}
              disabled={analyzing}
              style={styles.actionBtn}
              outerStyle={{ borderRadius: layout.radius.lg, flex: 1 }}
            >
              {analyzing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>Analyze</Text>
              )}
            </PrimaryButton>
          )}

          {step === 'confirm' && analysis && (
            <PrimaryButton
              onPress={commit}
              disabled={committing}
              style={styles.actionBtn}
              outerStyle={{ borderRadius: layout.radius.lg, flex: 1 }}
            >
              {committing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>
                  Import {analysis.summary.new + (duplicateMode === 'update' ? analysis.summary.duplicate : 0)}
                </Text>
              )}
            </PrimaryButton>
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
              <PrimaryButton
                onPress={() => router.replace('/(tabs)/collection')}
                style={styles.actionBtn}
                outerStyle={{ borderRadius: layout.radius.lg, flex: 1 }}
              >
                <Text style={styles.actionBtnText}>Done</Text>
              </PrimaryButton>
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
                      {titleCase(t)}
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
              Map "{fieldPickerHeader}"
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16 },

  errorCard: { padding: 14, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 14 },

  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectValue: { fontSize: 15, fontWeight: '600' },

  fileHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 14,
    marginTop: 24,
  },
  fileHintText: { flex: 1, fontSize: 12, lineHeight: 17 },
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 12, fontWeight: '600' },

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
  actionBtn: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
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
