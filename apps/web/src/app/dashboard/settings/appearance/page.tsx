'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useThemeStore, THEME_PRESETS, ThemePreset } from '@/stores/themeStore';

export default function AppearanceSettings() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Theme store
  const {
    theme,
    themeType,
    presetId,
    customPrimary,
    customSecondary,
    customAccent,
    resolvedColors,
    setTheme,
    setPreset,
    setCustomColors,
    resetToDefault,
    saveToAPI,
    loadFromAPI,
  } = useThemeStore();

  // Local state for color picker inputs
  const [localPrimary, setLocalPrimary] = useState(customPrimary || resolvedColors.primary);
  const [localSecondary, setLocalSecondary] = useState(customSecondary || resolvedColors.secondary);
  const [localAccent, setLocalAccent] = useState(customAccent || resolvedColors.accent);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/login');
      return;
    }
    setToken(storedToken);

    // Load theme preferences from API
    loadFromAPI(storedToken);

    // Check premium status
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${API_URL}/api/v1/promo-codes/me/limits`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then((res) => res.json())
      .then((data) => setIsPremium(data.is_premium || false))
      .catch(() => setIsPremium(false));
  }, [router, loadFromAPI]);

  // Update local color state when store changes
  useEffect(() => {
    setLocalPrimary(customPrimary || resolvedColors.primary);
    setLocalSecondary(customSecondary || resolvedColors.secondary);
    setLocalAccent(customAccent || resolvedColors.accent);
  }, [customPrimary, customSecondary, customAccent, resolvedColors]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      await saveToAPI(token);
      setSaveMessage('Theme preferences saved!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handlePresetSelect = (preset: ThemePreset) => {
    if (!preset.is_free && !isPremium) {
      setSaveMessage('This theme requires a premium subscription');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    if (preset.id === 'default') {
      resetToDefault();
    } else {
      setPreset(preset.id);
    }
  };

  const handleCustomColorChange = () => {
    if (!isPremium) {
      setSaveMessage('Custom colors require a premium subscription');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setCustomColors({
      primary: localPrimary,
      secondary: localSecondary,
      accent: localAccent,
    });
  };

  const freePresets = Object.values(THEME_PRESETS).filter((p) => p.is_free);
  const premiumPresets = Object.values(THEME_PRESETS).filter((p) => !p.is_free);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Appearance Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Customize the look and feel of your Tarantuverse experience
          </p>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              saveMessage.includes('Failed') || saveMessage.includes('requires')
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            }`}
          >
            {saveMessage}
          </div>
        )}

        {/* Color Mode Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Color Mode
          </h2>
          <div className="flex gap-4">
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-center mb-2">
                <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                </svg>
              </div>
              <span className="text-gray-900 dark:text-white font-medium">Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-center mb-2">
                <svg className="w-8 h-8 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-900 dark:text-white font-medium">Dark</span>
            </button>
          </div>
        </section>

        {/* Theme Presets Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Theme Presets
          </h2>

          {/* Free Presets */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Free Themes
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {freePresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isSelected={
                    (themeType === 'default' && preset.id === 'default') ||
                    (themeType === 'preset' && presetId === preset.id)
                  }
                  isPremium={isPremium}
                  onClick={() => handlePresetSelect(preset)}
                />
              ))}
            </div>
          </div>

          {/* Premium Presets */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Premium Themes {!isPremium && <span className="text-yellow-500">- Upgrade to unlock</span>}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {premiumPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isSelected={themeType === 'preset' && presetId === preset.id}
                  isPremium={isPremium}
                  onClick={() => handlePresetSelect(preset)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Custom Colors Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Custom Colors
            </h2>
            {!isPremium && (
              <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                Premium Feature
              </span>
            )}
          </div>

          <div className={`${!isPremium ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <ColorPickerField
                label="Primary Color"
                value={localPrimary}
                onChange={setLocalPrimary}
                description="Main accent color for buttons and links"
              />
              <ColorPickerField
                label="Secondary Color"
                value={localSecondary}
                onChange={setLocalSecondary}
                description="Used in gradients and highlights"
              />
              <ColorPickerField
                label="Accent Color"
                value={localAccent}
                onChange={setLocalAccent}
                description="Additional accent for variety"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleCustomColorChange}
                disabled={!isPremium}
                className="px-4 py-2 bg-gradient-brand text-white rounded-lg hover:bg-gradient-brand-hover transition-all disabled:opacity-50"
              >
                Apply Custom Colors
              </button>
              <button
                onClick={resetToDefault}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
              >
                Reset to Default
              </button>
            </div>
          </div>
        </section>

        {/* Preview Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Preview
          </h2>
          <div className="space-y-4">
            {/* Gradient Preview */}
            <div
              className="h-16 rounded-lg bg-gradient-brand"
              style={{
                background: `linear-gradient(135deg, ${resolvedColors.primary} 0%, ${resolvedColors.secondary} 100%)`,
              }}
            />

            {/* Button Preview */}
            <div className="flex gap-4">
              <button
                className="px-6 py-2 text-white rounded-lg transition-all"
                style={{ backgroundColor: resolvedColors.primary }}
              >
                Primary Button
              </button>
              <button
                className="px-6 py-2 text-white rounded-lg transition-all"
                style={{ backgroundColor: resolvedColors.secondary }}
              >
                Secondary Button
              </button>
              <button
                className="px-6 py-2 text-white rounded-lg transition-all"
                style={{ backgroundColor: resolvedColors.accent }}
              >
                Accent Button
              </button>
            </div>

            {/* Text Preview */}
            <div className="flex gap-4 items-center">
              <span style={{ color: resolvedColors.primary }} className="font-semibold">
                Primary Text
              </span>
              <span style={{ color: resolvedColors.secondary }} className="font-semibold">
                Secondary Text
              </span>
              <span style={{ color: resolvedColors.accent }} className="font-semibold">
                Accent Text
              </span>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gradient-brand text-white rounded-lg hover:bg-gradient-brand-hover transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Preset Card Component
function PresetCard({
  preset,
  isSelected,
  isPremium,
  onClick,
}: {
  preset: ThemePreset;
  isSelected: boolean;
  isPremium: boolean;
  onClick: () => void;
}) {
  const isLocked = !preset.is_free && !isPremium;

  return (
    <button
      onClick={onClick}
      disabled={isLocked}
      className={`relative p-4 rounded-lg border-2 transition-all text-left ${
        isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : isLocked
          ? 'border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {/* Color Swatch */}
      <div
        className="h-12 rounded-md mb-3"
        style={{
          background: `linear-gradient(135deg, ${preset.primary} 0%, ${preset.secondary} 100%)`,
        }}
      />

      {/* Preset Info */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {preset.name}
        </span>
        {isLocked && (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
          </svg>
        )}
        {isSelected && (
          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {preset.species && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
          {preset.species}
        </p>
      )}
    </button>
  );
}

// Color Picker Field Component
function ColorPickerField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 rounded-lg cursor-pointer border border-gray-300 dark:border-gray-600"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white uppercase"
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
    </div>
  );
}
