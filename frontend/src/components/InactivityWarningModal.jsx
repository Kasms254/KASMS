import React from 'react'
import * as LucideIcons from 'lucide-react'

// Shown a few seconds before AuthProvider's inactivity timer logs the user
// out, so a session ending mid-task doesn't come as a silent surprise.
export default function InactivityWarningModal({ open, secondsLeft, onStay, onLogout }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" role="alertdialog" aria-modal="true" aria-labelledby="inactivity-warning-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5 text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
          <LucideIcons.Clock className="w-6 h-6 text-amber-600" />
        </div>
        <h2 id="inactivity-warning-title" className="text-lg font-semibold text-gray-900">
          Still there?
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          You've been inactive for a while. For your security, you'll be logged out in{' '}
          <span className="font-semibold text-gray-900">{secondsLeft}s</span> unless you stay signed in.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={onStay}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            Stay signed in
          </button>
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  )
}
