import React from 'react'
import useAuth from '../hooks/useAuth'
import AdminStudents from '../dashboard/admin/AdminStudents'
import InstructorStudents from '../dashboard/instructors/InstructorStudents'
import StudentsDashboard from '../dashboard/students/StudentsDashboard'

export default function StudentsRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <StudentsDashboard />

  if (user.role === 'admin') return <AdminStudents />
  if (user.role === 'instructor') return <InstructorStudents />
  // default: student view
  return <StudentsDashboard />
}
