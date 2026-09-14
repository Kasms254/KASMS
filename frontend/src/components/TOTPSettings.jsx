import { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router'
import * as api from '../lib/api'
import useAuth from '../hooks/useAuth'

const renderIcon = (name, props = {}) => {
  const Comp = LucideIcons[name]
  if (Comp) return <Comp {...props} />
  return <span className={`${props.className || ''} inline-block w-4 h-4 bg-surface-4 rounded`} />
}

export default function TOTPSettings({ user }) {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [showDisableForm, setShowDisableForm] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const totpEnabled = !!user?.totp_enabled

  const handleDisable = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.totpDisable(password)
      await refreshUser()
      setShowDisableForm(false)
      setPassword('')
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Incorrect password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-hair p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${totpEnabled ? 'bg-fill-green-100' : 'bg-surface-2'}`}>
            {renderIcon('ShieldCheck', { className: `w-5 h-5 ${totpEnabled ? 'text-mark-green-700' : 'text-fg-faint'}` })}
          </div>
          <div>
            <p className="text-sm font-medium text-fg">Authenticator App</p>
            <p className="text-xs text-fg-soft">
              {totpEnabled ? 'Enabled — required at login' : 'Not enabled'}
            </p>
          </div>
        </div>

        {totpEnabled ? (
          <button
            type="button"
            onClick={() => setShowDisableForm((s) => !s)}
            className="text-sm text-mark-red-700 hover:text-mark-red-800 font-medium transition-colors"
          >
            Disable
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/totp-setup')}
            className="text-sm text-mark-red-800 hover:text-mark-red-900 font-medium transition-colors"
          >
            Enable
          </button>
        )}
      </div>

      {showDisableForm && (
        <form onSubmit={handleDisable} className="mt-4 pt-4 border-t border-hair space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-fg-body">Confirm password to disable</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-edge-red-100 focus:border-edge-red-300"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !password}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-fill-red-800 text-white text-sm font-medium hover:bg-fill-red-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? renderIcon('Loader2', { className: 'w-3.5 h-3.5 animate-spin' }) : null}
              Confirm Disable
            </button>
            <button
              type="button"
              onClick={() => { setShowDisableForm(false); setError(null); setPassword('') }}
              className="px-4 py-2 rounded-lg text-sm text-fg-muted hover:bg-canvas transition-colors"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="text-xs text-mark-red-600">{error}</p>
          )}
        </form>
      )}
    </div>
  )
}
