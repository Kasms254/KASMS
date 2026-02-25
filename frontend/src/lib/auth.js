// Authentication is handled entirely via HTTP-only cookies set by the server.
// JavaScript cannot read or write the access_token / refresh_token cookies,
// which is intentional — it prevents XSS from stealing session tokens.
// All API requests include credentials:'include' so the browser sends
// cookies automatically. No client-side token storage is used.

export function getToken() {
  return null
}

export function getRefreshToken() {
  return null
}
