// Small API client for the frontend. Uses fetch and the token stored by ../lib/auth.
import * as authStore from './auth'
import { transformToSentenceCase } from './textTransform'

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;

// Configuration for sentence case transformation
const SENTENCE_CASE_CONFIG = {
  enabled: import.meta.env.VITE_SENTENCE_CASE_ENABLED !== 'false', // Enable by default
  preserveAcronyms: true,
  excludeKeys: [
    'password',
    'token',
    'refresh',
    'access',
    'svc_number',
    'email',
    'username',
    'slug',
    'code',
    'url',
    'qr_token',
    'latitude',
    'longitude',
    'device_id',
    'biometric_id',
    'role', // CRITICAL: preserve role for authentication checks (admin, instructor, student, superadmin)
    'must_change_password', // Preserve boolean flag for auth flow
    'status', // Preserve status values for comparisons
    'type', // Preserve type values
    'id', // Preserve ID fields
    'logo', // Preserve file paths (e.g., school_logos/...)
    'logo_url', // Preserve logo URL paths
    'file', // Preserve file paths
    'file_url', // Preserve file URL paths
    'image', // Preserve image paths
    'image_url', // Preserve image URL paths
    'exam_type', // Preserve choice values sent back to API
  ]
}


// Sanitize string input to prevent injection attacks
function sanitizeInput(value) {
  if (typeof value !== 'string') return value
  // Remove any HTML/script tags and null bytes
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\0/g, '')
    .trim()
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const url = `${API_BASE}${path}`
  const token = authStore.getToken()
  const h = {
    'Content-Type': 'application/json',
    ...headers,
  }
  if (token) h['Authorization'] = `Bearer ${token}`

  // credentials: 'include' sends HTTP-only cookies on every request (cookie-based JWT auth)
  const opts = { method, headers: h, credentials: 'include' }
  if (body !== undefined) opts.body = JSON.stringify(body)

  // Helper to parse response body safely
  async function parseResponse(r) {
    if (r.status === 204) return null
    const text = await r.text()
    try {
      return text ? JSON.parse(text) : null
    } catch {
      return text
    }
  }

  let res = await fetch(url, opts)
  let data = await parseResponse(res)

  // If unauthorized, try to refresh the access token.
  // Works for both localStorage Bearer tokens and HTTP-only cookie sessions.
  if (res.status === 401) {
    const refreshToken = authStore.getRefreshToken && authStore.getRefreshToken()
    const hasCookieSession = authStore.isSessionActive && authStore.isSessionActive()
    if (refreshToken || hasCookieSession) {
      try {
        const refreshBody = refreshToken ? JSON.stringify({ refresh: refreshToken }) : undefined
        const refreshRes = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
          method: 'POST',
          credentials: 'include', // send cookie-based refresh token if present
          headers: { 'Content-Type': 'application/json' },
          ...(refreshBody ? { body: refreshBody } : {}),
        })
        const refreshData = await parseResponse(refreshRes)
        if (refreshRes.ok) {
          // Bearer token mode: update localStorage with new tokens
          if (refreshData?.access || refreshData?.token) {
            const newAccess = refreshData.access || refreshData.token
            const newRefresh = refreshData.refresh || refreshData.refresh_token || null
            if (newRefresh && authStore.setRefresh) authStore.setRefresh(newRefresh)
            if (authStore.setAccess) authStore.setAccess(newAccess)
            // Retry with new Bearer token
            const retryHeaders = { ...h, Authorization: `Bearer ${newAccess}` }
            const retryOpts = { method, headers: retryHeaders, credentials: 'include' }
            if (body !== undefined) retryOpts.body = JSON.stringify(body)
            res = await fetch(url, retryOpts)
            data = await parseResponse(res)
          } else {
            // Cookie mode: new cookies set by backend; retry sends them automatically
            const retryOpts = { method, headers: h, credentials: 'include' }
            if (body !== undefined) retryOpts.body = JSON.stringify(body)
            res = await fetch(url, retryOpts)
            data = await parseResponse(res)
          }
        }
        // else: refresh failed; fall through to error handling below
      } catch {
        // ignore refresh errors and fall through to error handling
      }
    }
  }

  if (!res.ok) {
    // Log detailed error for debugging in development only
    if (import.meta.env.DEV) {
      console.error('API Error:', { status: res.status, url, data })
    }

    // Show sanitized error messages to users (avoid exposing internal details)
    let userMessage
    if (res.status === 400) {
      // Check if it's a login endpoint with specific error details
      if (path.includes('/login')) {
        const detail = data && (data.detail || data.message || data.error || data.non_field_errors)
        if (detail) {
          // Handle array of errors (common in DRF)
          if (Array.isArray(detail)) {
            userMessage = detail.join(', ')
          } else {
            userMessage = String(detail)
          }
        } else {
          userMessage = 'Invalid credentials. Please check your service number and password.'
        }
      } else {
        userMessage = 'Invalid request. Please check your input and try again.'
      }
    } else if (res.status === 401) {
      // For login endpoint, provide specific message about credentials
      if (path.includes('/login')) {
        const detail = data && (data.detail || data.message || data.error)
        userMessage = detail || 'Invalid service number or password. Please try again.'
      } else {
        userMessage = 'Authentication failed. Please log in again.'
      }
    } else if (res.status === 403) {
      userMessage = 'You do not have permission to perform this action.'
    } else if (res.status === 404) {
      userMessage = 'The requested resource was not found.'
    } else if (res.status === 500) {
      userMessage = 'A server error occurred. Please try again later.'
    } else if (res.status >= 500) {
      userMessage = 'Service temporarily unavailable. Please try again later.'
    } else {
      // For validation errors with field-specific messages, allow those through
      // since they don't expose internal details
      const detail = data && (data.detail || data.message || data.error)
      userMessage = detail || 'An error occurred. Please try again.'
    }

    const err = new Error(userMessage)
    err.status = res.status
    err.data = data // Keep data for field-level validation errors
    throw err
  }

  // Apply sentence case transformation to successful responses
  if (SENTENCE_CASE_CONFIG.enabled && data) {
    return transformToSentenceCase(data, {
      preserveAcronyms: SENTENCE_CASE_CONFIG.preserveAcronyms,
      excludeKeys: SENTENCE_CASE_CONFIG.excludeKeys
    })
  }

  return data
}

