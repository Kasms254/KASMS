import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AddResults from '../dashboard/instructors/AddResults'
import StudentResults from '../dashboard/students/StudentResults'

export default function ResultsRoute() {
  const { user, loading, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  if (loading) return null

  // Security: Require authentication
  if (!user) return <Navigate to="/login" replace />

  // Role-based access - only instructors and students
  if (user.role === 'instructor') return <AddResults />
  if (user.role === 'student') return <StudentResults />

  // Security: Admin/superadmin/unknown roles - logout and redirect
  if (!loggingOut) {
    console.warn('Unauthorized role in ResultsRoute:', user.role, '- logging out')
    setLoggingOut(true)
    logout()
  }
  return <Navigate to="/login" replace />
}
