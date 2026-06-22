import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';

// The app's Tailwind layer + CSS-variable token system (light/dark + preset
// tokens). Importing it here means stories render with the exact same brand
// tokens the real app uses.
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { expanded: true, matchers: { color: /(background|color)$/i, date: /Date$/ } },
    backgrounds: { disable: true }, // theme decorator owns the surface color
  },
  // Mirrors ThemeProvider, which toggles a `light` / `dark` class on <html>.
  // The toolbar paint-roller switches themes so every component can be
  // checked in both modes.
  decorators: [
    withThemeByClassName({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],
};

export default preview;
