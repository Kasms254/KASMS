import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { ToastContext } from '../context/toastContext'
import * as LucideIcons from 'lucide-react'

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // keep track of active timers so we can clear them on unmount
  const timersRef = useRef(new Map())

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message, { type = 'success', duration = 3000 } = {}) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const toast = { id, message, type }
    setToasts((t) => [...t, toast])

    const timer = setTimeout(() => {
      dismissToast(id)
    }, duration)

    timersRef.current.set(id, timer)
    return id
  }, [dismissToast])

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
      <div aria-live="polite" className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-right duration-300 ${
              t.type === 'success' ? 'bg-green-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {t.type === 'success' ? (
                <LucideIcons.CheckCircle2 className="w-5 h-5" />
              ) : (
                <LucideIcons.AlertCircle className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 text-sm leading-relaxed">{t.message}</div>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition"
            >
              <LucideIcons.X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
