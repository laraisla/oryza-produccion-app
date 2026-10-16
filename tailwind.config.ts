import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        petrol: {
          50: '#eef7f8',
          100: '#d4eaee',
          200: '#a9d4dc',
          300: '#76b6c2',
          400: '#4794a3',
          500: '#2b7787',
          600: '#1f5f6d',
          700: '#1a4d59',
          800: '#173f49',
          900: '#12323a',
          950: '#0b2329',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
