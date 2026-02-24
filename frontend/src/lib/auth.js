// Auth token store using localStorage.
// Supports two auth modes:
//  1. Bearer token mode: access/refresh JWTs stored in localStorage
//  2. Cookie mode: backend sets HTTP-only cookies; we only track a session flag

const ACCESS_TOKEN_KEY = 'auth_access_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'
const SESSION_KEY = 'auth_cookie_session'

export function isAuthenticated() {
  return !!getToken() || isSessionActive()
}

// Set/check the cookie-session flag (used when backend returns tokens as HTTP-only cookies)
export function setSessionActive(active) {
  if (active) localStorage.setItem(SESSION_KEY, '1')
  else localStorage.removeItem(SESSION_KEY)
}

export function isSessionActive() {
  return !!localStorage.getItem(SESSION_KEY) || !!localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function login({ access = null, refresh = null } = {}) {
  if (access) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access)
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  }
  if (refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export function setAccess(token) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  }
}

export function setRefresh(token) {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export function logout() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(SESSION_KEY)
}

export function getToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}
