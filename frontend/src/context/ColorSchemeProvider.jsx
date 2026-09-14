import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ColorSchemeContext, STORAGE_KEY, MODES } from './colorSchemeContext'

const prefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

const readStored = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return MODES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function ColorSchemeProvider({ children }) {
  const [scheme, setSchemeState] = useState(readStored)
  const [systemDark, setSystemDark] = useState(prefersDark)

  // Track the OS preference so 'system' stays live rather than sampled once.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = scheme === 'system' ? (systemDark ? 'dark' : 'light') : scheme

  // Drive the .dark class that every token in styles/tokens.css keys off.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
    // theme-color is left alone deliberately — it carries the brand maroon
    // for mobile browser chrome and is not a function of the app scheme.
  }, [resolved])

  const setScheme = useCallback((next) => {
    if (!MODES.includes(next)) return
    // Enable the crossfade only for a deliberate switch, so the initial paint
    // and OS-driven changes don't animate.
    const root = document.documentElement
    root.classList.add('scheme-transition')
    window.setTimeout(() => root.classList.remove('scheme-transition'), 220)

    setSchemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore storage errors (private mode, blocked site data)
    }
  }, [])

  // Cycles light → dark → system, so the OS option stays reachable from the
  // same control rather than needing a separate menu.
  const toggle = useCallback(() => {
    setScheme(MODES[(MODES.indexOf(scheme) + 1) % MODES.length])
  }, [scheme, setScheme])

  const value = useMemo(
    () => ({ scheme, resolved, setScheme, toggle }),
    [scheme, resolved, setScheme, toggle],
  )

  return (
    <ColorSchemeContext.Provider value={value}>
      {children}
    </ColorSchemeContext.Provider>
  )
}

export default ColorSchemeProvider
