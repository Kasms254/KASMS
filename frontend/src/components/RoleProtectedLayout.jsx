import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'
import Layout from './Layout'

export default function RoleProtectedLayout({ role = null }) {
  const { user, token, loading, mustChangePassword } = useAuth()

  // while validating token avoid rendering
  if (loading) return null

  // If we have a token but user hasn't been loaded yet, wait
  if (token && !user) return null

  // Require authentication
  if (!user && !token) {
    return <Navigate to="/login" replace />
  }

  // Force password change before allowing access
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  // Check role authorization BEFORE rendering Layout
  // This ensures AccessDenied is shown WITHOUT sidebar/navbar
  if (role && (!user || user.role !== role)) {
    return <AccessDenied />
  }

  // User is authorized - render Layout with nested routes
  return <Layout />
}