// Helper for multipart/form-data requests (files)
async function requestMultipart(path, { method = 'POST', formData, headers = {} } = {}) {
  const url = `${API_BASE}${path}`
  const token = authStore.getToken()
  const h = { ...headers }
  if (token) h['Authorization'] = `Bearer ${token}`

  const opts = { method, headers: h, body: formData, credentials: 'include' }

  const res = await fetch(url, opts)
  if (!res.ok) {
    let data
    try { data = await res.json() } catch { data = await res.text() }
    const err = new Error('Request failed')
    err.status = res.status
    err.data = data
    throw err
  }

  const text = await res.text()
  try { return text ? JSON.parse(text) : null } catch { return text }
}

export async function login(svc_number, password) {
  // Sanitize inputs before sending to API
  const sanitizedSvcNumber = sanitizeInput(svc_number)
  const sanitizedPassword = sanitizeInput(password)
  return request('/api/auth/login/', {
    method: 'POST',
    body: {
      svc_number: sanitizedSvcNumber,
      password: sanitizedPassword
    }
  })
}

export async function verify2FA(svc_number, password, code) {
  const sanitizedSvcNumber = sanitizeInput(svc_number)
  const sanitizedPassword = sanitizeInput(password)
  const sanitizedCode = sanitizeInput(code)
  return request('/api/auth/verify-2fa/', {
    method: 'POST',
    body: { svc_number: sanitizedSvcNumber, password: sanitizedPassword, code: sanitizedCode }
  })
}

export async function resend2FA(svc_number, password) {
  const sanitizedSvcNumber = sanitizeInput(svc_number)
  const sanitizedPassword = sanitizeInput(password)
  return request('/api/auth/resend-2fa/', {
    method: 'POST',
    body: { svc_number: sanitizedSvcNumber, password: sanitizedPassword }
  })
}

export async function logout(refresh) {
  return request('/api/auth/logout/', { method: 'POST', body: { refresh } })
}

export async function changePassword(oldPassword, newPassword, newPassword2) {
  return request('/api/auth/change-password/', {
    method: 'POST',
    body: { old_password: oldPassword, new_password: newPassword, new_password2: newPassword2 }
  })
}

export async function getCurrentUser() {
  // Try common endpoints used by different backends
  try {
    return await request('/api/auth/me/')
  } catch {
    return await request('/api/users/me/')
  }
}

export async function getStudents() {
  const data = await request('/api/users/students')
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function getStudentsPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/users/students${qs}`)
}

// Fetch ALL students by iterating through all pages
export async function getAllStudents(params = '') {
  let allStudents = []
  let page = 1
  let hasMore = true
  const baseParams = params ? `${params}&` : ''

  while (hasMore) {
    try {
      const data = await getStudentsPaginated(`${baseParams}page=${page}&page_size=100`)
      const results = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      allStudents = [...allStudents, ...results]

      hasMore = data && data.next !== null && data.next !== undefined
      page++
    } catch {
      hasMore = false
    }
  }

  return allStudents
}

export async function getCourses() {
  return request('/api/courses/')
}

// Fetch ALL courses by iterating through all pages
export async function getAllCourses() {
  let allCourses = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    try {
      const data = await getCoursesPaginated(`page=${page}&page_size=100`)
      const results = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      allCourses = [...allCourses, ...results]

      // Check if there are more pages
      hasMore = data && data.next !== null && data.next !== undefined
      page++
    } catch {
      hasMore = false
    }
  }

  return allCourses
}

export async function getCoursesPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/courses/${qs}`)
}

export async function addCourse(payload) {
  return request('/api/courses/', { method: 'POST', body: payload })
}

export async function updateCourse(id, payload) {
  // Use PATCH for partial updates to avoid requiring all fields on PUT
  return request(`/api/courses/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteCourse(id) {
  return request(`/api/courses/${id}/`, { method: 'DELETE' })
}

export async function getClasses(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/classes/${qs}`)
  // Many list endpoints are paginated (DRF PageNumberPagination) and return
  // { count, results: [...] }. Unwrap results for callers that expect an array.
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Fetch ALL classes by iterating through all pages
export async function getAllClasses(params = '') {
  let allClasses = []
  let page = 1
  let hasMore = true
  const baseParams = params ? `${params}&` : ''

  while (hasMore) {
    try {
      const data = await getClassesPaginated(`${baseParams}page=${page}&page_size=100`)
      const results = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      allClasses = [...allClasses, ...results]

      // Check if there are more pages
      hasMore = data && data.next !== null && data.next !== undefined
      page++
    } catch {
      hasMore = false
    }
  }

  return allClasses
}

export async function getClassesPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/classes/${qs}`)
}

// Convenience helper: get classes for the currently authenticated user.
// Backend exposes `/api/classes/my-classes/` (hyphenated) for instructors.
export async function getMyClasses() {
  return request('/api/classes/my-classes/')
}

// Instructor dashboard endpoints
export async function getInstructorDashboard() {
  return request('/api/instructor-dashboard/')
}

export async function getInstructorSummary() {
  return request('/api/instructor-dashboard/summary/')
}

// Get students for the currently authenticated instructor
export async function getMyStudents() {
  // UserViewSet defines `my_students` -> routed as `my-students`
  const data = await request('/api/users/my-students/')
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function createAssignment(payload) {
  return request('/api/assignments/', { method: 'POST', body: payload })
}

export async function deleteAssignment(id) {
  return request(`/api/assignments/${id}/`, { method: 'DELETE' })
}

export async function addClass(payload) {
  return request('/api/classes/', { method: 'POST', body: payload })
}

export async function updateClass(id, payload) {
  // Use PATCH for partial updates so callers can send only changed fields
  return request(`/api/classes/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteClass(id) {
  return request(`/api/classes/${id}/`, { method: 'DELETE' })
}

export async function getClassSubjects(classId) {
  return request(`/api/classes/${classId}/subjects/`)
}

export async function getClassEnrolledStudents(classId) {
  return request(`/api/classes/${classId}/my_students/`)
}

// Attendance endpoints
export async function markAttendance(payload) {
  return request('/api/attendance/', { method: 'POST', body: payload })
}

export async function bulkMarkAttendance(payload) {
  return request('/api/attendance/bulk_mark/', { method: 'POST', body: payload })
}

export async function getClassAttendance(classId, date) {
  const qs = `?class_id=${classId}&date=${encodeURIComponent(date)}`
  return request(`/api/attendance/class_attendance/${qs}`)
}

// =====================
// Attendance Sessions API
// =====================

// Get all attendance sessions (paginated)
export async function getAttendanceSessions(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/attendance-sessions/${qs}`)
}

// Get a single attendance session
export async function getAttendanceSession(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/`)
}

