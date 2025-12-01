import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { ToastContext } from '../context/toastContext'

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // keep track of active timers so we can clear them on unmount
  const timersRef = useRef(new Map())

  const showToast = useCallback((message, { type = 'success', duration = 3000 } = {}) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const toast = { id, message, type }
    setToasts((t) => [...t, toast])

    const timer = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
      timersRef.current.delete(id)
    }, duration)

    timersRef.current.set(id, timer)
    return id
  }, [])

  const success = useCallback((message, duration = 3000) => {
    return showToast(message, { type: 'success', duration })
  }, [showToast])

  const error = useCallback((message, duration = 4000) => {
    return showToast(message, { type: 'error', duration })
  }, [showToast])

  // stable context value so consumers don't re-run effects unnecessarily
  const value = useMemo(() => ({ showToast, success, error }), [showToast, success, error])

  // clear timers on unmount to avoid updating state after unmount
  useEffect(() => {
    // copy timers at mount so cleanup uses the same snapshot
    const timers = timersRef.current
    return () => {
      for (const timer of Array.from(timers.values())) clearTimeout(timer)
      timers.clear()
    }
  }, [])

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
