import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function DashboardIndex() {
  const { user, loading } = useAuth()

  if (loading) return null

  // If not logged in, go to login
  if (!user) return <Navigate to="/" replace />

  // Redirect based on role
  if (user.role === 'superadmin') return <Navigate to="/superadmin" replace />
  if (user.role === 'admin') return <Navigate to="/dashboard/admin" replace />
  if (user.role === 'instructor') return <Navigate to="/dashboard/instructors" replace />
  if (user.role === 'student') return <Navigate to="/dashboard/students" replace />

  // Fallback: send to students dashboard
  return <Navigate to="/dashboard/students" replace />
}