// Create a new attendance session
export async function createAttendanceSession(payload) {
  return request('/api/attendance-sessions/', { method: 'POST', body: payload })
}

// Update an attendance session
export async function updateAttendanceSession(sessionId, payload) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/`, { method: 'PATCH', body: payload })
}

// Delete an attendance session
export async function deleteAttendanceSession(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/`, { method: 'DELETE' })
}

// Start an attendance session (generates QR code)
export async function startAttendanceSession(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/start/`, { method: 'POST' })
}

// End an attendance session
export async function endAttendanceSession(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/end/`, { method: 'POST' })
}

// Get QR code data for a session
export async function getSessionQRCode(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/qr_code/`)
}

// Get session statistics
export async function getSessionStatistics(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/statistics/`)
}

// Get unmarked students for a session
export async function getUnmarkedStudents(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/unmarked_students/`)
}

// Mark all unmarked students as absent
export async function markAbsentStudents(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')
  return request(`/api/attendance-sessions/${sessionId}/mark_absent/`, { method: 'POST' })
}

// Export session attendance to CSV
export async function exportSessionAttendance(sessionId) {
  if (!sessionId) throw new Error('sessionId is required')

  // Handle CSV export specially - don't parse as JSON
  const url = `${API_BASE}/api/attendance-sessions/${sessionId}/export_csv/`
  const token = authStore.getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Failed to export CSV (${response.status})`)
  }

  // Return the CSV as plain text to preserve newlines
  return await response.text()
}

// Get instructor's sessions
export async function getMyAttendanceSessions(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/attendance-sessions/my_sessions/${qs}`)
}

// Get active sessions
export async function getActiveAttendanceSessions() {
  return request('/api/attendance-sessions/active_sessions/')
}

// =====================
// Session Attendance API (individual attendance records)
// =====================

// Get session attendance records
export async function getSessionAttendances(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/session-attendances/${qs}`)
}

// Mark attendance via QR code (for students)
export async function markQRAttendance(payload) {
  // payload: { session_id, qr_token, latitude?, longitude? }
  return request('/api/session-attendances/mark_qr/', { method: 'POST', body: payload })
}

// Bulk mark attendance (for instructors)
export async function bulkMarkSessionAttendance(payload) {
  // payload: { session_id, attendance_records: [{ student_id, status, remarks? }] }
  return request('/api/session-attendances/bulk_mark/', { method: 'POST', body: payload })
}

// Get student's own attendance history
export async function getMyAttendance(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/session-attendances/my_attendance/${qs}`)
}

// =====================
// Biometric Records API
// =====================

// Get biometric records
export async function getBiometricRecords(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/biometric-records/${qs}`)
}

// Sync biometric data from device
export async function syncBiometricRecords(payload) {
  // payload: { device_id, device_type, records: [{ biometric_id, scan_time, verification_type?, verification_score? }] }
  return request('/api/biometric-records/sync/', { method: 'POST', body: payload })
}

// Process pending biometric records
export async function processPendingBiometrics() {
  return request('/api/biometric-records/process_pending/', { method: 'POST' })
}

// Get unprocessed biometric records
export async function getUnprocessedBiometrics() {
  return request('/api/biometric-records/unprocessed/')
}

// =====================
// Attendance Reports API
// =====================

// Get class attendance summary
export async function getClassAttendanceSummary(classId, startDate, endDate) {
  if (!classId) throw new Error('classId is required')
  let qs = `?class_id=${encodeURIComponent(classId)}`
  if (startDate) qs += `&start_date=${encodeURIComponent(startDate)}`
  if (endDate) qs += `&end_date=${encodeURIComponent(endDate)}`
  return request(`/api/attendance-reports/class_summary/${qs}`)
}

// Get individual student attendance detail
export async function getStudentAttendanceDetail(studentId, startDate, endDate) {
  if (!studentId) throw new Error('studentId is required')
  let qs = `?student_id=${encodeURIComponent(studentId)}`
  if (startDate) qs += `&start_date=${encodeURIComponent(startDate)}`
  if (endDate) qs += `&end_date=${encodeURIComponent(endDate)}`
  return request(`/api/attendance-reports/student_detail/${qs}`)
}

