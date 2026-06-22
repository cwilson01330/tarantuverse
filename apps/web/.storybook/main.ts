import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook for the Tarantuverse web app (design system audit Action,
 * 2026-06-22) — renders the presentational/brand components in isolation so
 * the claude.ai/design agent (/design-sync) can import on-brand parts that
 * don't drag in fetch/auth/routing.
 *
 * Scope today: the presentational subset only (src/components/ui/* and the
 * brand primitives with no data/routing coupling). App-coupled components
 * ('use client' + fetch + next/*) are intentionally not storied yet.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
  staticDirs: ['../public'],
  docs: { autodocs: 'tag' },
  // The web tsconfig uses `jsx: "preserve"` (Next compiles JSX with SWC's
  // automatic runtime). The Vite builder transforms TSX with esbuild, which
  // would otherwise fall back to the CLASSIC runtime and require `import React`
  // in every file — these components don't import React (they don't need to
  // under Next), so force esbuild to the automatic runtime here. Fixes the
  // "React is not defined" render error without touching the app's tsconfig.
  async viteFinal(config) {
    config.esbuild = { ...(config.esbuild ?? {}), jsx: 'automatic', jsxImportSource: 'react' };
    return config;
  },
};

export default config;
