import React from 'react'
import { Navigate } from 'react-router'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'
import Layout from './Layout'
import { COT_DASHBOARD_ROLES } from '../lib/roles'

const ALLOWED_ROLES = [...COT_DASHBOARD_ROLES, 'superadmin']

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