// Compare multiple sessions
export async function compareSessionAttendance(sessionIds) {
  if (!sessionIds || !sessionIds.length) throw new Error('sessionIds array is required')
  const qs = `?session_ids=${sessionIds.join(',')}`
  return request(`/api/attendance-reports/session_comparison/${qs}`)
}

// Get attendance trend analysis
export async function getAttendanceTrend(classId, days = 30) {
  if (!classId) throw new Error('classId is required')
  const qs = `?class_id=${encodeURIComponent(classId)}&days=${encodeURIComponent(days)}`
  return request(`/api/attendance-reports/trend_analysis/${qs}`)
}

// Get low attendance alerts
export async function getLowAttendanceAlerts(classId, threshold = 75) {
  let qs = `?threshold=${encodeURIComponent(threshold)}`
  if (classId) qs += `&class_id=${encodeURIComponent(classId)}`
  return request(`/api/attendance-reports/low_attendance_alert/${qs}`)
}

export async function getSubjects(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/subjects/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Fetch ALL subjects by iterating through all pages
export async function getAllSubjects(params = '') {
  let allSubjects = []
  let page = 1
  let hasMore = true
  const baseParams = params ? `${params}&` : ''

  while (hasMore) {
    try {
      const data = await getSubjectsPaginated(`${baseParams}page=${page}&page_size=100`)
      const results = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      allSubjects = [...allSubjects, ...results]

      // Check if there are more pages
      hasMore = data && data.next !== null && data.next !== undefined
      page++
    } catch {
      hasMore = false
    }
  }

  return allSubjects
}

// Instructor-specific subjects (subjects taught by the current instructor)
export async function getMySubjects() {
  try {
    const data = await request('/api/subjects/my_subjects/')
    if (data && Array.isArray(data.results)) return data.results
    return data
  } catch {
    // Fall back to general subjects list
    return getSubjects()
  }
}

// Exams endpoints
export async function getExams(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/exams/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function getMyExams() {
  // backend provides a `my_exams` action
  const data = await request('/api/exams/my_exams/')
  return data
}

// Student dashboard endpoints (backend exposes these as a ViewSet)
export async function getStudentDashboard() {
  return request('/api/student-dashboard/')
}

export async function getStudentUpcomingSchedule(days = 30) {
  const qs = `?days=${encodeURIComponent(days)}`
  const data = await request(`/api/student-dashboard/upcoming_schedule/${qs}`)
  return data
}

export async function getStudentPerformanceSummary() {
  return request('/api/student-dashboard/performance_summary/')
}

// Get student's class enrollments (all enrollments including past classes)
export async function getStudentEnrollments() {
  return request('/api/student-dashboard/my_classes/')
}

export async function createExam(payload) {
  return request('/api/exams/', { method: 'POST', body: payload })
}

// Exam results helpers
export async function getExamResults(examId) {
  if (!examId) throw new Error('examId is required')
  return request(`/api/exams/${examId}/results/`)
}

// student get myexam_results
export async function getMyResults(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return request(`/api/student-dashboard/my_results/${qs ? `?${qs}` : ''}`)
}

export async function generateExamResults(examId) {
  if (!examId) throw new Error('examId is required')
  return request(`/api/exams/${examId}/generate_results/`, { method: 'POST' })
}

export async function bulkGradeResults(payload) {
  // payload shape: { results: [{ id, student_id, marks_obtained, remarks? }, ...] }
  return request('/api/exam-results/bulk_grade/', { method: 'POST', body: payload })
}

export async function gradeResult(resultId, payload) {
  if (!resultId) throw new Error('resultId is required')
  return request(`/api/exam-results/${resultId}/`, { method: 'PUT', body: payload })
}

export async function updateExam(id, payload) {
  // Use PATCH so callers can send partial updates
  return request(`/api/exams/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteExam(id) {
  return request(`/api/exams/${id}/`, { method: 'DELETE' })
}

export async function createClassNotice(payload) {
  return request('/api/class-notices/', { method: 'POST', body: payload })
}

export async function updateClassNotice(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/class-notices/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteClassNotice(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/class-notices/${id}/`, { method: 'DELETE' })
}

export async function getClassNotices(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/class-notices/${qs}`)
}

// Get class notices scoped to the current user. The backend's get_queryset
// already filters by user role, so we just use the base endpoint.
export async function getMyClassNotices(params = '') {
  return getClassNotices(params)
}

// Global notices (admin/site-wide)
export async function getNotices(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/notices/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function getNoticesPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/notices/${qs}`)
}

export async function getActiveNotices() {
  const data = await request('/api/notices/active/')
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function getUrgentNotices() {
  const data = await request('/api/notices/urgent/')
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function createNotice(payload) {
  return request('/api/notices/', { method: 'POST', body: payload })
}

export async function updateNotice(id, payload) {
  return request(`/api/notices/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteNotice(id) {
  return request(`/api/notices/${id}/`, { method: 'DELETE' })
}

// Get unread notices for the current user
export async function getUnreadNotices() {
  const data = await request('/api/notices/unread/')
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Mark a notice as read
export async function markNoticeAsRead(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/notices/${id}/mark_as_read/`, { method: 'POST', body: {} })
}

// Mark a notice as unread
export async function markNoticeAsUnread(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/notices/${id}/mark_as_unread/`, { method: 'POST', body: {} })
}

// Mark a class notice as read
export async function markClassNoticeAsRead(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/class-notices/${id}/mark_as_read/`, { method: 'POST', body: {} })
}

// Mark a class notice as unread
export async function markClassNoticeAsUnread(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/class-notices/${id}/mark_as_unread/`, { method: 'POST', body: {} })
}

// Mark an exam result notification as read/unread
export async function markExamResultAsRead(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/exam-results/${id}/mark_notification_as_read/`, { method: 'POST', body: {} })
}

export async function markExamResultAsUnread(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/exam-results/${id}/mark_notification_as_unread/`, { method: 'POST', body: {} })
}

// =====================
// Personal Notifications API (for grade results)
// =====================

// Get all personal notifications for the authenticated user
export async function getPersonalNotifications(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/personal-notifications/${qs}`)
}

