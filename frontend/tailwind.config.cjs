/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  // Force light mode app-wide: 'class' means `dark:` utilities only apply
  // when a `.dark` class is present on <html>, which the app never adds.
  // Without this, Tailwind's default 'media' strategy auto-activates any
  // `dark:` class from the OS/browser's prefers-color-scheme, regardless of
  // whether the app has a dark theme to go with it.
  darkMode: 'class',
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
