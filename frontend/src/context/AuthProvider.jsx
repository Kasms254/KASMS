import React, { useState, useEffect, useCallback, useContext } from 'react'
import AuthContext from './authContext'
import { ThemeContext } from './themeContext'
import * as api from '../lib/api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // true on mount while we check for an existing session
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const { setTheme, resetTheme } = useContext(ThemeContext)

  // On mount, always try to fetch the current user.
  // The browser will send the HTTP-only access_token cookie automatically.
  // If the cookie is missing or expired, the request returns 401 and we stay logged out.
  useEffect(() => {
    let mounted = true
    async function restoreSession() {
      setLoading(true)
      // Ensure the csrftoken cookie is set before any state-changing requests
      try {
        await fetch(`${import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL}/api/auth/csrf/`, { credentials: 'include' })
      } catch {
        // Non-fatal — proceed without CSRF cookie
      }
      try {
        const me = await api.getCurrentUser()
        if (mounted) {
          setUser(me)
          if (me?.must_change_password) setMustChangePassword(true)
          if (me?.role !== 'superadmin') {
            let themeData = me?.school_theme
            if (!themeData && me?.role === 'admin') {
              try {
                themeData = await api.getMySchoolTheme()
              } catch {
                // ignore theme fetch errors
              }
            }
            if (mounted && themeData) {
              setTheme({
                primary_color: themeData.primary_color,
                secondary_color: themeData.secondary_color,
                accent_color: themeData.accent_color,
                logo_url: themeData.logo_url
                  ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || ''}${themeData.logo_url}`)
                  : null,
                school_name: themeData.school_name || me.school_name,
                school_code: themeData.school_code || me.school_code,
              })
            }
          }
        }
      } catch {
        // No valid session — user stays logged out
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    restoreSession()
    return () => { mounted = false }
  }, [setTheme])

  const login = useCallback(async (svc_number, password) => {
    // Do NOT touch the shared `loading` state here — it is only for the initial
    // session-restore check. Toggling it during login unmounts <Login /> via
    // ProtectedLogin's `if (loading) return null`, which destroys any error state
    // before it can be displayed. The Login page manages its own local loading flag.
    try {
      // Backend returns { message, must_change_password, user } and sets tokens as HTTP-only cookies
      const resp = await api.login(svc_number, password)
      const userInfo = resp?.user || resp?.data || null
      setUser(userInfo)
      const needsPasswordChange = !!resp?.must_change_password
      setMustChangePassword(needsPasswordChange)
      return { ok: true, mustChangePassword: needsPasswordChange }
    } catch (err) {
      const fieldErrors = {}
      if (err?.data) {
        if (err.data.svc_number) {
          fieldErrors.svc_number = Array.isArray(err.data.svc_number)
            ? err.data.svc_number[0]
            : err.data.svc_number
        }
        if (err.data.password) {
          fieldErrors.password = Array.isArray(err.data.password)
            ? err.data.password[0]
            : err.data.password
        }
      }
      return {
        ok: false,
        error: err?.message || String(err),
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null
      }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // Backend blacklists the refresh cookie and clears both cookies
      await api.logout()
    } catch {
      // ignore backend errors — clear client state regardless
    } finally {
      setUser(null)
      setMustChangePassword(false)
      resetTheme()
    }
  }, [resetTheme])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, mustChangePassword, setMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  )
}
