/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#FF5C34',
        'app-bg': '#F2F2F7',
        'ios-label': '#8E8E93',
      },
    },
  },
  plugins: [],
}