// Get unread personal notifications with count
export async function getUnreadPersonalNotifications() {
  return request('/api/personal-notifications/unread/')
}

// Mark a specific personal notification as read
export async function markPersonalNotificationAsRead(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/personal-notifications/${id}/mark_as_read/`, { method: 'POST', body: {} })
}

// Mark all personal notifications as read
export async function markAllPersonalNotificationsAsRead() {
  return request('/api/personal-notifications/mark_all_as_read/', { method: 'POST', body: {} })
}

// Get exam result notifications only
export async function getExamResultNotifications() {
  return request('/api/personal-notifications/exam_results/')
}

// Get personal notification statistics
export async function getPersonalNotificationStats() {
  return request('/api/personal-notifications/stats/')
}

// =====================
// Performance Analytics APIs
// =====================

// Subject Performance
export async function getSubjectPerformanceSummary(subjectId) {
  if (!subjectId) throw new Error('subjectId is required')
  return request(`/api/subject-performance/summary/?subject_id=${encodeURIComponent(subjectId)}`)
}

export async function compareSubjects(classId) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/subject-performance/compare_subjects/?class_id=${encodeURIComponent(classId)}`)
}

export async function getSubjectTrendAnalysis(subjectId, days = 90) {
  if (!subjectId) throw new Error('subjectId is required')
  return request(`/api/subject-performance/trend_analysis/?subject_id=${encodeURIComponent(subjectId)}&days=${encodeURIComponent(days)}`)
}

export async function getAttendanceCorrelation(classId) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/class-performance/attendance_correlation/?class_id=${encodeURIComponent(classId)}`)
}

// Class Performance
export async function getClassPerformanceSummary(classId) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/class-performance/summary/?class_id=${encodeURIComponent(classId)}`)
}

export async function getClassTopPerformers(classId, limit = 10) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/class-performance/top_performers/?class_id=${encodeURIComponent(classId)}&limit=${encodeURIComponent(limit)}`)
}

export async function compareClasses(courseId = null) {
  const qs = courseId ? `?course_id=${encodeURIComponent(courseId)}` : ''
  return request(`/api/class-performance/compare_classes/${qs}`)
}

export async function exportClassReport(classId, format = 'summary') {
  if (!classId) throw new Error('classId is required')
  return request(`/api/class-performance/export_report/?class_id=${encodeURIComponent(classId)}&format=${encodeURIComponent(format)}`)
}

// Upload exam attachment (multipart/form-data). Returns attachment resource.
export async function uploadExamAttachment(examId, file) {
  const token = authStore.getToken()
  const url = `${API_BASE}/api/exam-attachments/`
  const form = new FormData()
  form.append('exam', String(examId))
  form.append('file', file)

  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { method: 'POST', headers, body: form })

  if (!res.ok) {
    let text = await res.text()
    try {
      text = JSON.parse(text)
    } catch (e) {
      if (import.meta.env.DEV) console.debug('upload parse error', e)
    }
    const err = new Error(res.statusText || 'Upload failed')
    err.status = res.status
    err.data = text
    throw err
  }

  const data = await res.json()
  return data
}

export async function getExamAttachments(examId) {
  const qs = examId ? `?exam=${encodeURIComponent(examId)}` : ''
  const data = await request(`/api/exam-attachments/${qs}`)
  // unwrap paginated results
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Return raw paginated response for callers that need count/next/previous
export async function getSubjectsPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/subjects/${qs}`)
}

export async function addSubject(payload) {
  return request('/api/subjects/', { method: 'POST', body: payload })
}

export async function partialUpdateSubject(id, payload) {
  return request(`/api/subjects/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteSubject(id) {
  return request(`/api/subjects/${id}/`, { method: 'DELETE' })
}

export async function assignInstructorToSubject(subjectId, instructorId) {
  return request(`/api/subjects/${subjectId}/assign_instructor/`, { method: 'POST', body: { instructor_id: instructorId } })
}

export async function removeInstructorFromSubject(subjectId) {
  return request(`/api/subjects/${subjectId}/remove_instructor/`, { method: 'POST' })
}

export async function getInstructors() {
  const data = await request('/api/users/instructors')
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Fetch ALL instructors by iterating through all pages
export async function getAllInstructors() {
  let allInstructors = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    try {
      const data = await getInstructorsPaginated(`page=${page}&page_size=100`)
      const results = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      allInstructors = [...allInstructors, ...results]

      // Check if there are more pages
      hasMore = data && data.next !== null && data.next !== undefined
      page++
    } catch {
      hasMore = false
    }
  }

  return allInstructors
}

export async function getInstructorsPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/users/instructors${qs}`)
}

export async function getUserEnrollments(userId) {
  return request(`/api/users/${userId}/enrollments/`)
}

export async function addEnrollment(payload) {
  return request('/api/enrollments/', { method: 'POST', body: payload })
}

export async function reactivateEnrollment(enrollmentId) {
  return request(`/api/enrollments/${enrollmentId}/reactivate/`, { method: 'POST' })
}

export async function withdrawEnrollment(enrollmentId) {
  return request(`/api/enrollments/${enrollmentId}/withdraw/`, { method: 'POST' })
}

export async function getUsers() {
  return request('/api/users/')
}

export async function getUserStats() {
  return request('/api/users/stats/')
}

export async function addUser(payload) {
  return request('/api/users/', { method: 'POST', body: payload })
}

export async function getUser(id) {
  return request(`/api/users/${id}/`)
}

