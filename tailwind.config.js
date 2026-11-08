/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: {
          950: '#070709',
          900: '#0c0d10',
          850: '#121418',
          800: '#181b20',
          700: '#232730',
          600: '#323846',
        },
        rosso: {
          DEFAULT: '#dc143c',
          corsa: '#e11d2a',
          bright: '#ff2836',
          dark: '#990f19',
          glow: 'rgba(225, 29, 42, 0.35)',
        },
        modena: {
          yellow: '#facc15',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

