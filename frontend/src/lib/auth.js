// Minimal auth utility used for route guarding in dev/demo environment.
// Replace with real auth (tokens, cookies) when integrating with backend.

export function isAuthenticated() {

  return true;
}

export function login() {

}

export function logout() {

  return fetch('${import.meta.env.VITE_APP_URL}/api/auth/logout/', {
    method: 'POST',
    credentials: 'include'
  });
}

export function getToken()  {
    return null;
  
}
