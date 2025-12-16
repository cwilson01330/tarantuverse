'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const theme = useThemeStore((state) => state.theme);
  const resolvedColors = useThemeStore((state) => state.resolvedColors);
  const applyColorsToDOM = useThemeStore((state) => state.applyColorsToDOM);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Apply theme class to document root
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme, mounted]);

  // Apply custom colors when they change
  useEffect(() => {
    if (!mounted) return;
    applyColorsToDOM();
  }, [resolvedColors, mounted, applyColorsToDOM]);

  // Render children immediately to avoid layout shift
  return <>{children}</>;
}
