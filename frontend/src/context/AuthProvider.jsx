import React, { useState, useEffect, useCallback, useContext } from 'react'
import AuthContext from './authContext'
import { ThemeContext } from './themeContext'
import * as authStore from '../lib/auth'
import * as api from '../lib/api'

export function AuthProvider({ children }) {
  // initialize token from storage if present
  const [token, setToken] = useState(() => authStore.getToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const { setTheme, resetTheme } = useContext(ThemeContext)

  // try to load current user and school theme when token exists
  useEffect(() => {
    let mounted = true
    async function fetchUser() {
      if (!token) return
      setLoading(true)
      try {
        const me = await api.getCurrentUser()
        if (mounted) {
          setUser(me)
          // Apply school theme after getting user
          // The user object from /api/auth/me/ includes school_theme if user has a school
          // For admin users linked via SchoolAdmin (not directly on User), fall back to API call
          // Apply school theme (superadmins don't have a school)
          if (me?.role !== 'superadmin') {
            let themeData = me?.school_theme

            // If no theme in user object, try fetching via API (for admin users linked via SchoolAdmin)
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
                logo_url: themeData.logo_url,
                school_name: themeData.school_name || me.school_name,
                school_code: themeData.school_code || me.school_code,
              })
            }
          }
        }
      } catch {
        // token may be invalid; clear it
        authStore.logout()
        if (mounted) setToken(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchUser()
    return () => {
      mounted = false
    }
  }, [token, setTheme])

  const login = useCallback(async (svc_number, password) => {
    setLoading(true)
    try {
      const resp = await api.login(svc_number, password)
      // API may return { access, refresh, user }
      const newAccess = resp?.access || resp?.token || null
      const newRefresh = resp?.refresh || resp?.refresh_token || null
      const userInfo = resp?.user || resp?.data || null
      if (!newAccess) throw new Error('No access token returned from login')
      // store tokens in auth store (in-memory)
      authStore.login({ access: newAccess, refresh: newRefresh })
      setToken(newAccess)
      setUser(userInfo)
      setLoading(false)
      return { ok: true }
    } catch (err) {
      // Extract field-level errors if present
      const fieldErrors = {}
      if (err?.data) {
        // Handle Django REST Framework field-level errors
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

  const logout = useCallback(async () => {
    // Try to notify backend to blacklist the refresh token, then clear local tokens
    try {
      const refresh = authStore.getRefreshToken && authStore.getRefreshToken()
      if (refresh) {
        try {
          await api.logout(refresh)
        } catch {
          // ignore backend logout errors
        }
      }
    } catch {
      // ignore
    } finally {
      try { authStore.logout() } catch { /* ignore */ }
      setToken(null)
      setUser(null)
      resetTheme() // Clear school theme on logout
    }
  }, [resetTheme])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
