import { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import * as api from '../lib/api'
import * as authStore from '../lib/auth'

function checkPasswordStrength(password) {
  const feedback = []
  let score = 0

  if (password.length >= 8) {
    score += 1
    feedback.push({ met: true, text: 'At least 8 characters' })
  } else {
    feedback.push({ met: false, text: 'At least 8 characters' })
  }

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) {
    score += 1
    feedback.push({ met: true, text: 'Contains uppercase and lowercase' })
  } else {
    feedback.push({ met: false, text: 'Contains uppercase and lowercase' })
  }

  if (/\d/.test(password)) {
    score += 1
    feedback.push({ met: true, text: 'Contains numbers' })
  } else {
    feedback.push({ met: false, text: 'Contains numbers' })
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 1
    feedback.push({ met: true, text: 'Contains special characters' })
  } else {
    feedback.push({ met: false, text: 'Contains special characters' })
  }

  return { score, feedback }
}

const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong']
const strengthColors = ['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500']

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const { logout, setMustChangePassword } = useAuth()

  const { score, feedback } = checkPasswordStrength(newPassword)

  const renderIcon = (name, props = {}) => {
    const Comp = LucideIcons[name]
    if (Comp) return <Comp {...props} />
    return <span className={`${props.className || ''} inline-block w-4 h-4 bg-gray-300 rounded`} />
  }

  const validate = () => {
    const errors = {}
    if (!currentPassword) errors.currentPassword = 'Current password is required'
    if (!newPassword) {
      errors.newPassword = 'New password is required'
    } else if (score < 3) {
      errors.newPassword = 'Password is not strong enough'
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password'
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      errors.newPassword = 'New password must be different from current password'
    }
    return errors
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      const resp = await api.changePassword(currentPassword, newPassword, confirmPassword)
      // Update tokens from response
      const newAccess = resp?.access || resp?.token || null
      const newRefresh = resp?.refresh || resp?.refresh_token || null
      if (newAccess) {
        authStore.login({ access: newAccess, refresh: newRefresh })
      }
      setMustChangePassword(false)
      navigate('/dashboard')
    } catch (err) {
      if (err?.data?.error) {
        // Backend returns { error: "message" } or { error: ["msg1", ...] }
        const msg = Array.isArray(err.data.error)
          ? err.data.error.join(' ')
          : err.data.error
        setError(msg)
      } else {
        setError(err?.message || 'Failed to change password. Please try again.')
      }
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-rose-800 p-0.5 mb-3 shadow-lg">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                {renderIcon('KeyRound', { className: 'w-8 h-8 text-red-900' })}
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Change Your Password</h2>
            <p className="text-sm text-gray-500 mt-1">You must set a new password before continuing</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {/* Current Password */}
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Current Password</span>
              <div className="mt-1.5 relative">
                {renderIcon('Lock', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' })}
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value)
                    if (fieldErrors.currentPassword) setFieldErrors(prev => ({ ...prev, currentPassword: null }))
                  }}
                  className={`w-full pl-10 pr-10 py-3 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    fieldErrors.currentPassword ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-red-100 focus:border-red-300'
                  }`}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showCurrent ? renderIcon('EyeOff', { className: 'w-4 h-4' }) : renderIcon('Eye', { className: 'w-4 h-4' })}
                </button>
              </div>
              {fieldErrors.currentPassword && (
                <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.currentPassword}</p>
              )}
            </label>

            {/* New Password */}
            <label className="block">
              <span className="text-sm font-medium text-gray-700">New Password</span>
              <div className="mt-1.5 relative">
                {renderIcon('KeyRound', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' })}
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    if (fieldErrors.newPassword) setFieldErrors(prev => ({ ...prev, newPassword: null }))
                  }}
                  className={`w-full pl-10 pr-10 py-3 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    fieldErrors.newPassword ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-red-100 focus:border-red-300'
                  }`}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showNew ? renderIcon('EyeOff', { className: 'w-4 h-4' }) : renderIcon('Eye', { className: 'w-4 h-4' })}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.newPassword}</p>
              )}
            </label>

            {/* Password Strength Indicator */}
            {newPassword && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i < score ? strengthColors[score - 1] : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    Strength: <span className="font-medium">{score > 0 ? strengthLabels[score - 1] : 'Too weak'}</span>
                  </span>
                </div>
                <ul className="space-y-1">
                  {feedback.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs">
                      {item.met
                        ? renderIcon('Check', { className: 'w-3.5 h-3.5 text-green-500' })
                        : renderIcon('X', { className: 'w-3.5 h-3.5 text-gray-300' })
                      }
                      <span className={item.met ? 'text-green-700' : 'text-gray-400'}>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confirm Password */}
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Confirm New Password</span>
              <div className="mt-1.5 relative">
                {renderIcon('ShieldCheck', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' })}
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    if (fieldErrors.confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: null }))
                  }}
                  className={`w-full pl-10 pr-10 py-3 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    fieldErrors.confirmPassword ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-red-100 focus:border-red-300'
                  }`}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showConfirm ? renderIcon('EyeOff', { className: 'w-4 h-4' }) : renderIcon('Eye', { className: 'w-4 h-4' })}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600" role="alert">{fieldErrors.confirmPassword}</p>
              )}
            </label>

            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' }) : null}
                Change Password
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
              >
                {renderIcon('LogOut', { className: 'w-4 h-4' })}
                Log out instead
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                <div className="flex-1">
                  <p className="font-medium">Password Change Failed</p>
                  <p className="text-red-500 mt-0.5">{error}</p>
                </div>
              </div>
            )}
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} KASMS All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
