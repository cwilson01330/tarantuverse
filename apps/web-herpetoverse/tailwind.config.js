/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Herpetoverse brand palette (see docs/design/herpetoverse_brand_kit.pdf)
      colors: {
        herp: {
          green: '#00C853',   // Primary green
          teal:  '#00E5FF',   // Secondary teal
          deep:  '#0B6B3A',   // Deep green (shadows, hover states)
          lime:  '#39FF14',   // Accent lime (badges, highlights)
          dark:  '#0B0B0B',   // Background dark
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      // NOTE: don't define backgroundImage keys with the `herp-` prefix —
      // they collide with the `colors.herp.*` namespace in Tailwind v3's JIT
      // and never resolve. Use `bg-gradient-to-r from-herp-green to-herp-teal`
      // for gradient backgrounds, or the `.herp-gradient-bg` class in globals.css.
    },
  },
  plugins: [],
}
