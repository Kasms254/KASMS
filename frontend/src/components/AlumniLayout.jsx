import React from 'react'
import { Navigate } from 'react-router'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'
import Layout from './Layout'

export default function AlumniLayout() {
  const { user, token, loading, mustChangePassword } = useAuth()

  if (loading) return null
  if (token && !user) return null
  if (!user && !token) return <Navigate to="/" replace />
  if (mustChangePassword) return <Navigate to="/change-password" replace />

  if (!user || user.role !== 'student' || !user.is_alumni) {
    return <AccessDenied />
  }

  return <Layout />
}
