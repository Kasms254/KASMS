import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'

if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const keysToRemove = ['accessToken', 'refreshToken', 'authToken', 'auth_token', 'access_token', 'skl_auth_token']
    keysToRemove.forEach((k) => { if (window.localStorage.getItem(k) !== null) window.localStorage.removeItem(k) })
  } catch {
    // ignore localStorage errors
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

