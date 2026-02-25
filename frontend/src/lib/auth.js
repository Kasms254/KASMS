// Auth token store using localStorage.
// Tokens are persisted in localStorage for convenience across page reloads.

const ACCESS_TOKEN_KEY = 'auth_access_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'

export function isAuthenticated() {
  return !!getToken()
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
}

export function getToken() {
  // HTTP-only cookies are not accessible from JavaScript.
  return null
}

export function getRefreshToken() {
  // HTTP-only cookies are not accessible from JavaScript.
  return null
}
