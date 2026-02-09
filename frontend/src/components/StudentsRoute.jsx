import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AdminStudents from '../dashboard/admin/AdminStudents'
import InstructorStudents from '../dashboard/instructors/InstructorStudents'
import StudentsDashboard from '../dashboard/students/StudentsDashboard'

export default function StudentsRoute() {
  const { user, loading, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  if (loading) return null

  // Security: Require authentication
  if (!user) return <Navigate to="/login" replace />

  // Role-based access
  if (user.role === 'admin') return <AdminStudents />
  if (user.role === 'instructor') return <InstructorStudents />
  if (user.role === 'student') return <StudentsDashboard />

  // Security: Unknown role - logout and redirect
  if (!loggingOut) {
    console.warn('Unknown user role in StudentsRoute:', user.role, '- logging out')
    setLoggingOut(true)
    logout()
  }
  return <Navigate to="/login" replace />
}