export async function updateUser(id, payload) {
  return request(`/api/users/${id}/`, { method: 'PUT', body: payload })
}

export async function partialUpdateUser(id, payload) {
  return request(`/api/users/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteUser(id) {
  return request(`/api/users/${id}/`, { method: 'DELETE' })
}

export async function activateUser(id) {
  return request(`/api/users/${id}/activate/`, { method: 'POST' })
}

export async function deactivateUser(id) {
  return request(`/api/users/${id}/deactivate/`, { method: 'POST' })
}

export async function resetUserPassword(id, newPassword) {
  return request(`/api/users/${id}/reset_password/`, { method: 'POST', body: { new_password: newPassword } })
}

// =====================
// Schools API (Superadmin)
// =====================

// Get all schools (paginated)
export async function getSchools(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/schools/${qs}`)
}

// Get a single school by ID
export async function getSchool(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/schools/${id}/`)
}

// Create a new school
export async function createSchool(payload) {
  return request('/api/schools/', { method: 'POST', body: payload })
}

// Update a school
export async function updateSchool(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/schools/${id}/`, { method: 'PATCH', body: payload })
}

// Delete a school
export async function deleteSchool(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/schools/${id}/`, { method: 'DELETE' })
}

// Get school theme (public endpoint for login page theming)
export async function getSchoolTheme(schoolCode) {
  if (!schoolCode) throw new Error('schoolCode is required')
  return request(`/api/schools/theme/?code=${encodeURIComponent(schoolCode)}`)
}

// Get current user's school theme
export async function getMySchoolTheme() {
  return request('/api/schools/my-theme/')
}

// Upload school logo (multipart/form-data)
export async function uploadSchoolLogo(schoolId, file) {
  const token = authStore.getToken()
  const url = `${API_BASE}/api/schools/${schoolId}/upload_logo/`
  const form = new FormData()
  form.append('logo', file)

  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { method: 'POST', headers, body: form })

  if (!res.ok) {
    let text = await res.text()
    try {
      text = JSON.parse(text)
    } catch (e) {
      if (import.meta.env.DEV) console.debug('upload parse error', e)
    }
    const err = new Error(res.statusText || 'Upload failed')
    err.status = res.status
    err.data = text
    throw err
  }

  return res.json()
}

// Get school statistics
export async function getSchoolStats(schoolId) {
  if (!schoolId) throw new Error('schoolId is required')
  return request(`/api/schools/${schoolId}/stats/`)
}

// Activate/Deactivate school
export async function activateSchool(id) {
  return request(`/api/schools/${id}/activate/`, { method: 'POST' })
}

export async function deactivateSchool(id) {
  return request(`/api/schools/${id}/deactivate/`, { method: 'POST' })
}

// =====================
// School Admins API (Superadmin)
// =====================

// Get all school admins (paginated)
export async function getSchoolAdmins(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/school-admins/${qs}`)
}

// Get a single school admin by ID
export async function getSchoolAdmin(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/school-admins/${id}/`)
}

// Create a new school admin (link user to school)
export async function createSchoolAdmin(payload) {
  // payload: { school, user, is_primary?, permissions? }
  return request('/api/school-admins/', { method: 'POST', body: payload })
}

// Update a school admin
export async function updateSchoolAdmin(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/school-admins/${id}/`, { method: 'PATCH', body: payload })
}

// Delete a school admin (unlink user from school)
export async function deleteSchoolAdmin(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/school-admins/${id}/`, { method: 'DELETE' })
}

// Get admins for a specific school
export async function getSchoolAdminsBySchool(schoolId) {
  if (!schoolId) throw new Error('schoolId is required')
  return request(`/api/schools/${schoolId}/admins/`)
}

// Add admin to a specific school
export async function addAdminToSchool(schoolId, userId) {
  if (!schoolId) throw new Error('schoolId is required')
  if (!userId) throw new Error('userId is required')
  return request(`/api/schools/${schoolId}/add_admin/`, { method: 'POST', body: { user_id: userId } })
}

// Create school with admin (combined endpoint)
export async function createSchoolWithAdmin(payload) {
  return request('/api/schools/create_with_admin/', { method: 'POST', body: payload })
}

// Get all admin users (role=admin) across all schools - for superadmin
export async function getAllAdminUsers(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/users/admins${qs}`)
}

// =====================
// Certificates API
// =====================

// List certificates (paginated, filterable by class_obj, student; searchable by certificate_number, svc_number)
export async function getCertificates(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/certificates/${qs}`)
}

// Get a single certificate by ID
export async function getCertificate(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificates/${id}/`)
}

// Get completion status for all students in a class
export async function getClassCompletionStatus(classId) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/classes/${classId}/completion_status/`)
}

// Bulk issue certificates for all eligible students in a closed class
export async function issueCertificates(classId, templateId = null) {
  if (!classId) throw new Error('classId is required')
  const body = {}
  if (templateId) body.template_id = templateId
  return request(`/api/classes/${classId}/issue_certificates/`, { method: 'POST', body })
}

// Issue a certificate for a single enrollment in a class
export async function issueCertificateSingle(classId, enrollmentId, templateId = null) {
  if (!classId) throw new Error('classId is required')
  if (!enrollmentId) throw new Error('enrollmentId is required')
  const body = { enrollment_id: enrollmentId }
  if (templateId) body.template_id = templateId
  return request(`/api/classes/${classId}/issue_certificate_single/`, { method: 'POST', body })
}

// Close a class (sets is_closed=True, required before issuing certificates)
export async function closeClass(classId) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/classes/${classId}/close/`, { method: 'POST' })
}

// Create a certificate (admin)
export async function addCertificate(payload) {
  return request('/api/certificates/', { method: 'POST', body: payload })
}

