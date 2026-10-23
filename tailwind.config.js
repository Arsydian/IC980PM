/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        radio: {
          bg: '#0f172a',
          surface: '#1e293b',
          surfaceLight: '#334155',
          border: '#334155',
          borderLight: '#475569',
          accent: '#38bdf8',
          accentHover: '#0284c7',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          text: '#f8fafc',
          textMuted: '#94a3b8'
        }
      }
    },
  },
  plugins: [],
}
