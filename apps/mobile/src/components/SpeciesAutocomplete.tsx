import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus?: string;
  care_level?: string;
  image_url?: string;
}

interface SpeciesAutocompleteProps {
  onSelect: (species: Species) => void;
  initialValue?: string;
  placeholder?: string;
}

export default function SpeciesAutocomplete({
  onSelect,
  initialValue = '',
  placeholder = 'Search species...',
}: SpeciesAutocompleteProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<Species[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const debounce = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await apiClient.get(
          `/species/search?q=${encodeURIComponent(query)}&limit=10`
        );
        setResults(response.data);
        setIsOpen(true);
      } catch (error) {
        console.error('Failed to search species:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelect = useCallback(
    (species: Species) => {
      setQuery(species.scientific_name);
      setIsOpen(false);
      Keyboard.dismiss();
      onSelect(species);
    },
    [onSelect]
  );

  const careLevelColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return { bg: '#dcfce7', text: '#166534' };
      case 'intermediate':
        return { bg: '#fef9c3', text: '#854d0e' };
      default:
        return { bg: '#fee2e2', text: '#991b1b' };
    }
  };

  return (
    <View>
      <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={query}
          onChangeText={setQuery}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {loading && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
        )}
      </View>

      {isOpen && results.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {results.map((species) => (
            <TouchableOpacity
              key={species.id}
              onPress={() => handleSelect(species)}
              style={[styles.resultItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              {species.image_url ? (
                <Image source={{ uri: species.image_url }} style={styles.resultImage} />
              ) : (
                <View style={[styles.resultImagePlaceholder, { backgroundColor: colors.background }]}>
                  <Text style={styles.emoji}>🕷️</Text>
                </View>
              )}
              <View style={styles.resultText}>
                <Text style={[styles.scientificName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {species.scientific_name}
                </Text>
                {species.common_names.length > 0 && (
                  <Text style={[styles.commonName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {species.common_names[0]}
                  </Text>
                )}
              </View>
              {species.care_level && (
                <View style={[styles.badge, { backgroundColor: careLevelColor(species.care_level).bg }]}>
                  <Text style={[styles.badgeText, { color: careLevelColor(species.care_level).text }]}>
                    {species.care_level}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textTertiary, textAlign: 'center' }}>
            No species found. Try a different search.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  spinner: {
    marginLeft: 8,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 240,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  resultImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  resultImagePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  resultText: {
    flex: 1,
  },
  scientificName: {
    fontSize: 14,
    fontWeight: '600',
  },
  commonName: {
    fontSize: 12,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    padding: 12,
  },
});
