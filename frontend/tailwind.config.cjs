/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Make Inter the primary sans font, then fall back to the system stack
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [
    // Custom plugin for sentence case utility class
    function({ addUtilities }) {
      addUtilities({
        '.sentence-case': {
          'text-transform': 'lowercase',
          '&::first-letter': {
            'text-transform': 'uppercase',
          },
        },
      })
    },
  ],
}
