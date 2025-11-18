import React, { useState, useEffect } from 'react'
import AuthContext from './authContext'
import * as authStore from '../lib/auth'

export function AuthProvider({ children }) {
  // Remove any demo token left over from development runs while we wait for a real API.
  useEffect(() => {
    try {
      authStore.logout()
    } catch {
      // ignore
    }
  }, [])

  // Do not initialize any user or token automatically. All auth must come from the real API.
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const loading = false

  // login is intentionally a no-op for now. When the backend is available, implement
  // token persistence and user extraction here.
  function login() {
    // Example (commented):
    // authStore.login(newToken)
    // setToken(newToken)
    // setUser(userInfo)
    console.warn('AuthProvider.login called but auth is disabled until API is integrated')
  }

  function logout() {
    try {
      authStore.logout()
    } catch {
      // ignore
    }
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
