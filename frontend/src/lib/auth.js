// In-memory auth token store.
// We intentionally avoid persisting tokens in localStorage to reduce XSS risk.
// The backend issues access and refresh tokens; store them in memory and
// let the app refresh the access token when needed. Note: tokens will be
// lost on page reload (recommended for better security) unless you opt-in
// to a different persistence strategy (httpOnly cookie set by the server).

let _access = null
let _refresh = null

export function isAuthenticated() {
  return !!_access
}

export function login({ access = null, refresh = null } = {}) {
  _access = access || null
  _refresh = refresh || null
}

export function setAccess(token) {
  _access = token || null
}

export function setRefresh(token) {
  _refresh = token || null
}

export function logout() {
  _access = null
  _refresh = null
}

export function getToken() {
  return _access
}

export function getRefreshToken() {
  return _refresh
}
