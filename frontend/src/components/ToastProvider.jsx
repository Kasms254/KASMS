import React, { useState, useCallback } from 'react'
import { ToastContext } from '../context/toastContext'

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, { type = 'success', duration = 3000 } = {}) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const toast = { id, message, type }
    setToasts((t) => [...t, toast])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, duration)
  }, [])

  const success = useCallback((message, duration = 3000) => {
    showToast(message, { type: 'success', duration })
  }, [showToast])

  const error = useCallback((message, duration = 4000) => {
    showToast(message, { type: 'error', duration })
  }, [showToast])

  const value = { showToast, success, error }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div aria-live="polite" className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`max-w-sm w-full px-4 py-2 rounded shadow-md text-sm ${t.type === 'success' ? 'bg-green-600 text-white' : 'bg-rose-600 text-white'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
