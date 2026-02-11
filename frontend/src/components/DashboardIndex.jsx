import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function DashboardIndex() {
  const { user, loading, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  // Logout users with invalid/undefined roles to prevent infinite redirect loop
  useEffect(() => {
    if (!loading && user && !user.role && !loggingOut) {
      console.warn('User has undefined role - logging out to prevent redirect loop')
      setLoggingOut(true)
      logout()
    }
  }, [user, loading, logout, loggingOut])

  if (loading) return null

  // If not logged in, go to login
  if (!user) return <Navigate to="/" replace />

  // Redirect based on role
  if (user.role === 'superadmin') return <Navigate to="/superadmin" replace />
  if (user.role === 'admin') return <Navigate to="/dashboard/admin" replace />
  if (user.role === 'instructor') return <Navigate to="/dashboard/instructors" replace />
  if (user.role === 'student') return <Navigate to="/dashboard/students" replace />

  // Security: Unknown/invalid role - logout and redirect
  // This prevents unauthorized access and infinite redirect loops
  if (!loggingOut) {
    console.warn('Unknown user role:', user.role, '- logging out')
    setLoggingOut(true)
    logout()
  }
  return <Navigate to="/" replace />
}
