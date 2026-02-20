import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import RoleProtectedLayout from './components/RoleProtectedLayout'
import AdminOrInstructorLayout from './components/AdminOrInstructorLayout'
import InstructorOrStudentLayout from './components/InstructorOrStudentLayout'
import DashboardIndex from './components/DashboardIndex'
import Login from './pages/Login'
import IntroPage from './pages/IntroPage'
import useAuth from './hooks/useAuth'

// Lazy load heavy dashboard components for better performance
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const AdminDashboard = lazy(() => import('./dashboard/admin/AdminDashboard'))
const InstructorsDashboard = lazy(() => import('./dashboard/instructors/InstructorsDashboard'))
const StudentsDashboard = lazy(() => import('./dashboard/students/StudentsDashboard'))
const InstructorsSubjectsPage = lazy(() => import('./dashboard/instructors/SubjectsPage'))
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
const AttendanceSessions = lazy(() => import('./dashboard/instructors/AttendanceSessions'))
const SessionAttendance = lazy(() => import('./dashboard/instructors/SessionAttendance'))
const StudentAttendance = lazy(() => import('./dashboard/students/StudentAttendance'))
const AttendanceReports = lazy(() => import('./dashboard/shared/AttendanceReports'))
const Certificates = lazy(() => import('./dashboard/admin/Certificates'))
const ClassCertificates = lazy(() => import('./dashboard/admin/ClassCertificates'))
const StudentCertificates = lazy(() => import('./dashboard/students/StudentCertificates'))
const CertificateTemplates = lazy(() => import('./dashboard/admin/CertificateTemplates'))
const ClassStudents = lazy(() => import('./dashboard/admin/ClassStudents'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

// Department & HOD components
const Departments = lazy(() => import('./dashboard/admin/Departments'))
const DepartmentMembers = lazy(() => import('./dashboard/admin/DepartmentMembers'))
const HODDashboard = lazy(() => import('./dashboard/hod/HODDashboard'))
const EditRequestsReview = lazy(() => import('./dashboard/hod/EditRequestsReview'))

// Superadmin components
const SuperadminDashboard = lazy(() => import('./dashboard/superadmin/SuperadminDashboard'))
const SchoolsPage = lazy(() => import('./dashboard/superadmin/SchoolsPage'))
const SchoolForm = lazy(() => import('./dashboard/superadmin/SchoolForm'))
const AdminsPage = lazy(() => import('./dashboard/superadmin/AdminsPage'))
const SystemStats = lazy(() => import('./dashboard/superadmin/SystemStats'))

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
			{/* Public landing page */}
			<Route path="/" element={<IntroPage />} />

			{/* Login page - redirect to dashboard if already authenticated */}
			<Route path="/login" element={<ProtectedLogin />} />

			{/* Change password page (outside dashboard layout since other endpoints are blocked) */}
		<Route path="/change-password" element={<ChangePassword />} />

		{/* Profile page (all authenticated users, inside Layout with sidebar/navbar) */}
		<Route path="/profile" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
			<Route index element={<ProfilePage />} />
		</Route>

		{/* IMPORTANT: Specific routes MUST come before general routes */}

			{/* Admin-only dashboard routes */}
			<Route path="/dashboard/admin" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<AdminDashboard />} />
			</Route>

			{/* Instructor-only dashboard routes */}
			<Route path="/dashboard/instructors" element={<RoleProtectedLayout role="instructor" />}>
				<Route index element={<InstructorsDashboard />} />
				<Route path="subjects" element={<InstructorsSubjectsPage />} />
			</Route>

			{/* Admin user management */}
			<Route path="/dashboard/add/user" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<AddUser />} />
			</Route>

			{/* General dashboard routes - MUST come AFTER specific routes */}
			<Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<DashboardIndex />} />
				<Route path="students" element={<StudentsRoute />} />
			</Route>

			{/* Individual listing routes (used by sidebar links like /list/courses) */}
			{/* These listing pages require admin role (avoid showing 403 to non-admins) */}
			<Route path="/list/courses" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<Courses />} />
				<Route path=":id" element={<CourseDetail />} />
			</Route>

			{/* Admin user listings: students & instructors */}
			<Route path="/list/students" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<AdminStudents />} />
			</Route>

			{/* Notices (admin) */}
			<Route path="/list/notices" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<Notices />} />
			</Route>

			{/* Notifications (all authenticated users) */}
			<Route path="/list/notifications" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Notifications />} />
			</Route>

			{/* Class notices (instructors) */}
			<Route path="/list/class-notices" element={<RoleProtectedLayout role="instructor" />}>
				<Route index element={<ClassNotices />} />
			</Route>

			<Route path="/list/instructors" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<AdminInstructors />} />
			</Route>

			{/* Classes list (active classes) */}
			<Route path="/list/classes" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
				<Route index element={<Classes />} />
				<Route path=":id" element={<ClassDetail />} />
			</Route>

			{/* Attendance Sessions (instructors only) */}
			<Route path="/list/attendance-sessions" element={<RoleProtectedLayout role="instructor" />}>
				<Route index element={<AttendanceSessions />} />
				<Route path=":sessionId" element={<SessionAttendance />} />
			</Route>

			{/* Student Attendance (students only) */}
			<Route path="/list/my-attendance" element={<RoleProtectedLayout role="student" />}>
				<Route index element={<StudentAttendance />} />
			</Route>

			{/* Attendance Reports (admins & instructors) */}
			<Route path="/list/attendance-reports" element={<AdminOrInstructorLayout />}>
				<Route index element={<AttendanceReports />} />
			</Route>

			{/* Exams listing (instructors only) */}
			<Route path="/list/exams" element={<RoleProtectedLayout role="instructor" />}>
				<Route index element={<Exams />} />
			</Route>

			{/* Results listing - shows instructor grading UI for instructors, student results for students */}
			<Route path="/list/results" element={<InstructorOrStudentLayout />}>
				<Route index element={<ResultsRoute />} />
			</Route>

			{/* Subjects listing (by class) */}
			<Route path="/list/subjects" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<SubjectsPage />} />
			</Route>

			{/* Teaching assignments: create and view instructor-class-subject assignments (admin only) */}
			<Route path="/list/assignments" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<TeachingAssignments />} />
			</Route>

			{/* Performance Analytics (admins & instructors) */}
			<Route path="/analytics" element={<AdminOrInstructorLayout />}>
				<Route index element={<PerformanceAnalytics />} />
			</Route>

			{/* Exam Reports (admins & instructors) */}
			<Route path="/list/exam-reports" element={<AdminOrInstructorLayout />}>
				<Route index element={<ExamReports />} />
			</Route>

			{/* Certificates list (admin) */}
			<Route path="/list/certificates" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<Certificates />} />
			</Route>

			{/* Certificate templates (admin) */}
			<Route path="/list/certificate-templates" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<CertificateTemplates />} />
			</Route>

			{/* Class Certificates - completion status & issuance (admin) */}
			<Route path="/list/classes/:id/certificates" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<ClassCertificates />} />
			</Route>
			{/* Class students list (admin) */}
			<Route path="/list/classes/:id/students" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<ClassStudents />} />
			</Route>

			{/* Student Certificates */}
			<Route path="/list/my-certificates" element={<RoleProtectedLayout role="student" />}>
				<Route index element={<StudentCertificates />} />
			</Route>

			{/* Departments (admin) */}
			<Route path="/list/departments" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<Departments />} />
			</Route>

			{/* Department Members (admin) */}
			<Route path="/list/department-members" element={<RoleProtectedLayout role="admin" />}>
				<Route index element={<DepartmentMembers />} />
			</Route>

			{/* HOD Dashboard — HODs only */}
			<Route path="/dashboard/hod" element={<RoleProtectedLayout role="instructor" hodOnly />}>
				<Route index element={<HODDashboard />} />
			</Route>

			{/* Result Edit Requests — HODs only */}
			<Route path="/list/edit-requests" element={<RoleProtectedLayout role="instructor" hodOnly />}>
				<Route index element={<EditRequestsReview />} />
			</Route>

			{/* Superadmin routes */}
			<Route path="/superadmin" element={<RoleProtectedLayout role="superadmin" />}>
				<Route index element={<SuperadminDashboard />} />
				<Route path="schools" element={<SchoolsPage />} />
				<Route path="schools/new" element={<SchoolForm />} />
				<Route path="schools/:id" element={<SchoolForm />} />
				<Route path="schools/:id/edit" element={<SchoolForm />} />
				<Route path="admins" element={<AdminsPage />} />
				<Route path="themes" element={<SchoolsPage />} />
				<Route path="users" element={<AdminStudents />} />
			  <Route path="stats" element={<SystemStats />} />
			</Route>
		</Routes>
			</Suspense>
		</ErrorBoundary>
	)
}

export default App