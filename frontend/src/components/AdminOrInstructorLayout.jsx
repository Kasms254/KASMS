import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'
import Layout from './Layout'

export default function AdminOrInstructorLayout() {
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

  // Check if user is admin OR instructor
  // Students will see AccessDenied WITHOUT sidebar/navbar
  if (!user || (user.role !== 'admin' && user.role !== 'instructor')) {
    return <AccessDenied />
  }

  // User is authorized (admin or instructor) - render Layout with nested routes
  return <Layout />
}
