import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'

export default function ProtectedRoute({ children, role = null, skipMustChangeRedirect = false }) {
  const { user, loading, mustChangePassword } = useAuth()

  // Wait while AuthProvider checks for an existing cookie session on mount
  if (loading) return null

  // No authenticated user — redirect to login
  if (!user) {
    return <Navigate to="/" replace />
  }

  // Force password change before allowing access to other protected routes.
  // skipMustChangeRedirect is set on the /change-password route itself to avoid
  // an infinite redirect loop.
  if (!skipMustChangeRedirect && mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  // Role-based access control: show access denied page instead of redirecting
  if (role && user.role !== role) {
    return <AccessDenied />
  }

  return <>{children}</>
}
