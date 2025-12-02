import React from 'react'

export default function ConfirmModal({ open, title = 'Confirm', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, loading = false, confirmVariant = '' }) {
  if (!open) return null

  // Determine button classes based on variant. If confirmVariant === 'danger', make confirm red and cancel indigo
  const cancelClass = "px-4 py-2 rounded-md border bg-indigo-600 text-white"
  const confirmClass = confirmVariant === 'danger' ? "px-4 py-2 rounded-md bg-red-600 text-white" : "px-4 py-2 rounded-md bg-blue-600 text-white"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-lg font-medium text-black">{title}</h4>
            {message ? <p className="text-sm text-neutral-600 mt-1">{message}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onCancel} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
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
