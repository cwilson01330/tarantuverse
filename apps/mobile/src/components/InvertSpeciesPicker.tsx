/**
 * Generic invert species picker — ADR-007.
 *
 * Taxon-aware debounced autocomplete used by the generic add/edit forms.
 * Scopes the search to the taxon's catalog via searchInvertSpecies(taxon, q).
 * Shows a care-level pill (honest across all taxa, including harmless ones).
 * Free-typing still works — onChange(null) keeps the typed scientific_name.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import {
  searchInvertSpecies,
  type InvertSpecies,
  type InvertTaxon,
  type CareLevel,
} from '../lib/inverts';

interface Props {
  taxon: InvertTaxon;
  valueId: string | null;
  valueScientific: string;
  onChange: (picked: InvertSpecies | null) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 250;

const CARE_LABELS: Record<CareLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

function careColor(level: CareLevel | null | undefined) {
  switch (level) {
    case 'beginner': return { bg: '#dcfce7', fg: '#166534' };
    case 'intermediate': return { bg: '#fef3c7', fg: '#92400e' };
    case 'advanced': return { bg: '#fee2e2', fg: '#991b1b' };
    default: return { bg: '#e5e7eb', fg: '#374151' };
  }
}

export function InvertSpeciesPicker({ taxon, valueId, valueScientific, onChange, placeholder = 'Search species…' }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(valueScientific);
  const [results, setResults] = useState<InvertSpecies[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) setQuery(valueScientific);
  }, [valueScientific, open]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    setOpen(true);
    if (valueId) onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchInvertSpecies(taxon, text.trim(), 8);
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const handlePick = (row: InvertSpecies) => {
    onChange(row);
    setQuery(row.scientific_name);
    setOpen(false);
    setResults([]);
  };

  const styles = makeStyles(colors);

  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleChangeText}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {open && (loading || results.length > 0) && (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.loadingText}>Searching…</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(r) => r.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const c = careColor(item.care_level);
                return (
                  <TouchableOpacity style={styles.resultRow} onPress={() => handlePick(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{item.scientific_name}</Text>
                      {item.common_names?.[0] && <Text style={styles.resultCommon}>{item.common_names[0]}</Text>}
                    </View>
                    <View style={[styles.pill, { backgroundColor: c.bg }]}>
                      <Text style={[styles.pillText, { color: c.fg }]}>
                        {item.care_level ? CARE_LABELS[item.care_level] : 'Care —'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface },
    dropdown: { position: 'absolute', top: 48, left: 0, right: 0, maxHeight: 240, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4, zIndex: 10 },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    loadingText: { color: colors.textTertiary, fontSize: 13 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    resultName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, fontStyle: 'italic' },
    resultCommon: { fontSize: 12, color: colors.textSecondary },
    pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    pillText: { fontSize: 11, fontWeight: '600' },
  });
