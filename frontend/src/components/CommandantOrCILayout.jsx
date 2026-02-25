import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import AccessDenied from './AccessDenied'
import Layout from './Layout'

const ALLOWED_ROLES = ['commandant', 'chief_instructor']

export default function CommandantOrCILayout() {
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
