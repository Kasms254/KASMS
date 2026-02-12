import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'

export default function ProtectedRoute({ children, role = null }) {
  const { user, token, loading, mustChangePassword } = useAuth()

  // while validating token (if you add async validation) avoid rendering
  if (loading) return null

  // If we have a token but user hasn't been loaded yet, wait to avoid
  // a premature redirect while the auth provider fetches the current user.
  if (token && !user) return null

  // Defensive: require either a user object or a token to allow access
  if (!user && !token) {
    return <Navigate to="/" replace />
  }

  // Force password change before allowing access to protected routes
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  // Role-based access control: show access denied page instead of redirecting
  // This prevents users from bypassing authorization by manipulating URLs
  if (role && (!user || user.role !== role)) {
    return <AccessDenied />
  }

  return <>{children}</>
}
