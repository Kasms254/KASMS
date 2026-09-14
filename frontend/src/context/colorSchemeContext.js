import { createContext } from 'react'

// Light/dark scheme. Deliberately separate from themeContext, which carries
// per-school branding (logo, primary/secondary colour). The two compose:
// branding supplies the hue, this supplies the scheme it is rendered in.
//
// Context lives apart from its provider so the provider file only exports
// components (react-refresh/only-export-components), matching authContext.js.

export const STORAGE_KEY = 'kasms_color_scheme'

// 'system' follows the OS; 'light'/'dark' pin it.
export const MODES = ['light', 'dark', 'system']

export const ColorSchemeContext = createContext({
  scheme: 'system',
  resolved: 'light',
  setScheme: () => {},
  toggle: () => {},
})

export default ColorSchemeContext
