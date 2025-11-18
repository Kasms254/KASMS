import React, { useState, useEffect, useCallback } from 'react'
import AuthContext from './authContext'
import * as authStore from '../lib/auth'
import * as api from '../lib/api'

export function AuthProvider({ children }) {
  // initialize token from storage if present
  const [token, setToken] = useState(() => authStore.getToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)

  // try to load current user when token exists
  useEffect(() => {
    let mounted = true
    async function fetchUser() {
      if (!token) return
      setLoading(true)
      try {
        const me = await api.getCurrentUser()
        if (mounted) setUser(me)
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
  }, [token])

  const login = useCallback(async (svc_number, password) => {
    setLoading(true)
    try {
      const resp = await api.login(svc_number, password)
      // API may return { token, user }
      const newToken = resp?.token || resp?.access || null
      const userInfo = resp?.user || resp?.data || null
      if (!newToken) throw new Error('No token returned from login')
      authStore.login(newToken)
      setToken(newToken)
      setUser(userInfo)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    try {
      authStore.logout()
    } catch {
      // ignore
    }
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
