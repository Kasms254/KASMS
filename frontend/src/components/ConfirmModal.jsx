import React from 'react'
import * as LucideIcons from 'lucide-react'

export default function ConfirmModal({ open, title = 'Confirm', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, loading = false, confirmVariant = '' }) {
  if (!open) return null

  // Standardized button classes based on variant
  const cancelClass = "px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
  const confirmClass = confirmVariant === 'danger'
    ? "px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
    : "px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="text-lg font-medium text-black">{title}</h4>
            {message ? <p className="text-sm text-neutral-600 mt-1">{message}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onCancel} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
            <LucideIcons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className={cancelClass}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={loading} className={confirmClass}>
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
