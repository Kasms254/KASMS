import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminDashboard from './dashboard/admin/AdminDashboard'
import InstructorsDashboard from './dashboard/admin/AdminInstructors'
import StudentsDashboard from './dashboard/admin/AdminStudents'
import Login from './pages/Login'

const App = () => {
	return (
		<Routes>
			{/* Public landing: login at root */}
			<Route path="/" element={<Login />} />

			{/* Application routes under /dashboard (wrapped with Layout) */}
			<Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<AdminDashboard />} />
				<Route path="admin" element={<AdminDashboard />} />
				<Route path="instructors" element={<InstructorsDashboard />} />
				<Route path="students" element={<StudentsDashboard />} />
			</Route>
		</Routes>
	)
}

export default App