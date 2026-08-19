import { useState, useRef } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router'
import * as api from '../lib/api'

const renderIcon = (name, props = {}) => {
  const Comp = LucideIcons[name]
  if (Comp) return <Comp {...props} />
  return <span className={`${props.className || ''} inline-block w-4 h-4 bg-gray-300 rounded`} />
}

export default function TOTPRecovery() {
  const [step, setStep] = useState('identity') // 'identity' | 'code'
  const [svcNumber, setSvcNumber] = useState('')
  const [password, setPassword] = useState('')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState(null)
  const [success, setSuccess] = useState(false)

  const inputRefs = useRef([])
  const navigate = useNavigate()

  const handleIdentitySubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const resp = await api.totpRecoverStart(svcNumber.trim(), password)
      setMaskedEmail(resp?.email || null)
      setStep('code')
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Unable to start recovery. Please check your details and try again.')
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

  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await api.totpRecoverConfirm(svcNumber.trim(), password, code)
      setSuccess(true)
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Invalid code. Please try again.')
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100 w-full text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-700 to-emerald-600 flex items-center justify-center mb-4 mx-auto shadow-lg">
              {renderIcon('CheckCircle', { className: 'w-8 h-8 text-white' })}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Two-Factor Authentication Reset</h2>
            <p className="text-sm text-gray-500 mt-2">
              Your authenticator has been removed. Log in again with your password;
              you'll receive a code by email, and can set up a new authenticator afterward.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100 w-full">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-rose-800 flex items-center justify-center mb-3 shadow-lg">
              {renderIcon('LifeBuoy', { className: 'w-8 h-8 text-white' })}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Recover Your Account</h2>
            <p className="text-sm text-gray-500 mt-1">
              {step === 'identity'
                ? 'Confirm your credentials to reset your authenticator.'
                : `Enter the code sent to ${maskedEmail || 'your email'}`}
            </p>
          </div>

          {step === 'identity' ? (
            <form onSubmit={handleIdentitySubmit} className="space-y-4" noValidate>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Service Number</span>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={svcNumber}
                  onChange={(e) => setSvcNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 15))}
                  className="mt-1.5 w-full px-3 py-3 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                  placeholder="e.g. 123456"
                  autoComplete="username"
                />
              </label>
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
                />
              </label>

              <button
                type="submit"
                disabled={loading || !svcNumber || !password}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' }) : null}
                {loading ? 'Sending code...' : 'Send Recovery Code'}
              </button>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                  <p className="flex-1">{error}</p>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-5">
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

              <button
                type="submit"
                disabled={loading || digits.join('').length < 6}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' }) : null}
                {loading ? 'Verifying...' : 'Reset Two-Factor Authentication'}
              </button>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                  <p className="flex-1">{error}</p>
                </div>
              )}
            </form>
          )}

          <p className="mt-6 text-center text-sm">
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 transition-colors"
            >
              {renderIcon('ArrowLeft', { className: 'w-3.5 h-3.5' })}
              Back to Login
            </button>
          </p>

          <p className="mt-4 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} KASMS All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
