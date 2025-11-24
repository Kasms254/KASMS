// Small API client for the frontend. Uses fetch and the token stored by ../lib/auth.
import * as authStore from './auth'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

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

  const res = await fetch(url, opts)
  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // non-json response
    data = text
  }

  if (!res.ok) {
    // Prefer common fields returned by different backends
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

export async function getCurrentUser() {
  // Try common endpoints used by different backends
  try {
    return await request('/api/auth/me/')
  } catch {
    return await request('/api/users/me/')
  }
}

export async function getStudents() {
  return request('/api/users/students')
}

export async function getCourses() {
  return request('/api/courses/')
}

export async function addCourse(payload) {
  return request('/api/courses/', { method: 'POST', body: payload })
}

export async function getClasses(params = '') {
  const qs = params ? `?${params}` : ''
  const data = await request(`/api/classes/${qs}`)
  // Many list endpoints are paginated (DRF PageNumberPagination) and return
  // { count, results: [...] }. Unwrap results for callers that expect an array.
  if (data && Array.isArray(data.results)) return data.results
  return data
}

export async function addClass(payload) {
  return request('/api/classes/', { method: 'POST', body: payload })
}

export async function getClassSubjects(classId) {
  return request(`/api/classes/${classId}/subjects/`)
}

export async function getClassEnrolledStudents(classId) {
  return request(`/api/classes/${classId}/enrolled_students/`)
}

export async function getSubjects(params = '') {
  const qs = params ? `?${params}` : ''
  return request(`/api/subjects/${qs}`)
}

export async function addSubject(payload) {
  return request('/api/subjects/', { method: 'POST', body: payload })
}

export async function getInstructors() {
  return request('/api/users/instructors')
}

export async function getUserEnrollments(userId) {
  return request(`/api/users/${userId}/enrollments/`)
}

export async function addEnrollment(payload) {
  return request('/api/enrollments/', { method: 'POST', body: payload })
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
  getInstructors,
  getUsers,
  addUser,
  getUser,
  updateUser,
  partialUpdateUser,
  deleteUser,
  activateUser,
  deactivateUser,
  getSubjects,
  getClassSubjects,
  addSubject,
  getUserEnrollments,
  addEnrollment,
}
