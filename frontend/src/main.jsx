import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ScrollToTop from './components/ScrollToTop'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './context/themeContext'
import { AuthProvider } from './context/AuthProvider'
import ToastProvider from './components/ToastProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

// Security: Disable DevTools and console logging in production
if (typeof window !== 'undefined' && import.meta.env.PROD) {
  // Disable React DevTools
  if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object') {
    for (let [key, value] of Object.entries(window.__REACT_DEVTOOLS_GLOBAL_HOOK__)) {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] = typeof value === 'function' ? () => {} : null
    }
  }

  // Disable console methods to prevent data exposure
  const noop = () => {}
  console.log = noop
  console.debug = noop
  console.info = noop
  console.warn = noop
  console.error = noop
  console.trace = noop
  console.dir = noop
  console.dirxml = noop
  console.table = noop
  console.group = noop
  console.groupCollapsed = noop
  console.groupEnd = noop
}

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

