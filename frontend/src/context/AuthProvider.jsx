import React, { useState, useEffect, useCallback } from 'react'
import AuthContext from './authContext'
import * as authStore from '../lib/auth'
import * as api from '../lib/api'

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await api.getCurrentUser()
        setUser(userData)
      } catch (error) {
        console.log('Not authenticated')
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = useCallback(async (svc_number, password) => {
    try {
      const response = await api.login(svc_number, password)
      setUser(response.user)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }, [])


  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}