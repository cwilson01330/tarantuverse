import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'dark' | 'light';
export type ThemeType = 'default' | 'preset' | 'custom';

// Theme preset interface
export interface ThemePreset {
  id: string;
  name: string;
  description?: string;
  species?: string;
  primary: string;
  secondary: string;
  accent: string;
  is_free: boolean;
  category: string;
}

// Resolved user colors
export interface UserColors {
  primary: string;
  secondary: string;
  accent: string;
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;

  // Skinning features
  themeType: ThemeType;
  presetId: string | null;
  customColors: UserColors | null;
  setPreset: (presetId: string) => void;
  setCustomColors: (colors: UserColors) => void;
  resetToDefault: () => void;
  loadFromAPI: (token: string) => Promise<void>;
  saveToAPI: (token: string) => Promise<void>;
  isLoading: boolean;
}

export interface ThemeColors {
  // Backgrounds
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;

  // Brand (user-customizable)
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;

  // Status
  success: string;
  warning: string;
  error: string;
  info: string;

  // Special
  male: string;
  female: string;
}

// Theme presets (mirrored from backend)
export const THEME_PRESETS: Record<string, ThemePreset> = {
  default: {
    id: 'default',
    name: 'Tarantuverse',
    description: 'The classic Tarantuverse look with electric blue and neon pink',
    primary: '#0066FF',
    secondary: '#FF0099',
    accent: '#3385FF',
    is_free: true,
    category: 'default',
  },
  brachypelma: {
    id: 'brachypelma',
    name: 'Red Knee',
    description: 'Inspired by the iconic Brachypelma hamorii',
    species: 'Brachypelma hamorii',
    primary: '#DC2626',
    secondary: '#1F1F1F',
    accent: '#EF4444',
    is_free: true,
    category: 'species',
  },
  grammostola: {
    id: 'grammostola',
    name: 'Rosea Rose',
    description: 'Soft dusty rose inspired by the Chilean Rose',
    species: 'Grammostola rosea',
    primary: '#F472B6',
    secondary: '#78716C',
    accent: '#F9A8D4',
    is_free: true,
    category: 'species',
  },
  terrestrial: {
    id: 'terrestrial',
    name: 'Earth Tones',
    description: 'Warm earthy browns for terrestrial lovers',
    primary: '#8B4513',
    secondary: '#2D5016',
    accent: '#A0522D',
    is_free: true,
    category: 'habitat',
  },
  gbb: {
    id: 'gbb',
    name: 'GBB Blue',
    description: 'Vibrant blue and orange from the stunning Greenbottle Blue',
    species: 'Chromatopelma cyaneopubescens',
    primary: '#0099FF',
    secondary: '#FF6600',
    accent: '#00CCFF',
    is_free: false,
    category: 'species',
  },
  obt: {
    id: 'obt',
    name: 'OBT Orange',
    description: 'Fiery orange inspired by the Orange Baboon Tarantula',
    species: 'Pterinochilus murinus',
    primary: '#FF6600',
    secondary: '#1A1A1A',
    accent: '#FF9933',
    is_free: false,
    category: 'species',
  },
  poecilotheria: {
    id: 'poecilotheria',
    name: 'Poeci Yellow',
    description: 'Bold warning colors from the Ornamental genus',
    species: 'Poecilotheria sp.',
    primary: '#FFD700',
    secondary: '#1A1A1A',
    accent: '#FFED4A',
    is_free: false,
    category: 'species',
  },
  avicularia: {
    id: 'avicularia',
    name: 'Pink Toe',
    description: 'Pink and purple from the beloved Avicularia',
    species: 'Avicularia sp.',
    primary: '#FF69B4',
    secondary: '#6B21A8',
    accent: '#FF8DC7',
    is_free: false,
    category: 'species',
  },
  monocentropus: {
    id: 'monocentropus',
    name: 'Balfouri Blue',
    description: 'Stunning blue and purple from the Socotra Island Blue',
    species: 'Monocentropus balfouri',
    primary: '#3B82F6',
    secondary: '#A855F7',
    accent: '#60A5FA',
    is_free: false,
    category: 'species',
  },
  arboreal: {
    id: 'arboreal',
    name: 'Forest',
    description: 'Lush greens for arboreal enthusiasts',
    primary: '#16A34A',
    secondary: '#065F46',
    accent: '#22C55E',
    is_free: false,
    category: 'habitat',
  },
  fossorial: {
    id: 'fossorial',
    name: 'Burrow',
    description: 'Deep earth tones for fossorial species lovers',
    primary: '#44403C',
    secondary: '#292524',
    accent: '#57534E',
    is_free: false,
    category: 'habitat',
  },
};

// Default user colors
const DEFAULT_USER_COLORS: UserColors = {
  primary: '#0066FF',
  secondary: '#FF0099',
  accent: '#3385FF',
};

