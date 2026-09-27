/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef3fa',
          100: '#d9e4f3',
          200: '#b3c8e6',
          500: '#2a5fa8',
          600: '#1f4e8f',
          700: '#183e73',
          800: '#132f57',
          900: '#0f2440',
        },
        ok: { DEFAULT: '#0ca30c', text: '#006300', bg: '#e9f6e9' },
        warn: { DEFAULT: '#fab219', text: '#8a5a00', bg: '#fff6e0' },
        bad: { DEFAULT: '#d03b3b', text: '#a12626', bg: '#fcebeb' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
