import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminDashboard from './dashboard/admin/AdminDashboard'
import InstructorsDashboard from './dashboard/admin/AdminInstructors'
import StudentsDashboard from './dashboard/admin/AdminStudents'
import AddUser from './pages/AddUser'
import Courses from './dashboard/admin/Courses'
import CourseDetail from './dashboard/admin/CourseDetail'
import Classes from './dashboard/admin/Classes'
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
				<Route path="add/user" element={<AddUser />} />
			</Route>

			{/* Individual listing routes (used by sidebar links like /list/courses) */}
			<Route path="/list/courses" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Courses />} />
				<Route path=":id" element={<CourseDetail />} />
			</Route>

			{/* Classes list (active classes) */}
			<Route path="/list/classes" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Classes />} />
				<Route path=":id" element={<div className="p-4 text-black">Class detail (coming soon)</div>} />
			</Route>
		</Routes>
	)
}

export default App