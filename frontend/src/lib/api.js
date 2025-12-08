// Small API client for the frontend. Uses fetch and the token stored by ../lib/auth.
import * as authStore from './auth'

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
// const API_BASE = import.meta.env.VITE_API_URL;
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const url = `${API_BASE}${path}`
  const token = authStore.getToken()
  const h = {
    'Content-Type': 'application/json',
    ...headers,
  }
  if (token) h['Authorization'] = `Bearer ${token}`

  const opts = { method, headers: h }
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

  // If unauthorized, try to refresh the access token (if we have a refresh token)
  if (res.status === 401) {
    const refreshToken = authStore.getRefreshToken && authStore.getRefreshToken()
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        })
        const refreshData = await parseResponse(refreshRes)
        if (refreshRes.ok && refreshData && (refreshData.access || refreshData.token)) {
          const newAccess = refreshData.access || refreshData.token
          const newRefresh = refreshData.refresh || refreshData.refresh_token || null
          // update refresh token when server rotates it
          if (newRefresh && authStore.setRefresh) authStore.setRefresh(newRefresh)
          // update in-memory token
          if (authStore.setAccess) authStore.setAccess(newAccess)
          // retry original request once with new token
          const retryHeaders = { ...h, Authorization: `Bearer ${newAccess}` }
          const retryOpts = { method, headers: retryHeaders }
          if (body !== undefined) retryOpts.body = JSON.stringify(body)
          res = await fetch(url, retryOpts)
          data = await parseResponse(res)
        } else {
          // refresh failed; fall through to error handling below
        }
      } catch {
        // ignore refresh errors and fall through to error handling
      }
    }
  }

  if (!res.ok) {
    const message = (data && (data.detail || data.message || data.error || data.non_field_errors)) || res.statusText || 'Request failed'
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message))
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export async function login(svc_number, password) {
  return request('/api/auth/login/', { method: 'POST', body: { svc_number, password } })
}

export async function logout(refresh) {
  return request('/api/auth/logout/', { method: 'POST', body: { refresh } })
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

export async function getCourses() {
  return request('/api/courses/')
}

export async function addCourse(payload) {
  return request('/api/courses/', { method: 'POST', body: payload })
}

export async function updateCourse(id, payload) {
  // Use PATCH for partial updates to avoid requiring all fields on PUT
  return request(`/api/courses/${id}/`, { method: 'PATCH', body: payload })
}

export async function getClasses(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/classes/${qs}`)
  // Many list endpoints are paginated (DRF PageNumberPagination) and return
  // { count, results: [...] }. Unwrap results for callers that expect an array.
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Convenience helper: get classes for the currently authenticated user.
// Some backends expose `/api/classes/mine/` or `/api/classes/mine` — try both.
export async function getMyClasses() {
  // The deployed backend historically exposed `my_classes` (underscore).
  // Try the underscore form first to avoid noisy 404s in browsers, then
  // fall back to the hyphenated form if needed.
  try {
    return await request('/api/classes/my-classes/')
  } catch {
    try {
      return await request('/api/classes/my_classes/')
    } catch {
      // Last attempt without trailing slash (both variants)
      try {
        return await request('/api/classes/my-classes')
      } catch {
        return await request('/api/classes/my_classes')
      }
    }
  }
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

export async function getSubjects(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/subjects/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
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

export async function createExam(payload) {
  return request('/api/exams/', { method: 'POST', body: payload })
}

// Exam results helpers
export async function getExamResults(examId) {
  if (!examId) throw new Error('examId is required')
  return request(`/api/exams/${examId}/results/`)
}

// Get all submitted results for a student (student dashboard / notifications)
export async function getStudentResults(studentId) {
  if (!studentId) throw new Error('studentId is required')
  const qs = `?student_id=${encodeURIComponent(studentId)}`
  const data = await request(`/api/exam-results/student_results/${qs}`)
  return data
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
  const data = await request(`/api/class-notices/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
}

// Get class notices scoped to the current user. Backend exposes `my_notices`
// (or `my-notices`) depending on routing; try common variants and fall back
// to the generic list.
export async function getMyClassNotices(params = '') {
  const qs = params ? `?${params}` : ''
  try {
    const data = await request(`/api/class-notices/my_notices/${qs}`)
    if (data && Array.isArray(data.results)) return data.results
    return data
  } catch {
    try {
      const data = await request(`/api/class-notices/my-notices/${qs}`)
      if (data && Array.isArray(data.results)) return data.results
      return data
    } catch {
      // Fall back to the generic list endpoint
      return getClassNotices(params)
    }
  }
}

// Global notices (admin/site-wide)
export async function getNotices(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/notices/${qs}`)
  if (data && Array.isArray(data.results)) return data.results
  return data
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

// Upload exam attachment (multipart/form-data). Returns attachment resource.
export async function uploadExamAttachment(examId, file) {
  const API = API_BASE
  const token = authStore.getToken()
  const url = `${API}/api/exam-attachments/`
  const form = new FormData()
  form.append('exam', String(examId))
  form.append('file', file)

  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { method: 'POST', headers, body: form })

  if (!res.ok) {
    let text = await res.text()
    try { text = JSON.parse(text) } catch (e) { console.debug('upload parse error', e) }
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

export default {
  login,
  getCurrentUser,
  getStudents,
  getClasses,
  getMyClasses,
  getInstructors,
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
  getSubjects,
  getSubjectsPaginated,
  getClassSubjects,
  getClassEnrolledStudents,
  addSubject,
  getInstructorDashboard,
  getInstructorSummary,
  getMyStudents,
  getUserEnrollments,
  addEnrollment,
  updateCourse,
  updateClass,
  reactivateEnrollment,
  withdrawEnrollment,
  partialUpdateSubject,
  deleteSubject,
  getMySubjects,
  getExams,
  getMyExams,
  createExam,
  getExamResults,
  getStudentResults,
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
}
