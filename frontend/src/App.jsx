import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardIndex from './components/DashboardIndex'
import AdminDashboard from './dashboard/admin/AdminDashboard'
import InstructorsDashboard from './dashboard/instructors/InstructorsDashboard'
import Attendance from './dashboard/instructors/Attendance'
import Exams from './dashboard/instructors/Exams'
import StudentsDashboard from './dashboard/students/StudentsDashboard'
import StudentsRoute from './components/StudentsRoute'
import AddUser from './pages/AddUser'
import Courses from './dashboard/admin/Courses'
import CourseDetail from './dashboard/admin/CourseDetail'
import Classes from './dashboard/admin/Classes'
import AdminStudents from './dashboard/admin/AdminStudents'
import AdminInstructors from './dashboard/admin/AdminInstructors'
import Login from './pages/Login'
import SubjectsPage from './dashboard/admin/SubjectsPage'
import TeachingAssignments from './dashboard/admin/TeachingAssignments'

const App = () => {
	return (
		<Routes>
			{/* Public landing: login at root */}
			<Route path="/" element={<Login />} />

			{/* Application routes under /dashboard (wrapped with Layout) */}
			<Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<DashboardIndex />} />
				<Route path="admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
				<Route path="instructors" element={<InstructorsDashboard />} />
				<Route path="students" element={<StudentsRoute />} />
				<Route path="add/user" element={<ProtectedRoute role="admin"><AddUser /></ProtectedRoute>} />
			</Route>

			{/* Individual listing routes (used by sidebar links like /list/courses) */}
			{/* These listing pages require admin role (avoid showing 403 to non-admins) */}
			<Route path="/list/courses" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<Courses />} />
				<Route path=":id" element={<CourseDetail />} />
			</Route>

			{/* Admin user listings: students & instructors */}
			<Route path="/list/students" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<AdminStudents />} />
			</Route>

			<Route path="/list/instructors" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<AdminInstructors />} />
			</Route>

			{/* Classes list (active classes) */}
			<Route path="/list/classes" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Classes />} />
				<Route path=":id" element={<div className="p-4 text-black">Class detail (coming soon)</div>} />
			</Route>

			{/* Attendance (instructors & admins) */}
			<Route path="/list/attendance" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Attendance />} />
			</Route>

			{/* Exams listing (instructors, admins) */}
			<Route path="/list/exams" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Exams />} />
			</Route>

			{/* Subjects listing (by class) */}
			<Route path="/list/subjects" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<SubjectsPage />} />
			</Route>

			{/* Teaching assignments: create and view instructor-class-subject assignments (admin only) */}
			<Route path="/list/assignments" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<TeachingAssignments />} />
			</Route>
		</Routes>
	)
}

export default App