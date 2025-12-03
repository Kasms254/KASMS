// Small API client for the frontend. Uses fetch and the token stored by ../lib/auth.
// const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
// const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
// const VITE_API_URL = import.meta.env.VITE_API_URL;

// const API_BASE = import meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const url = `${API_BASE}${path}`
  
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include', // This sends cookies with every request
  }
  
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  
  const res = await fetch(url, opts)
  
  // Only parse if there's content
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text // fallback
  }
  
  if (!res.ok) {
    const errorMsg = data?.error || "Request failed"
    throw new Error(errorMsg)
  }
  
  return data
}

export async function login(svc_number, password) {
  return request('/api/auth/login/', {
    method: 'POST',
    body: { svc_number, password },
  })
}

  export async function logout() {
  return request('/api/auth/logout/', {
    method: 'POST',
  })
}

export async function getCurrentUser() {
  return request('/api/auth/me/')
}

export async function refreshToken() {
  return request('/api/auth/token/refresh/', {
    method: 'POST',
  })
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
    return await request('/api/classes/my_classes/')
  } catch {
    try {
      return await request('/api/classes/my-classes/')
    } catch {
      // Last attempt without trailing slash
      return await request('/api/classes/my_classes')
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

export async function createExam(payload) {
  return request('/api/exams/', { method: 'POST', body: payload })
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

// Upload exam attachment (multipart/form-data). Returns attachment resource.
export async function uploadExamAttachment(examId, file) {
  const url = `${API_BASE}/api/exam-attachments/`
  const form = new FormData()
  form.append('exam', String(examId))
  form.append('file', file)
  
  const res = await fetch(url, { 
    method: 'POST', 
    credentials: 'include', // Use cookies instead of manual token
    body: form 
    // Don't set Content-Type header for FormData - browser sets it automatically
  })
  
  if (!res.ok) {
    let text = await res.text()
    try { 
      text = JSON.parse(text) 
    } catch (e) { 
      console.debug('upload parse error', e) 
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
  updateExam,
  deleteExam,
  uploadExamAttachment,
  getExamAttachments,
  getClassNotices,
  getMyClassNotices,
  createClassNotice,
}
