import React from 'react'
import * as LucideIcons from 'lucide-react'

// Shown a few seconds before AuthProvider's inactivity timer logs the user
// out, so a session ending mid-task doesn't come as a silent surprise.
export default function InactivityWarningModal({ open, secondsLeft, onStay, onLogout }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" role="alertdialog" aria-modal="true" aria-labelledby="inactivity-warning-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm bg-surface rounded-xl p-6 shadow-2xl ring-1 ring-hair text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-fill-amber-100 rounded-full flex items-center justify-center">
          <LucideIcons.Clock className="w-6 h-6 text-mark-amber-600" />
        </div>
        <h2 id="inactivity-warning-title" className="text-lg font-semibold text-fg">
          Still there?
        </h2>
        <p className="text-sm text-fg-muted mt-2">
          You've been inactive for a while. For your security, you'll be logged out in{' '}
          <span className="font-semibold text-fg">{secondsLeft}s</span> unless you stay signed in.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={onStay}
            className="flex-1 px-4 py-2.5 bg-fill-indigo-600 text-white rounded-lg hover:bg-fill-indigo-700 transition-colors font-medium"
          >
            Stay signed in
          </button>
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2.5 bg-surface-2 text-fg-body rounded-lg hover:bg-surface-3 transition-colors font-medium"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  )
}
