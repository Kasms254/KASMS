import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardIndex from './components/DashboardIndex'
import Login from './pages/Login'
import useAuth from './hooks/useAuth'

// Lazy load heavy dashboard components for better performance
const AdminDashboard = lazy(() => import('./dashboard/admin/AdminDashboard'))
const InstructorsDashboard = lazy(() => import('./dashboard/instructors/InstructorsDashboard'))
const StudentsDashboard = lazy(() => import('./dashboard/students/StudentsDashboard'))
const InstructorsSubjectsPage = lazy(() => import('./dashboard/instructors/SubjectsPage'))
const Attendance = lazy(() => import('./dashboard/instructors/Attendance'))
const Exams = lazy(() => import('./dashboard/instructors/Exams'))
const AddResults = lazy(() => import('./dashboard/instructors/AddResults'))
const ResultsRoute = lazy(() => import('./components/ResultsRoute'))
const StudentsRoute = lazy(() => import('./components/StudentsRoute'))
const AddUser = lazy(() => import('./pages/AddUser'))
const Courses = lazy(() => import('./dashboard/admin/Courses'))
const CourseDetail = lazy(() => import('./dashboard/admin/CourseDetail'))
const Classes = lazy(() => import('./dashboard/admin/Classes'))
const AdminStudents = lazy(() => import('./dashboard/admin/AdminStudents'))
const ClassDetail = lazy(() => import('./dashboard/instructors/ClassDetail'))
const AdminInstructors = lazy(() => import('./dashboard/admin/AdminInstructors'))
const SubjectsPage = lazy(() => import('./dashboard/admin/SubjectsPage'))
const TeachingAssignments = lazy(() => import('./dashboard/admin/TeachingAssignments'))
const Notices = lazy(() => import('./dashboard/admin/Notices'))
const ClassNotices = lazy(() => import('./dashboard/instructors/ClassNotices'))
const Notifications = lazy(() => import('./dashboard/shared/Notifications'))
const PerformanceAnalytics = lazy(() => import('./dashboard/shared/PerformanceAnalytics'))
const ExamReports = lazy(() => import('./dashboard/shared/ExamReports'))

// Loading component for code-split routes
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
)

const ProtectedLogin = () => {
	const { token } = useAuth()
	// Don't check loading here - let the Login component handle its own loading state
	// This prevents the white screen when login fails
	if (token) return <Navigate to="/dashboard" replace />
	return <Login />
}

const App = () => {
	return (
		<ErrorBoundary>
			<Suspense fallback={<LoadingFallback />}>
				<Routes>
			{/* Public landing: login at root - redirect to dashboard if already authenticated */}
			<Route path="/" element={<ProtectedLogin />} />

			{/* Application routes under /dashboard (wrapped with Layout) */}
			<Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<DashboardIndex />} />
				<Route path="admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
				<Route path="instructors" element={<InstructorsDashboard />} />
					<Route path="instructors/subjects" element={<ProtectedRoute role="instructor"><InstructorsSubjectsPage /></ProtectedRoute>} />
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

			{/* Notices (admin) */}
			<Route path="/list/notices" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<Notices />} />
			</Route>

			{/* Notifications (all authenticated users) */}
			<Route path="/list/notifications" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Notifications />} />
			</Route>

			{/* Class notices (instructors) */}
			<Route path="/list/class-notices" element={<ProtectedRoute role="instructor"><Layout /></ProtectedRoute>}>
				<Route index element={<ClassNotices />} />
			</Route>

			<Route path="/list/instructors" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<AdminInstructors />} />
			</Route>

			{/* Classes list (active classes) */}
			<Route path="/list/classes" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Classes />} />
				<Route path=":id" element={<ClassDetail />} />
			</Route>

			{/* Attendance (instructors & admins) */}
			<Route path="/list/attendance" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Attendance />} />
			</Route>

			{/* Exams listing (instructors, admins) */}
			<Route path="/list/exams" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Exams />} />
			</Route>

			{/* Results listing - shows instructor grading UI for instructors, student results for students */}
			<Route path="/list/results" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<ResultsRoute />} />
			</Route>

			{/* Subjects listing (by class) */}
			<Route path="/list/subjects" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<SubjectsPage />} />
			</Route>

			{/* Teaching assignments: create and view instructor-class-subject assignments (admin only) */}
			<Route path="/list/assignments" element={<ProtectedRoute role="admin"><Layout /></ProtectedRoute>}>
				<Route index element={<TeachingAssignments />} />
			</Route>

			{/* Performance Analytics (admins & instructors) */}
			<Route path="/analytics" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<PerformanceAnalytics />} />
			</Route>

			{/* Exam Reports (admins & instructors) */}
			<Route path="/list/exam-reports" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<ExamReports />} />
			</Route>
		</Routes>
			</Suspense>
		</ErrorBoundary>
	)
}

export default App