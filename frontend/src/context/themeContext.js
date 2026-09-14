import { createContext } from 'react'

// Per-school branding (logo, name, brand colours), populated from the school
// record the superadmin configured — see AuthProvider, which calls setTheme
// with `me.school_theme` (or api.getMySchoolTheme()).
//
// Distinct from colorSchemeContext, which carries light/dark. The two compose:
// branding supplies the hue, the scheme supplies what it is rendered against.
//
// Context lives apart from its provider so the provider file only exports
// components (react-refresh/only-export-components), matching authContext.js.

// Fallback only — used before login, and if a school has no theme configured.
export const defaultTheme = {
  primary_color: '#0ea5a4',
  secondary_color: '#166534',
  accent_color: '#FFC107',
  logo_url: null,
  school_name: 'KASMS',
  school_code: null,
}

export const ThemeContext = createContext({
  theme: defaultTheme,
  setTheme: () => {},
  resetTheme: () => {},
})

export default ThemeContext
