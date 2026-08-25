import React from 'react'
import { Navigate } from 'react-router'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'
import Layout from './Layout'

const ALLOWED_ROLES = ['chief_of_training', 'superadmin']

export default function ChiefOfTrainingLayout() {
  const { user, token, loading, mustChangePassword } = useAuth()

  if (loading) return null
  if (token && !user) return null
  if (!user && !token) return <Navigate to="/" replace />
  if (mustChangePassword) return <Navigate to="/change-password" replace />

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return <AccessDenied />
  }

  return <Layout />
}
