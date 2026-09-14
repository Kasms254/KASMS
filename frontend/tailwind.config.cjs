/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');
const palette = require('./src/styles/palette.cjs');

// Every token resolves through a CSS variable, so a single `.dark` class on
// <html> reschemes the whole app. `<alpha-value>` keeps opacity modifiers
// (bg-surface/80, ring-line/50) working.
const tok = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
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
      colors: {
        // Structural neutrals. Backgrounds get progressively lighter in light
        // mode and progressively lighter-on-dark in dark mode; `fg-*` is the
        // text ramp from strongest to faintest.
        canvas: tok('canvas'),
        surface: {
          DEFAULT: tok('surface'),
          2: tok('surface-2'),
          3: tok('surface-3'),
          4: tok('surface-4'),
          5: tok('surface-5'),
        },
        inverse: tok('inverse'),
        fg: {
          DEFAULT: tok('fg'),
          body: tok('fg-body'),
          muted: tok('fg-muted'),
          soft: tok('fg-soft'),
          faint: tok('fg-faint'),
        },
        hair: tok('hair'),
        line: {
          DEFAULT: tok('line'),
          strong: tok('line-strong'),
        },

        // Per-school branding, resolved at runtime by themeContext and
        // luminance-corrected for the active scheme.
        brand: {
          DEFAULT: tok('brand'),
          ink: tok('brand-ink'),
          soft: tok('brand-soft'),
          on: tok('brand-on'),
        },

        // Accent scales, split by role so the same shade can mean different
        // things as a background vs. as text. Generated — see
        // scripts/gen-tokens.cjs.
        ...palette,
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
