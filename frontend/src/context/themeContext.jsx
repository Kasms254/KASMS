import React, { createContext, useState, useEffect, useCallback } from 'react'

// Default theme colors (matches current hardcoded values)
const defaultTheme = {
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

export function ThemeProvider({ children }) {
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

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    const root = document.documentElement

    // Set CSS custom properties for sidebar gradient
    root.style.setProperty('--sidebar-primary', theme.primary_color)
    root.style.setProperty('--sidebar-secondary', theme.secondary_color)
    root.style.setProperty('--accent-color', theme.accent_color)

    // Convert hex to RGB for use with opacity
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : '14, 165, 164' // fallback to teal
    }

    root.style.setProperty('--sidebar-primary-rgb', hexToRgb(theme.primary_color))
    root.style.setProperty('--sidebar-secondary-rgb', hexToRgb(theme.secondary_color))

  }, [theme])

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

export default ThemeContext
