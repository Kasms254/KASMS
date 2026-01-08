import React from 'react'
import useAuth from '../hooks/useAuth'
import AddResults from '../dashboard/instructors/AddResults'
import StudentResults from '../dashboard/students/StudentResults'

export default function ResultsRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <StudentResults />

  // Only instructors and students can access results
  if (user.role === 'instructor') return <AddResults />
  return <StudentResults />
}
