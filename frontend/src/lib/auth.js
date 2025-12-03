// lib/auth.js - Simplified version
export function isAuthenticated() {
  // We can't check cookies from JavaScript (they're httpOnly)
  // So we return true and let the backend enforce auth
  // The frontend will check via getCurrentUser() call
  return true
}

export function login() {
  // No-op, cookies are set by backend
}

export function logout() {
  // No-op, cookies are cleared by backend
}

export function getToken() {
  return null // Not needed with cookies
}

export function getRefreshToken() {
  return null // Not needed with cookies
}