// Small API client for the frontend. Uses fetch and the token stored by ../lib/auth.
import * as authStore from './auth'

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
const VITE_API_URL = import.meta.env.VITE_API_URL;

console.log("API URL:", VITE_API_URL);
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const url = `${API_BASE}${path}`
  const h = {
    'Content-Type': 'application/json',
    ...headers,
  }

  const opts = {
    method,
    headers: h,
    credentials: 'include', // include cookies automatically
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

const res = await fetch(`${VITE_API_URL}/auth/login/`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ svc_number, password }),
});

// Only parse if there’s content
let data = null;
const text = await res.text();
try {
  data = text ? JSON.parse(text) : null;
} catch {
  data = text; // fallback
}

if (!res.ok) {
  const errorMsg = data?.error || "Login failed";
  throw new Error(errorMsg);
}

return data;
}

export async function login(svc_number, password) {
  const res = await fetch(`${VITE_API_URL}/api/auth/login/`, {
    method: "POST",
    credentials: "include", 
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ svc_number, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Login failed");
  }

  return await res.json();
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
  return request(`/api/classes/${classId}/enrolled_students/`)
}

export async function getSubjects(params = '') {
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

export async function getInstructors() {
  return request('/api/users/instructors')
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
  updateCourse,
  updateClass,
  reactivateEnrollment,
  withdrawEnrollment,
  partialUpdateSubject,
  deleteSubject,
}
