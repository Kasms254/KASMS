import React, { useState, useEffect, useCallback, useContext } from 'react'
import { ThemeContext, defaultTheme } from './themeContext'
import { ColorSchemeContext } from './colorSchemeContext'
import { hexToRgb, rgbToCss, rgbToHex, forContrast, contrastRatio, mix } from '../lib/color'

// The surface each brand colour is judged against, per scheme. Must track
// --surface in styles/tokens.css.
const SURFACE = { light: [255, 255, 255], dark: [24, 24, 27] }

export function ThemeProvider({ children }) {
  // Optional so ThemeProvider still works if mounted without a scheme provider
  // (tests, storybook). Falls back to light.
  const { resolved = 'light' } = useContext(ColorSchemeContext) || {}

  const [theme, setThemeState] = useState(() => {
    // Try to load theme from localStorage on initial render
    try {
      const saved = localStorage.getItem('school_theme')
      if (saved) {
        return { ...defaultTheme, ...JSON.parse(saved) }
      }
    } catch {
      // ignore parse errors
    }
    return defaultTheme
  })

  // Publish branding as CSS variables, corrected for the active scheme.
  //
  // Schools pick brand colours against a white page. A deep navy or maroon is
  // invisible on a near-black surface, so each role is contrast-checked and
  // nudged. In light mode the school's colours are used as-is for the sidebar,
  // matching the previous behaviour exactly. `theme.*` itself stays untouched:
  // PDF export needs the true colour.
  useEffect(() => {
    const root = document.documentElement
    const surface = SURFACE[resolved] || SURFACE.light
    const isDark = resolved === 'dark'

    const primary = hexToRgb(theme.primary_color, hexToRgb(defaultTheme.primary_color))
    const secondary = hexToRgb(theme.secondary_color, hexToRgb(defaultTheme.secondary_color))
    const accent = hexToRgb(theme.accent_color, hexToRgb(defaultTheme.accent_color))

    // Solid brand fill (buttons, dots, accent bars). Two competing needs: it
    // must separate from the surface, and white label text on it must stay
    // readable. 3:1 against the surface is the binding constraint on dark.
    const brand = forContrast(primary, surface, 3)

    // Brand as text on the surface — the stricter 4.5:1 body-text target.
    const brandInk = forContrast(primary, surface, 4.5)

    // Tinted brand background (badges, soft panels): pulled most of the way to
    // the surface so it reads as a wash rather than a fill.
    const brandSoft = mix(primary, surface, isDark ? 0.85 : 0.92)

    root.style.setProperty('--brand', rgbToCss(brand))
    root.style.setProperty('--brand-ink', rgbToCss(brandInk))
    root.style.setProperty('--brand-soft', rgbToCss(brandSoft))

    // Sidebar gradient. Light mode uses the school's colours untouched. On
    // dark, a saturated block beside a near-black canvas glares, so it is
    // settled toward the canvas.
    const sidebarFrom = isDark ? mix(primary, [9, 9, 11], 0.35) : primary
    const sidebarTo = isDark ? mix(secondary, [9, 9, 11], 0.35) : secondary

    root.style.setProperty('--sidebar-primary', rgbToHex(sidebarFrom))
    root.style.setProperty('--sidebar-secondary', rgbToHex(sidebarTo))
    root.style.setProperty('--sidebar-primary-rgb', rgbToCss(sidebarFrom))
    root.style.setProperty('--sidebar-secondary-rgb', rgbToCss(sidebarTo))

    // Accent is used for highlights on the branded sidebar as well as on the
    // page, so it is checked against the surface too.
    const accentAdjusted = forContrast(accent, surface, 3)
    root.style.setProperty('--accent-color', rgbToHex(accentAdjusted))
    root.style.setProperty('--accent-color-rgb', rgbToCss(accentAdjusted))

    // Whether white or near-black sits better on the solid brand fill, so
    // buttons can pick a label colour instead of assuming white.
    const onBrand = contrastRatio(brand, [255, 255, 255]) >= 3 ? [255, 255, 255] : [24, 24, 27]
    root.style.setProperty('--brand-on', rgbToCss(onBrand))
  }, [theme, resolved])

  const setTheme = useCallback((newTheme) => {
    const merged = { ...defaultTheme, ...newTheme }
    setThemeState(merged)
    // Persist to localStorage
    try {
      localStorage.setItem('school_theme', JSON.stringify(merged))
    } catch {
      // ignore storage errors
    }
  }, [])

  const resetTheme = useCallback(() => {
    setThemeState(defaultTheme)
    try {
      localStorage.removeItem('school_theme')
    } catch {
      // ignore
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
