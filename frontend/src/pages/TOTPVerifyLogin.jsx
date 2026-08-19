import { useState, useRef, useEffect, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router'
import useAuth from '../hooks/useAuth'

export default function TOTPVerifyLogin() {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [remainingAttempts, setRemainingAttempts] = useState(null)

  const inputRefs = useRef([])
  const navigate = useNavigate()
  const { verifyTOTP, clearTotpPending, requiresTOTP, user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (user) {
      navigate('/dashboard', { replace: true })
    } else if (!requiresTOTP) {
      navigate('/', { replace: true })
    }
  }, [requiresTOTP, user, authLoading, navigate])

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code.')
      return
    }
    setLoading(true)
    setError(null)
    const result = await verifyTOTP(code)
    if (result.ok) {
      if (result.mustChangePassword) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } else {
      setLoading(false)
      setError(result.error || 'Invalid authenticator code. Please try again.')
      if (result.remainingAttempts !== null) {
        setRemainingAttempts(result.remainingAttempts)
      }
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    }
  }

  const handleBackToLogin = useCallback(() => {
    clearTotpPending()
    navigate('/login', { replace: true })
  }, [clearTotpPending, navigate])

  const handleUseRecovery = useCallback(() => {
    navigate('/totp-recovery')
  }, [navigate])

  const renderIcon = (name, props = {}) => {
    const Comp = LucideIcons[name]
    if (Comp) return <Comp {...props} />
    return <span className={`${props.className || ''} inline-block w-4 h-4 bg-gray-300 rounded`} />
  }

  if (authLoading || user || !requiresTOTP) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="w-full max-w-md">

        <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100 w-full">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-rose-800 flex items-center justify-center mb-3 shadow-lg">
              {renderIcon('ShieldCheck', { className: 'w-8 h-8 text-white' })}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Enter Authenticator Code</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
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

              {remainingAttempts !== null && remainingAttempts > 0 && (
                <p className="mt-2 text-center text-xs text-amber-600 flex items-center justify-center gap-1">
                  {renderIcon('AlertTriangle', { className: 'w-3.5 h-3.5' })}
                  {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining before lockout
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || digits.join('').length < 6}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' }) : null}
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                <div className="flex-1">
                  <p className="font-medium">Verification Failed</p>
                  <p className="text-red-500 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleUseRecovery}
                className="text-sm text-red-800 hover:text-red-900 font-medium transition-colors inline-flex items-center gap-1.5"
              >
                {renderIcon('LifeBuoy', { className: 'w-3.5 h-3.5' })}
                Lost access to your authenticator? Use recovery
              </button>

              <button
                type="button"
                onClick={handleBackToLogin}
                className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 transition-colors"
              >
                {renderIcon('ArrowLeft', { className: 'w-3.5 h-3.5' })}
                Back to Login
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} KASMS All Rights Reserved.
          </p>
        </div>

      </div>
    </div>
  )
}
