/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Electric Blue to Neon Pink color scheme
        'electric-blue': {
          50: '#e6f0ff',
          100: '#cce0ff',
          200: '#99c2ff',
          300: '#66a3ff',
          400: '#3385ff',
          500: '#0066ff', // Main electric blue
          600: '#0052cc',
          700: '#003d99',
          800: '#002966',
          900: '#001433',
        },
        'neon-pink': {
          50: '#ffe6f5',
          100: '#ffcceb',
          200: '#ff99d6',
          300: '#ff66c2',
          400: '#ff33ad',
          500: '#ff0099', // Main neon pink
          600: '#cc007a',
          700: '#99005c',
          800: '#66003d',
          900: '#33001f',
        },
        // Dark mode backgrounds
        'dark': {
          DEFAULT: '#0a0a0f',
          50: '#1a1a24',
          100: '#131319',
          200: '#0f0f14',
          300: '#0a0a0f',
          400: '#060609',
          500: '#030304',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #0066ff 0%, #ff0099 100%)',
        'gradient-primary-hover': 'linear-gradient(135deg, #0052cc 0%, #cc007a 100%)',
        'gradient-dark': 'linear-gradient(135deg, #0a0a0f 0%, #1a1a24 100%)',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}