// Update a certificate
export async function updateCertificate(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificates/${id}/`, { method: 'PATCH', body: payload })
}

// Delete a certificate
export async function deleteCertificate(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificates/${id}/`, { method: 'DELETE' })
}

// Revoke a certificate (records reason)
export async function revokeCertificate(id, reason = '') {
  if (!id) throw new Error('id is required')
  return request(`/api/certificates/${id}/revoke/`, { method: 'POST', body: { reason } })
}

// Regenerate a certificate's PDF on server
export async function regenerateCertificate(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificates/${id}/regenerate/`, { method: 'POST' })
}

// Download certificate PDF as a Blob
export async function downloadCertificatePdf(id) {
  if (!id) throw new Error('id is required')
  const token = authStore.getToken()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/api/certificates/${id}/download/`, { method: 'GET', headers })
  if (!res.ok) {
    const err = new Error('Failed to download certificate')
    err.status = res.status
    throw err
  }
  return res.blob()
}

// Get certificates for current user (student)
export async function getMyCertificates() {
  return request('/api/certificates/my_certificates/')
}

// Certificate templates
export async function getCertificateTemplates(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/certificate_templates/${qs}`)
}

export async function getCertificateTemplate(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificate_templates/${id}/`)
}

export async function createCertificateTemplate(payload) {
  // If payload contains File objects, send as multipart/form-data
  const hasFile = payload && (
    payload.custom_logo instanceof File ||
    payload.signature_image instanceof File ||
    payload.secondary_signature_image instanceof File
  )
  if (hasFile) {
    const fd = new FormData()
    Object.keys(payload || {}).forEach(k => {
      const v = payload[k]
      if (v === undefined || v === null) return
      // Files should be appended directly; arrays/objects stringify
      if (v instanceof File) fd.append(k, v)
      else if (typeof v === 'object') fd.append(k, JSON.stringify(v))
      else fd.append(k, String(v))
    })
    return requestMultipart('/api/certificate_templates/', { method: 'POST', formData: fd })
  }

  return request('/api/certificate_templates/', { method: 'POST', body: payload })
}

export async function updateCertificateTemplate(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificate_templates/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteCertificateTemplate(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificate_templates/${id}/`, { method: 'DELETE' })
}

export async function setCertificateTemplateDefault(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificate_templates/${id}/set_default/`, { method: 'POST' })
}

export async function previewCertificateTemplate(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/certificate_templates/${id}/preview/`)
}

// Certificate stats (dashboard)
export async function getCertificateStats() {
  return request('/api/certificates/stats/')
}

// Bulk create certificates (server-side helper)
export async function bulkCreateCertificates(payload) {
  return request('/api/certificates/bulk_create/', { method: 'POST', body: payload })
}

// Certificate download logs
export async function getCertificateDownloadLogs(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/certificates/download_logs/${qs}`)
}

// Verify a certificate by verification code
export async function verifyCertificate(verificationCode) {
  if (!verificationCode) throw new Error('verificationCode is required')
  return request(`/api/certificates/verify/${encodeURIComponent(verificationCode)}/`)
}

// =====================
// Profile API
// =====================

// Get current user's profile
export async function getProfile() {
  return request('/api/profile/me/')
}

// Update current user's profile (username, bio)
export async function updateProfile(data) {
  return request('/api/profile/me/', { method: 'PATCH', body: data })
}

// =====================
// Departments API
// =====================

export async function getDepartments(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/departments/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function getDepartmentsPaginated(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/departments/${qs}`)
}

export async function addDepartment(payload) {
  return request('/api/departments/', { method: 'POST', body: payload })
}

export async function updateDepartment(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteDepartment(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/`, { method: 'DELETE' })
}

export async function getDepartmentCourses(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/courses/`)
}

export async function getDepartmentClasses(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/classes/`)
}

export async function getDepartmentStudents(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/students/`)
}

export async function getDepartmentResults(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/results/`)
}

export async function getDepartmentPendingEditRequests(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/departments/${id}/pending-edit-requests/`)
}

// =====================
// Department Memberships API
// =====================

export async function getDepartmentMemberships(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/department-memberships/${qs}`)
}

export async function addDepartmentMembership(payload) {
  return request('/api/department-memberships/', { method: 'POST', body: payload })
}

export async function updateDepartmentMembership(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/department-memberships/${id}/`, { method: 'PATCH', body: payload })
}

export async function deleteDepartmentMembership(id) {
  if (!id) throw new Error('id is required')
  return request(`/api/department-memberships/${id}/`, { method: 'DELETE' })
}

// =====================
// Result Edit Requests API
// =====================

export async function getResultEditRequests(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/result-edit-requests/${qs}`)
}

export async function createResultEditRequest(payload) {
  return request('/api/result-edit-requests/', { method: 'POST', body: payload })
}

export async function reviewResultEditRequest(id, payload) {
  if (!id) throw new Error('id is required')
  return request(`/api/result-edit-requests/${id}/review/`, { method: 'POST', body: payload })
}

// =====================
// Student Index / Roster
// =====================

