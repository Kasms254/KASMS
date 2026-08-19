import { useState, useRef } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router'
import * as api from '../lib/api'
import useAuth from '../hooks/useAuth'
import QRCodeDisplay from '../components/QRCodeDisplay'

const renderIcon = (name, props = {}) => {
  const Comp = LucideIcons[name]
  if (Comp) return <Comp {...props} />
  return <span className={`${props.className || ''} inline-block w-4 h-4 bg-gray-300 rounded`} />
}

export default function TOTPSetup() {
  const [step, setStep] = useState('password') // 'password' | 'scan' | 'done'
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState(null)
  const [provisioningUri, setProvisioningUri] = useState(null)
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const inputRefs = useRef([])
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const resp = await api.totpEnrollStart(password)
      setSecret(resp.secret)
      setProvisioningUri(resp.provisioning_uri)
      setStep('scan')
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Incorrect password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDigitChange = (index, value) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError(null)
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const newDigits = [...digits]
      newDigits[index - 1] = ''
      setDigits(newDigits)
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6)
    const newDigits = ['', '', '', '', '', '']
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || ''
    }
    setDigits(newDigits)
    const lastFilled = Math.min(pasted.length, 5)
    inputRefs.current[lastFilled]?.focus()
  }

  const handleConfirmSubmit = async (e) => {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await api.totpEnrollConfirm(code)
      await refreshUser()
      setStep('done')
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Invalid code. Please try again.')
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — user can still select/copy the text manually
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100 w-full">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-rose-800 flex items-center justify-center mb-3 shadow-lg">
              {renderIcon('ShieldCheck', { className: 'w-8 h-8 text-white' })}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Set Up Authenticator App</h2>
            <p className="text-sm text-gray-500 mt-1">
              {step === 'password' && 'Confirm your password to begin.'}
              {step === 'scan' && 'Scan the QR code with your authenticator app.'}
              {step === 'done' && 'Two-factor authentication is now enabled.'}
            </p>
          </div>

          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full px-3 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  autoFocus
                />
              </label>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' }) : null}
                {loading ? 'Please wait...' : 'Continue'}
              </button>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                  <p className="flex-1">{error}</p>
                </div>
              )}
            </form>
          )}

          {step === 'scan' && (
            <form onSubmit={handleConfirmSubmit} className="space-y-5">
              <div className="flex justify-center">
                <div className="p-3 bg-white border border-gray-200 rounded-xl">
                  <QRCodeDisplay value={provisioningUri} size={180} />
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 text-center mb-1.5">
                  Can't scan? Enter this code manually:
                </p>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {secret}
                  {renderIcon(copied ? 'Check' : 'Copy', { className: 'w-3.5 h-3.5 text-gray-400 flex-shrink-0' })}
                </button>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 text-center mb-2">
                  Enter the 6-digit code from the app
                </p>
                <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleDigitChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 transition-all ${
                        error
                          ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                          : digit
                          ? 'border-red-800 bg-red-50 focus:ring-red-100 focus:border-red-800'
                          : 'border-gray-200 focus:ring-red-100 focus:border-red-300'
                      }`}
                      aria-label={`Digit ${i + 1} of 6`}
                      autoComplete="one-time-code"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || digits.join('').length < 6}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' }) : null}
                {loading ? 'Verifying...' : 'Enable Two-Factor Authentication'}
              </button>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                  <p className="flex-1">{error}</p>
                </div>
              )}
            </form>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-700 to-emerald-600 flex items-center justify-center mb-4 mx-auto shadow-lg">
                {renderIcon('CheckCircle', { className: 'w-8 h-8 text-white' })}
              </div>
              <p className="text-sm text-gray-600">
                From now on you'll be asked for a code from your authenticator app when you log in.
              </p>
              <button
                type="button"
                onClick={() => navigate('/profile', { replace: true })}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
              >
                Done
              </button>
            </div>
          )}

          {step !== 'done' && (
            <p className="mt-6 text-center text-sm">
              <button
                type="button"
                onClick={() => navigate('/profile', { replace: true })}
                className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 transition-colors"
              >
                {renderIcon('ArrowLeft', { className: 'w-3.5 h-3.5' })}
                Cancel
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
