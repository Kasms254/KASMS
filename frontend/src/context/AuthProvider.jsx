import React, { useState, useEffect, useCallback, useContext } from 'react'
import AuthContext from './authContext'
import { ThemeContext } from './themeContext'
import * as authStore from '../lib/auth'
import * as api from '../lib/api'

export function AuthProvider({ children }) {
  // Bearer-token mode: token stored in localStorage
  const [token, setToken] = useState(() => authStore.getToken())
  // Cookie-session mode: backend uses HTTP-only cookies; we only track a flag
  const [cookieSession, setCookieSession] = useState(
    () => authStore.isSessionActive() && !authStore.getToken()
  )
  const [user, setUser] = useState(null)
  // Start loading=true if there's any active session so ProtectedRoute waits on page reload
  const [loading, setLoading] = useState(() => authStore.isSessionActive())
  const [mustChangePassword, setMustChangePassword] = useState(false)
  // twoFA holds { svc_number, password, email } during the 2FA step (never persisted to storage)
  const [twoFA, setTwoFA] = useState(null)
  const { setTheme, resetTheme } = useContext(ThemeContext)

  // Load current user and school theme on mount or when auth state changes.
  // Runs for both Bearer-token sessions and cookie-based sessions.
  useEffect(() => {
    let mounted = true
    async function fetchUser() {
      // Skip if there is definitely no active session
      if (!token && !cookieSession) {
        if (mounted) setLoading(false)
        return
      }
      setLoading(true)
      try {
        // For cookie-based sessions, credentials:'include' in api.js sends the cookie
        const me = await api.getCurrentUser()
        if (mounted) {
          setUser(me)
          if (me?.must_change_password) {
            setMustChangePassword(true)
          }
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
                school_short_name: themeData.school_short_name || '',
                school_code: themeData.school_code || me.school_code,
              })
            }
          }
        }
      } catch {
        // Session is invalid — clear everything
        authStore.logout() // clears localStorage tokens + session flag
        if (mounted) {
          setToken(null)
          setCookieSession(false)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchUser()
    return () => {
      mounted = false
    }
  }, [token, cookieSession, setTheme])

  const login = useCallback(async (svc_number, password) => {
    setLoading(true)
    try {
      const resp = await api.login(svc_number, password)

      // Backend sends 2FA trigger — no tokens yet
      if (resp?.requires_2fa) {
        setTwoFA({ svc_number, password, email: resp.email })
        setLoading(false)
        return { ok: true, requires2FA: true, email: resp.email }
      }

      // Fallback: direct token response (if 2FA ever disabled on backend)
      const newAccess = resp?.access || resp?.token || null
      const newRefresh = resp?.refresh || resp?.refresh_token || null
      const userInfo = resp?.user || resp?.data || null
      if (!newAccess) throw new Error('No access token returned from login')
      authStore.login({ access: newAccess, refresh: newRefresh })
      setToken(newAccess)
      setUser(userInfo)
      const needsPasswordChange = !!resp?.must_change_password
      setMustChangePassword(needsPasswordChange)
      setLoading(false)
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
      setLoading(false)
      return {
        ok: false,
        error: err?.message || String(err),
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null
      }
    }
  }, [])

  const verify2FA = useCallback(async (code) => {
    if (!twoFA) return { ok: false, error: 'Session expired. Please log in again.' }
    setLoading(true)
    try {
      // Backend sets tokens as HTTP-only cookies — they are NOT in the response body.
      // credentials:'include' in api.js ensures the cookies are stored by the browser.
      const resp = await api.verify2FA(twoFA.svc_number, twoFA.password, code)

      const userInfo = resp?.user || null
      if (!userInfo) throw new Error('Login failed. Please try again.')

      // Mark cookie session active so the app persists auth across page reloads
      authStore.setSessionActive(true)
      setCookieSession(true)
      setUser(userInfo)
      setTwoFA(null)
      const needsPasswordChange = !!resp?.must_change_password
      setMustChangePassword(needsPasswordChange)
      setLoading(false)
      return { ok: true, mustChangePassword: needsPasswordChange }
    } catch (err) {
      setLoading(false)
      const remaining = err?.data?.remaining_attempts
      const msg = err?.data?.error || err?.message || 'Verification failed'
      return {
        ok: false,
        error: msg,
        remainingAttempts: remaining !== undefined ? remaining : null
      }
    }
  }, [twoFA])

  const resend2FA = useCallback(async () => {
    if (!twoFA) return { ok: false, error: 'No active session' }
    try {
      const resp = await api.resend2FA(twoFA.svc_number, twoFA.password)
      if (resp?.email) {
        setTwoFA(prev => prev ? { ...prev, email: resp.email } : prev)
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err?.message || 'Failed to resend code' }
    }
  }, [twoFA])

  const clearTwoFA = useCallback(() => {
    setTwoFA(null)
  }, [])

  const logout = useCallback(async () => {
    try {
      const refresh = authStore.getRefreshToken && authStore.getRefreshToken()
      if (refresh) {
        try {
          await api.logout(refresh)
        } catch {
          // ignore backend logout errors
        }
      } else if (cookieSession) {
        // Cookie-based session: notify backend to clear cookies
        try {
          await api.logout(null)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    } finally {
      try { authStore.logout() } catch { /* ignore */ } // clears localStorage + session flag
      setToken(null)
      setCookieSession(false)
      setUser(null)
      setMustChangePassword(false)
      setTwoFA(null)
      resetTheme()
    }
  }, [resetTheme, cookieSession])

  return (
    <AuthContext.Provider value={{
      token, user, loading,
      login, logout,
      mustChangePassword, setMustChangePassword,
      verify2FA, resend2FA, clearTwoFA,
      twoFAEmail: twoFA?.email,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