export async function getClassRoster(classId) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/admin/roster/${classId}/`)
}

export async function assignClassIndexes(classId, startFrom = null) {
  if (!classId) throw new Error('classId is required')
  return request(`/api/admin/roster/${classId}/assign/`, {
    method: 'POST',
    body: startFrom ? { start_from: startFrom } : undefined,
  })
}

export async function updateStudentIndex(classId, indexId, indexNumber) {
  if (!classId) throw new Error('classId is required')
  if (!indexId) throw new Error('indexId is required')
  return request(`/api/admin/roster/${classId}/update-index/${indexId}/`, {
    method: 'PATCH',
    body: { index_number: indexNumber },
  })
}

// =====================
// Marks Entry
// =====================

export async function getMarksEntryResults(examId) {
  if (!examId) throw new Error('examId is required')
  return request(`/api/marks-entry/exam/${examId}/`)
}

export async function updateMarksEntry(resultId, payload) {
  if (!resultId) throw new Error('resultId is required')
  return request(`/api/marks-entry/${resultId}/`, { method: 'PATCH', body: payload })
}

export async function bulkSubmitMarks(payload) {
  return request('/api/marks-entry/bulk-submit/', { method: 'POST', body: payload })
}

export default {
  login,
  changePassword,
  getCurrentUser,
  getStudents,
  getClasses,
  getAllClasses,
  getMyClasses,
  getInstructors,
  getAllInstructors,
  assignInstructorToSubject,
  removeInstructorFromSubject,
  markAttendance,
  bulkMarkAttendance,
  getClassAttendance,
  getUsers,
  addUser,
  getUser,
  updateUser,
  partialUpdateUser,
  deleteUser,
  activateUser,
  deactivateUser,
  resetUserPassword,
  getSubjects,
  getAllSubjects,
  getSubjectsPaginated,
  getClassSubjects,
  getClassEnrolledStudents,
  addSubject,
  getInstructorDashboard,
  getInstructorSummary,
  getMyStudents,
  getUserEnrollments,
  addEnrollment,
  getCourses,
  getAllCourses,
  addCourse,
  updateCourse,
  deleteCourse,
  addClass,
  updateClass,
  deleteClass,
  reactivateEnrollment,
  withdrawEnrollment,
  partialUpdateSubject,
  deleteSubject,
  getMySubjects,
  getExams,
  getMyExams,
  createExam,
  getExamResults,
  getMyResults,
  generateExamResults,
  bulkGradeResults,
  gradeResult,
  updateExam,
  deleteExam,
  uploadExamAttachment,
  getExamAttachments,
  getClassNotices,
  getMyClassNotices,
  createClassNotice,
  updateClassNotice,
  deleteClassNotice,
  // Global / site notices
  getNotices,
  getActiveNotices,
  getUrgentNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  getUnreadNotices,
  markNoticeAsRead,
  markNoticeAsUnread,
  markClassNoticeAsRead,
  markClassNoticeAsUnread,
  // Paginated versions
  getStudentsPaginated,
  getInstructorsPaginated,
  getClassesPaginated,
  getCoursesPaginated,
  getNoticesPaginated,
  // Performance Analytics
  getSubjectPerformanceSummary,
  compareSubjects,
  getSubjectTrendAnalysis,
  getClassPerformanceSummary,
  getClassTopPerformers,
  compareClasses,
  exportClassReport,
  // Attendance Sessions
  getAttendanceSessions,
  getAttendanceSession,
  createAttendanceSession,
  updateAttendanceSession,
  deleteAttendanceSession,
  startAttendanceSession,
  endAttendanceSession,
  getSessionQRCode,
  getSessionStatistics,
  getUnmarkedStudents,
  markAbsentStudents,
  exportSessionAttendance,
  getMyAttendanceSessions,
  getActiveAttendanceSessions,
  // Session Attendance
  getSessionAttendances,
  markQRAttendance,
  bulkMarkSessionAttendance,
  getMyAttendance,
  // Biometric Records
  getBiometricRecords,
  syncBiometricRecords,
  processPendingBiometrics,
  getUnprocessedBiometrics,
  // Attendance Reports
  getClassAttendanceSummary,
  getStudentAttendanceDetail,
  compareSessionAttendance,
  getAttendanceTrend,
  getLowAttendanceAlerts,
  // Personal Notifications
  getPersonalNotifications,
  getUnreadPersonalNotifications,
  markPersonalNotificationAsRead,
  markAllPersonalNotificationsAsRead,
  getExamResultNotifications,
  getPersonalNotificationStats,
  // Schools (Superadmin)
  getSchools,
  getSchool,
  createSchool,
  updateSchool,
  deleteSchool,
  getSchoolTheme,
  getMySchoolTheme,
  uploadSchoolLogo,
  getSchoolStats,
  activateSchool,
  deactivateSchool,
  // School Admins (Superadmin)
  getSchoolAdmins,
  getSchoolAdmin,
  createSchoolAdmin,
  updateSchoolAdmin,
  deleteSchoolAdmin,
  getSchoolAdminsBySchool,
  addAdminToSchool,
  createSchoolWithAdmin,
  getAllAdminUsers,
  // Profile
  getProfile,
  updateProfile,
  // Departments
  getDepartments,
  getDepartmentsPaginated,
  addDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentCourses,
  getDepartmentClasses,
  getDepartmentStudents,
  getDepartmentResults,
  getDepartmentPendingEditRequests,
  // Department Memberships
  getDepartmentMemberships,
  addDepartmentMembership,
  updateDepartmentMembership,
  deleteDepartmentMembership,
  // Result Edit Requests
  getResultEditRequests,
  createResultEditRequest,
  reviewResultEditRequest,
  // Certificates
  getCertificates,
  getCertificate,
  getClassCompletionStatus,
  issueCertificates,
  issueCertificateSingle,
  closeClass,
  addCertificate,
  updateCertificate,
  deleteCertificate,
  revokeCertificate,
  regenerateCertificate,
  downloadCertificatePdf,
  getMyCertificates,
  getCertificateStats,
  getCertificateTemplates,
  getCertificateTemplate,
  createCertificateTemplate,
  updateCertificateTemplate,
  deleteCertificateTemplate,
  setCertificateTemplateDefault,
  previewCertificateTemplate,
  bulkCreateCertificates,
  getCertificateDownloadLogs,
  verifyCertificate,
  // Student Index / Roster
  getClassRoster,
  assignClassIndexes,
  updateStudentIndex,
  // Marks Entry
  getMarksEntryResults,
  updateMarksEntry,
  bulkSubmitMarks,
}