// Helper to lighten a color
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Helper to darken a color
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)));
  const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const createDarkColors = (userColors: UserColors): ThemeColors => ({
  background: '#0a0a0f',
  surface: '#1a1a24',
  surfaceElevated: '#2a2a3a',
  border: '#2a2a3a',

  textPrimary: '#e5e7eb',
  textSecondary: '#d1d5db',
  textTertiary: '#9ca3af',

  primary: userColors.primary,
  primaryLight: lightenColor(userColors.primary, 0.2),
  primaryDark: darkenColor(userColors.primary, 0.2),
  secondary: userColors.secondary,
  accent: userColors.accent,

  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6',

  male: '#3b82f6',
  female: '#ec4899',
});

const createLightColors = (userColors: UserColors): ThemeColors => ({
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceElevated: '#f1f5f9',
  border: '#e2e8f0',

  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#94a3b8',

  primary: userColors.primary,
  primaryLight: lightenColor(userColors.primary, 0.2),
  primaryDark: darkenColor(userColors.primary, 0.2),
  secondary: userColors.secondary,
  accent: userColors.accent,

  success: '#16a34a',
  warning: '#ca8a04',
  error: '#dc2626',
  info: '#2563eb',

  male: '#3b82f6',
  female: '#ec4899',
});

const THEME_STORAGE_KEY = '@tarantuverse_theme';
const THEME_PREFS_STORAGE_KEY = '@tarantuverse_theme_prefs';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [themeType, setThemeType] = useState<ThemeType>('default');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [customColors, setCustomColorsState] = useState<UserColors | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Compute resolved user colors based on theme type
  const resolvedUserColors = useMemo((): UserColors => {
    if (themeType === 'custom' && customColors) {
      return customColors;
    }
    if (themeType === 'preset' && presetId && THEME_PRESETS[presetId]) {
      const preset = THEME_PRESETS[presetId];
      return {
        primary: preset.primary,
        secondary: preset.secondary,
        accent: preset.accent,
      };
    }
    return DEFAULT_USER_COLORS;
  }, [themeType, presetId, customColors]);

  // Compute final colors based on theme mode and user colors
  const colors = useMemo((): ThemeColors => {
    return theme === 'dark'
      ? createDarkColors(resolvedUserColors)
      : createLightColors(resolvedUserColors);
  }, [theme, resolvedUserColors]);

  // Load theme from storage on mount
  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const [savedTheme, savedPrefs] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(THEME_PREFS_STORAGE_KEY),
      ]);

      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
      }

      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.themeType) setThemeType(prefs.themeType);
        if (prefs.presetId) setPresetId(prefs.presetId);
        if (prefs.customColors) setCustomColorsState(prefs.customColors);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveThemePrefs = async () => {
    try {
      await AsyncStorage.setItem(
        THEME_PREFS_STORAGE_KEY,
        JSON.stringify({ themeType, presetId, customColors })
      );
    } catch (error) {
      console.error('Failed to save theme prefs:', error);
    }
  };

  const saveTheme = async (newTheme: Theme) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    saveTheme(newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const setPreset = (newPresetId: string) => {
    if (newPresetId === 'default') {
      setThemeType('default');
      setPresetId(null);
    } else {
      setThemeType('preset');
      setPresetId(newPresetId);
    }
    setTimeout(saveThemePrefs, 0);
  };

  const setCustomColors = (colors: UserColors) => {
    setThemeType('custom');
    setCustomColorsState(colors);
    setTimeout(saveThemePrefs, 0);
  };

  const resetToDefault = () => {
    setThemeType('default');
    setPresetId(null);
    setCustomColorsState(null);
    setTimeout(saveThemePrefs, 0);
  };

  const loadFromAPI = async (token: string) => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/theme-preferences/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setThemeState(data.color_mode === 'light' ? 'light' : 'dark');
        setThemeType(data.theme_type || 'default');
        setPresetId(data.preset_id || null);
        if (data.custom_primary) {
          setCustomColorsState({
            primary: data.custom_primary,
            secondary: data.custom_secondary || DEFAULT_USER_COLORS.secondary,
            accent: data.custom_accent || DEFAULT_USER_COLORS.accent,
          });
        }
        await saveThemePrefs();
      }
    } catch (error) {
      console.error('Failed to load theme from API:', error);
    }
  };

  const saveToAPI = async (token: string) => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      await fetch(`${API_URL}/api/v1/theme-preferences/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          color_mode: theme,
          theme_type: themeType,
          preset_id: presetId,
          custom_primary: customColors?.primary,
          custom_secondary: customColors?.secondary,
          custom_accent: customColors?.accent,
        }),
      });
    } catch (error) {
      console.error('Failed to save theme to API:', error);
    }
  };

  // Don't render children until theme is loaded
  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        colors,
        themeType,
        presetId,
        customColors,
        setPreset,
        setCustomColors,
        resetToDefault,
        loadFromAPI,
        saveToAPI,
        isLoading,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
