// Minimal auth utility used for route guarding in dev/demo environment.
// Replace with real auth (tokens, cookies) when integrating with backend.

export function isAuthenticated() {
  try {
    return !!localStorage.getItem('skl_auth_token')
  } catch {
    return false
  }
}

export function login(token) {
  try {
    localStorage.setItem('skl_auth_token', token)
  } catch {
    // ignore
  }
}

export function logout() {
  try {
    localStorage.removeItem('skl_auth_token')
  } catch {
    // ignore
  }
}

export function getToken() {
  try {
    return localStorage.getItem('skl_auth_token')
  } catch {
    return null
  }
}
