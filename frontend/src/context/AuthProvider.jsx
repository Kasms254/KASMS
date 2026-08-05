import React, { useState, useEffect, useCallback, useContext, useRef } from 'react'
import AuthContext from './authContext'
import { ThemeContext } from './themeContext'
import * as api from '../lib/api'
import { queryClient } from '../lib/queryClient'
import InactivityWarningModal from '../components/InactivityWarningModal'

// Mirrors the backend's ACCESS_TOKEN_LIFETIME (SIMPLE_JWT in kasms/settings.py).
// Keep the two in sync if either changes.
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
// How long before the timeout to warn the user, giving them a chance to stay signed in.
const INACTIVITY_WARNING_MS = 10 * 1000 // 10 seconds

// Session hint: the auth tokens are HTTP-only cookies, so JS cannot check
// whether a session exists without a network round-trip. This localStorage
// flag is set on login and cleared on logout/expiry, letting restoreSession()
// skip the verify-token + token-refresh requests entirely for anonymous
// visitors (e.g. on the public landing page). It is only a hint — the server
// still validates the actual cookies on every request.
const SESSION_HINT_KEY = 'kasms_has_session'

function hasSessionHint() {
  try { return window.localStorage.getItem(SESSION_HINT_KEY) === '1' } catch { return false }
}
function setSessionHint() {
  try { window.localStorage.setItem(SESSION_HINT_KEY, '1') } catch { /* ignore */ }
}
function clearSessionHint() {
  try { window.localStorage.removeItem(SESSION_HINT_KEY) } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // true on mount while we check for an existing session
  const [mustChangePassword, setMustChangePassword] = useState(false)
  // twoFA holds { svc_number, password, email } during the 2FA step (never persisted to storage)
  const [twoFA, setTwoFA] = useState(null)
  // totpPending holds { svc_number, password } during the TOTP login-verify step (never persisted to storage)
  const [totpPending, setTotpPending] = useState(null)
  const { setTheme, resetTheme } = useContext(ThemeContext)

  // On mount, always try to fetch the current user.
  // The browser will send the HTTP-only access_token cookie automatically.
  // If the cookie is missing or expired, the request returns 401 and we stay logged out.
  useEffect(() => {
    let mounted = true
    async function restoreSession() {
      // No session hint means the user never logged in (or explicitly logged
      // out) — skip the network entirely so public pages make zero requests.
      if (!hasSessionHint()) {
        setUser(null)
        setLoading(false)
        return
      }
      setLoading(true)
      // Ensure the csrftoken cookie is set before any state-changing requests
      await api.ensureCsrfCookie()
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
                  ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${api.API_BASE}${themeData.logo_url}`)
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

      // Backend requires an authenticator app code — no tokens yet
      if (resp?.requires_totp) {
        setTotpPending({ svc_number, password })
        setLoading(false)
        return { ok: true, requiresTOTP: true }
      }

      // Fallback: direct login response (if 2FA is ever disabled on backend).
      // Tokens are set as HTTP-only cookies by the server; no client-side storage needed.
      const userInfo = resp?.user || resp?.data || null
      if (!userInfo) throw new Error('Login failed: no user data returned')
      setSessionHint()
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
              ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${api.API_BASE}${themeData.logo_url}`)
              : null,
            school_name: themeData.school_name || userInfo.school_name,
            school_short_name: themeData.school_short_name || '',
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
      const errorMessage = (err instanceof TypeError && !err.status)
        ? 'Network error. Please check your connection and try again.'
        : (err?.message || 'Login failed. Please try again.')
      return {
        ok: false,
        error: errorMessage,
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null
      }
    }
  }, [setTheme])

  // Re-fetches the current user from the server and updates the cached
  // `user` object in context. Needed after actions that change fields on
  // User but don't go through login/verify (e.g. enabling/disabling TOTP,
  // which is called directly from the settings/setup pages, not through
  // this provider) — without this, `user.totp_enabled` would keep showing
  // its value from the last login until the next full page load.
  const refreshUser = useCallback(async () => {
    try {
      const me = await api.getCurrentUser()
      setUser(me)
      return me
    } catch {
      return null
    }
  }, [])

  // When api.js exhausts both the original request and the token refresh and
  // still gets 401, it dispatches 'auth:session-expired'. We clear all auth
  // state here so ProtectedRoute automatically redirects to the login page.
  useEffect(() => {
    const handleSessionExpired = () => {
      clearSessionHint()
      setUser(null)
      setMustChangePassword(false)
      resetTheme()
      queryClient.clear()
    }
    window.addEventListener('auth:session-expired', handleSessionExpired)
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired)
  }, [resetTheme])

  const logout = useCallback(async () => {
    // Clear React state immediately so ProtectedRoute blocks any forward navigation
    // before the network request completes.
    clearSessionHint()
    setUser(null)
    setMustChangePassword(false)
    resetTheme()
    queryClient.clear()
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
      setSessionHint()
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
              ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${api.API_BASE}${themeData.logo_url}`)
              : null,
            school_name: themeData.school_name || me?.school_name,
            school_short_name: themeData.school_short_name || '',
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

  const verifyTOTP = useCallback(async (code) => {
    if (!totpPending) return { ok: false, error: 'No active TOTP session. Please log in again.' }
    try {
      const resp = await api.totpVerifyLogin(totpPending.svc_number, totpPending.password, code)
      const me = resp?.user || null
      setTotpPending(null) // Clear credentials from memory immediately after use
      setSessionHint()
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
              ? (themeData.logo_url.startsWith('http') ? themeData.logo_url : `${api.API_BASE}${themeData.logo_url}`)
              : null,
            school_name: themeData.school_name || me?.school_name,
            school_short_name: themeData.school_short_name || '',
            school_code: themeData.school_code || me?.school_code,
          })
        }
      }
      return { ok: true, mustChangePassword: needsPasswordChange }
    } catch (err) {
      const detail = err?.data?.error || err?.data?.detail || err?.message || 'Verification failed.'
      const match = typeof detail === 'string' ? detail.match(/(\d+) attempt/) : null
      const remainingAttempts = match ? parseInt(match[1], 10) : null
      return { ok: false, error: detail, remainingAttempts }
    }
  }, [totpPending, setTheme])

  const clearTotpPending = useCallback(() => {
    setTotpPending(null)
  }, [])

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

  // Inactivity timer — warn INACTIVITY_WARNING_MS before logging out after
  // INACTIVITY_TIMEOUT_MS of no user interaction, so the session doesn't end
  // without notice. Only active while a user is logged in.
  const inactivityTimer = useRef(null)
  const warningTimer = useRef(null)
  const countdownInterval = useRef(null)
  const resetTimerRef = useRef(() => {})
  const [showInactivityWarning, setShowInactivityWarning] = useState(false)
  const [inactivityCountdown, setInactivityCountdown] = useState(INACTIVITY_WARNING_MS / 1000)

  useEffect(() => {
    if (!user) return

    const clearAllTimers = () => {
      clearTimeout(warningTimer.current)
      clearTimeout(inactivityTimer.current)
      clearInterval(countdownInterval.current)
    }

    const resetTimer = () => {
      clearAllTimers()
      setShowInactivityWarning(false)

      warningTimer.current = setTimeout(() => {
        let secondsLeft = INACTIVITY_WARNING_MS / 1000
        setInactivityCountdown(secondsLeft)
        setShowInactivityWarning(true)
        countdownInterval.current = setInterval(() => {
          secondsLeft -= 1
          setInactivityCountdown(secondsLeft)
          if (secondsLeft <= 0) clearInterval(countdownInterval.current)
        }, 1000)
      }, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS)

      inactivityTimer.current = setTimeout(() => {
        logout()
      }, INACTIVITY_TIMEOUT_MS)
    }
    resetTimerRef.current = resetTimer

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }))
    resetTimer() // start the timer immediately on login / mount

    return () => {
      clearAllTimers()
      events.forEach(evt => window.removeEventListener(evt, resetTimer))
      setShowInactivityWarning(false)
      setInactivityCountdown(INACTIVITY_WARNING_MS / 1000)
    }
  }, [user, logout])

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, mustChangePassword, setMustChangePassword,
      verify2FA, resend2FA, clearTwoFA, twoFAEmail: twoFA?.email || null,
      verifyTOTP, clearTotpPending, requiresTOTP: !!totpPending, refreshUser,
    }}>
      {children}
      <InactivityWarningModal
        open={showInactivityWarning}
        secondsLeft={inactivityCountdown}
        onStay={() => resetTimerRef.current()}
        onLogout={logout}
      />
    </AuthContext.Provider>
  )
}
