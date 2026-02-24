// Auth module for HTTP-only cookie backend.
// Tokens are managed entirely by the server as HTTP-only cookies.
// JavaScript cannot read them — no localStorage storage needed.
// This module is a compatibility shim so existing imports don't break.

export function isAuthenticated() {
  // Cannot check HTTP-only cookies from JS.
  // Auth state is derived from the user object in AuthContext.
  return false
}

// No-ops: tokens are set/cleared by the server via Set-Cookie headers.
export function login() {}
export function logout() {}
export function setAccess() {}
export function setRefresh() {}

export function getToken() {
  // HTTP-only cookies are not accessible from JavaScript.
  return null
}

export function getRefreshToken() {
  // HTTP-only cookies are not accessible from JavaScript.
  return null
}
