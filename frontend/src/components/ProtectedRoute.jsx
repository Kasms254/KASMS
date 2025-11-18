import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function ProtectedRoute({ children, role = null }) {
  const { user, token, loading } = useAuth()

  // while validating token (if you add async validation) avoid rendering
  if (loading) return null

  // Defensive: require either a user object or a token to allow access
  if (!user && !token) {
    return <Navigate to="/" replace />
  }

  if (role && (!user || user.role !== role)) {
    // Not authorized for this role
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
