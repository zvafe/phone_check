/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#090d16',
          card: '#111827',
          border: '#1f2937',
          accent: '#38bdf8',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
        sunlight: {
          bg: '#000000',
          amber: '#FFB800',
          yellow: '#FFD700',
          green: '#00FF66',
          red: '#FF0033',
          border: '#FFFFFF',
          text: '#FFFFFF',
        },
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
};
