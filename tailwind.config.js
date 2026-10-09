/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#060d1f',
          900: '#0a1628',
          800: '#0f2044',
          700: '#162d5e',
          600: '#1e3a78',
        },
        cyber: {
          500: '#00c9d4',
          400: '#22e5f0',
          300: '#6ef0f7',
        },
        risk: {
          critical: '#ef4444',
          high: '#f97316',
          medium: '#eab308',
          low: '#22c55e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    }
  },
  plugins: []
}
