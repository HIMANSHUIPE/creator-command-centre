/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#FAF9F7',
        surface: '#FFFFFF',
        line: '#ECEAE5',
        ink: { DEFAULT: '#1C1B19', soft: '#57534E', mute: '#8A857D' },
        brand: { DEFAULT: '#4F46E5', soft: '#EEF0FF' },
        ig: { DEFAULT: '#AE3EC9', soft: '#F8F0FC' },
        yt: { DEFAULT: '#E03131', soft: '#FDECEC' },
        good: '#2F9E44',
        warn: '#E8590C',
        bad: '#C92A2A',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,27,25,0.04), 0 1px 3px rgba(28,27,25,0.06)',
      },
    },
  },
  plugins: [],
}
