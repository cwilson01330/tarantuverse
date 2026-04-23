/**
 * Simple dark-first theme for Herpetoverse mobile v1.
 *
 * Intentionally simpler than Tarantuverse mobile's preset system — we can
 * bring the Keeper/Hobbyist aesthetic presets over later (Phase 3.6) once
 * the v1 reptile surface is complete. The goal here is a single, cohesive
 * dark aesthetic that matches the web-herpetoverse `bg-neutral-950` look.
 *
 * Colors map loosely to the web Tailwind palette:
 *   background      → neutral-950 (#0B0B0B)
 *   surface         → neutral-900 (#171717)
 *   surfaceRaised   → neutral-800 (#262626)
 *   border          → neutral-800/70
 *   textPrimary     → neutral-100 (#F5F5F5)
 *   textSecondary   → neutral-400 (#A3A3A3)
 *   textTertiary    → neutral-500 (#737373)
 *   primary (accent)→ emerald-500 (#10B981) — reptile-forward green
 *   danger          → rose-500 (#F43F5E)
 *   warning         → amber-500 (#F59E0B)
 *   success         → emerald-500 (#10B981)
 *   info            → sky-500 (#0EA5E9)
 */
import { createContext, ReactNode, useContext } from 'react';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
}

export interface ThemeLayout {
  /** Radius scale — mobile surfaces tend to read softer than web. */
  radius: { sm: number; md: number; lg: number; xl: number };
  /** Spacing scale. */
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  /** Whether headers should use a linear gradient background. */
  useGradient: boolean;
}

export interface Theme {
  colors: ThemeColors;
  layout: ThemeLayout;
}

const darkTheme: Theme = {
  colors: {
    background: '#0B0B0B',
    surface: '#171717',
    surfaceRaised: '#262626',
    border: 'rgba(38, 38, 38, 0.7)',
    textPrimary: '#F5F5F5',
    textSecondary: '#A3A3A3',
    textTertiary: '#737373',
    primary: '#10B981',
    secondary: '#059669',
    accent: '#34D399',
    danger: '#F43F5E',
    warning: '#F59E0B',
    success: '#10B981',
    info: '#0EA5E9',
  },
  layout: {
    radius: { sm: 8, md: 12, lg: 16, xl: 24 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    useGradient: true,
  },
};

const ThemeContext = createContext<Theme>(darkTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={darkTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
