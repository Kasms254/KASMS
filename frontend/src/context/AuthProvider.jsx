import React, { useState, useEffect, useCallback, useContext, useRef } from 'react'
import AuthContext from './authContext'
import { ThemeContext } from './themeContext'
import * as api from '../lib/api'

const INACTIVITY_TIMEOUT_MS = 1 * 60 * 1000 // 30 minutes

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // true on mount while we check for an existing session
  const [mustChangePassword, setMustChangePassword] = useState(false)
  // twoFA holds { svc_number, password, email } during the 2FA step (never persisted to storage)
  const [twoFA, setTwoFA] = useState(null)
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
        // verifyToken validates the session AND re-checks student enrollment.
        // Response shape: { valid: true, user: {...} }
        const result = await api.verifyToken()
        const me = result?.user
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
                school_short_name: themeData.school_short_name || '',
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

      // Backend sends 2FA trigger — no tokens yet
      if (resp?.requires_2fa) {
        setTwoFA({ svc_number, password, email: resp.email })
        setLoading(false)
        return { ok: true, requires2FA: true, email: resp.email }
      }

      // Fallback: direct login response (if 2FA is ever disabled on backend).
      // Tokens are set as HTTP-only cookies by the server; no client-side storage needed.
      const userInfo = resp?.user || resp?.data || null
      if (!userInfo) throw new Error('Login failed: no user data returned')
      setUser(userInfo)
      const needsPasswordChange = !!resp?.must_change_password
      setMustChangePassword(needsPasswordChange)
      // Apply school theme immediately from the login response so users see
      // their school's branding right after login, not only after a page refresh.
      // UserListSerializer already includes school_theme in the login payload.
      if (userInfo?.role !== 'superadmin') {
        const themeData = userInfo?.school_theme
        if (themeData) {
          setTheme({
            primary_color: themeData.primary_color,
            secondary_color: themeData.secondary_color,
            accent_color: themeData.accent_color,
            logo_url: themeData.logo_url
              ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || ''}${themeData.logo_url}`)
              : null,
            school_name: themeData.school_name || userInfo.school_name,
            school_code: themeData.school_code || userInfo.school_code,
          })
        }
      }
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
      // Use generic messages — never expose whether the account exists,
      // whether credentials were valid, or any other backend-specific detail.
      const errorMessage = (err?.status >= 500)
        ? 'Unable to complete login. Please try again later.'
        : 'Login failed. Please check your credentials and try again.'
      return {
        ok: false,
        error: errorMessage,
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null
      }
    }
  }, [setTheme])

  // When api.js exhausts both the original request and the token refresh and
  // still gets 401, it dispatches 'auth:session-expired'. We clear all auth
  // state here so ProtectedRoute automatically redirects to the login page.
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null)
      setMustChangePassword(false)
      resetTheme()
    }
    window.addEventListener('auth:session-expired', handleSessionExpired)
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired)
  }, [resetTheme])

  const logout = useCallback(async () => {
    // Clear React state immediately so ProtectedRoute blocks any forward navigation
    // before the network request completes.
    setUser(null)
    setMustChangePassword(false)
    resetTheme()
    try {
      // Backend blacklists the refresh cookie and clears both cookies
      await api.logout()
    } catch {
      // ignore backend errors — React state is already clean
    }
  }, [resetTheme])

  const verify2FA = useCallback(async (code) => {
    if (!twoFA) return { ok: false, error: 'No active 2FA session. Please log in again.' }
    try {
      const resp = await api.verify2FA(twoFA.svc_number, twoFA.password, code)
      const me = resp?.user || null
      setTwoFA(null) // Clear credentials from memory immediately after use
      setUser(me)
      const needsPasswordChange = !!resp?.must_change_password
      setMustChangePassword(needsPasswordChange)
      if (me?.role !== 'superadmin') {
        const themeData = me?.school_theme
        if (themeData) {
          setTheme({
            primary_color: themeData.primary_color,
            secondary_color: themeData.secondary_color,
            accent_color: themeData.accent_color,
            logo_url: themeData.logo_url
              ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || ''}${themeData.logo_url}`)
              : null,
            school_name: themeData.school_name || me?.school_name,
            school_code: themeData.school_code || me?.school_code,
          })
        }
      }
      return { ok: true, mustChangePassword: needsPasswordChange }
    } catch (err) {
      const detail = err?.data?.error || err?.data?.detail || err?.message || 'Verification failed.'
      // Parse remaining attempts from error string if present (e.g. "Invalid code. 3 attempt(s) remaining.")
      const match = typeof detail === 'string' ? detail.match(/(\d+) attempt/) : null
      const remainingAttempts = match ? parseInt(match[1], 10) : null
      return { ok: false, error: detail, remainingAttempts }
    }
  }, [twoFA, setTheme])

  const resend2FA = useCallback(async () => {
    if (!twoFA) return { ok: false, error: 'No active 2FA session. Please log in again.' }
    try {
      const resp = await api.resend2FA(twoFA.svc_number, twoFA.password)
      if (resp?.email) {
        setTwoFA(prev => prev ? { ...prev, email: resp.email } : prev)
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err?.message || 'Failed to resend code. Please try again.' }
    }
  }, [twoFA])

  const clearTwoFA = useCallback(() => {
    setTwoFA(null)
  }, [])

  // Inactivity timer — log out after 30 minutes of no user interaction.
  // Only active while a user is logged in.
  const inactivityTimer = useRef(null)

  useEffect(() => {
    if (!user) return

    const resetTimer = () => {
      clearTimeout(inactivityTimer.current)
      inactivityTimer.current = setTimeout(() => {
        logout()
      }, INACTIVITY_TIMEOUT_MS)
    }

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }))
    resetTimer() // start the timer immediately on login / mount

    return () => {
      clearTimeout(inactivityTimer.current)
      events.forEach(evt => window.removeEventListener(evt, resetTimer))
    }
  }, [user, logout])

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, mustChangePassword, setMustChangePassword,
      verify2FA, resend2FA, clearTwoFA, twoFAEmail: twoFA?.email || null,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
