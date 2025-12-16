'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Types
export type ColorMode = 'dark' | 'light' | 'system';
export type ThemeType = 'default' | 'preset' | 'custom';

export interface ResolvedColors {
  primary: string;
  secondary: string;
  accent: string;
}

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

export interface ThemePreferences {
  color_mode: ColorMode;
  theme_type: ThemeType;
  preset_id: string | null;
  custom_primary: string | null;
  custom_secondary: string | null;
  custom_accent: string | null;
  resolved_colors: ResolvedColors;
}

// Default colors
const DEFAULT_COLORS: ResolvedColors = {
  primary: '#0066FF',
  secondary: '#FF0099',
  accent: '#3385FF',
};

// Theme presets (mirrored from backend for offline use)
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

interface ThemeState {
  // Basic theme mode (for document class)
  theme: 'dark' | 'light';

  // Full theme preferences
  themeType: ThemeType;
  presetId: string | null;
  customPrimary: string | null;
  customSecondary: string | null;
  customAccent: string | null;
  resolvedColors: ResolvedColors;

  // Loading state
  isLoading: boolean;
  isSynced: boolean;

  // Actions
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setThemeType: (type: ThemeType) => void;
  setPreset: (presetId: string) => void;
  setCustomColors: (colors: Partial<ResolvedColors>) => void;
  resetToDefault: () => void;
  applyColorsToDOM: () => void;

  // API sync actions
  loadFromAPI: (token: string) => Promise<void>;
  saveToAPI: (token: string) => Promise<void>;
}

// Helper to convert hex to RGB values for CSS variables
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 102 255'; // fallback
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

// Helper to resolve colors based on theme type
function resolveColors(state: Pick<ThemeState, 'themeType' | 'presetId' | 'customPrimary' | 'customSecondary' | 'customAccent'>): ResolvedColors {
  if (state.themeType === 'custom') {
    return {
      primary: state.customPrimary || DEFAULT_COLORS.primary,
      secondary: state.customSecondary || DEFAULT_COLORS.secondary,
      accent: state.customAccent || DEFAULT_COLORS.accent,
    };
  }

  if (state.themeType === 'preset' && state.presetId && THEME_PRESETS[state.presetId]) {
    const preset = THEME_PRESETS[state.presetId];
    return {
      primary: preset.primary,
      secondary: preset.secondary,
      accent: preset.accent,
    };
  }

  return DEFAULT_COLORS;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Initial state
      theme: 'dark',
      themeType: 'default',
      presetId: null,
      customPrimary: null,
      customSecondary: null,
      customAccent: null,
      resolvedColors: DEFAULT_COLORS,
      isLoading: false,
      isSynced: false,

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark',
        })),

      setTheme: (theme) => set({ theme }),

      setThemeType: (type) =>
        set((state) => {
          const newState = { ...state, themeType: type };
          return {
            themeType: type,
            resolvedColors: resolveColors(newState),
            isSynced: false,
          };
        }),

      setPreset: (presetId) =>
        set((state) => {
          const newState = { ...state, themeType: 'preset' as ThemeType, presetId };
          return {
            themeType: 'preset',
            presetId,
            resolvedColors: resolveColors(newState),
            isSynced: false,
          };
        }),

      setCustomColors: (colors) =>
        set((state) => {
          const newState = {
            ...state,
            themeType: 'custom' as ThemeType,
            customPrimary: colors.primary ?? state.customPrimary,
            customSecondary: colors.secondary ?? state.customSecondary,
            customAccent: colors.accent ?? state.customAccent,
          };
          return {
            themeType: 'custom',
            customPrimary: newState.customPrimary,
            customSecondary: newState.customSecondary,
            customAccent: newState.customAccent,
            resolvedColors: resolveColors(newState),
            isSynced: false,
          };
        }),

      resetToDefault: () =>
        set({
          themeType: 'default',
          presetId: null,
          customPrimary: null,
          customSecondary: null,
          customAccent: null,
          resolvedColors: DEFAULT_COLORS,
          isSynced: false,
        }),

      applyColorsToDOM: () => {
        const state = get();
        if (typeof document === 'undefined') return;

        const root = document.documentElement;
        const colors = state.resolvedColors;

        // Apply custom colors as CSS variables
        root.style.setProperty('--user-primary', hexToRgb(colors.primary));
        root.style.setProperty('--user-secondary', hexToRgb(colors.secondary));
        root.style.setProperty('--user-accent', hexToRgb(colors.accent));

        // Also set hex versions for gradients
        root.style.setProperty('--user-primary-hex', colors.primary);
        root.style.setProperty('--user-secondary-hex', colors.secondary);
        root.style.setProperty('--user-accent-hex', colors.accent);
      },

      loadFromAPI: async (token: string) => {
        set({ isLoading: true });
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const response = await fetch(`${API_URL}/api/v1/theme-preferences/`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            set({
              theme: data.color_mode === 'light' ? 'light' : 'dark',
              themeType: data.theme_type,
              presetId: data.preset_id,
              customPrimary: data.custom_primary,
              customSecondary: data.custom_secondary,
              customAccent: data.custom_accent,
              resolvedColors: data.resolved_colors || resolveColors({
                themeType: data.theme_type,
                presetId: data.preset_id,
                customPrimary: data.custom_primary,
                customSecondary: data.custom_secondary,
                customAccent: data.custom_accent,
              }),
              isSynced: true,
            });

            // Apply colors to DOM
            get().applyColorsToDOM();
          }
        } catch (error) {
          console.error('Failed to load theme preferences:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      saveToAPI: async (token: string) => {
        const state = get();
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const response = await fetch(`${API_URL}/api/v1/theme-preferences/`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              color_mode: state.theme,
              theme_type: state.themeType,
              preset_id: state.presetId,
              custom_primary: state.customPrimary,
              custom_secondary: state.customSecondary,
              custom_accent: state.customAccent,
            }),
          });

          if (response.ok) {
            set({ isSynced: true });
          }
        } catch (error) {
          console.error('Failed to save theme preferences:', error);
        }
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        theme: state.theme,
        themeType: state.themeType,
        presetId: state.presetId,
        customPrimary: state.customPrimary,
        customSecondary: state.customSecondary,
        customAccent: state.customAccent,
        resolvedColors: state.resolvedColors,
      }),
    }
  )
);
