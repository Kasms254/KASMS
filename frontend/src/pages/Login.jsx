import React, { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function Login() {
  const [svc_number, setSvc_number] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  // Sanitize and validate service number input (numbers only)
  const handleServiceNumberChange = (e) => {
    let value = e.target.value
    // Remove any non-numeric characters (numbers only)
    value = value.replace(/[^0-9]/g, '')
    // Limit length to reasonable service number length (e.g., 15 digits)
    value = value.slice(0, 15)
    setSvc_number(value)
    // Clear field error on change
    if (fieldErrors.svc_number) {
      setFieldErrors((prev) => ({ ...prev, svc_number: null }))
    }
  }

  // Sanitize password input (prevent control characters but allow special chars)
  const handlePasswordChange = (e) => {
    let value = e.target.value
    // Remove control characters and null bytes that could cause issues
    value = value.replace(/[\x00-\x1F\x7F]/g, '')
    // Limit length to reasonable password length
    value = value.slice(0, 128)
    setPassword(value)
    // Clear field error on change
    if (fieldErrors.password) {
      setFieldErrors((prev) => ({ ...prev, password: null }))
    }
  }

  // Client-side validation before submission
  const validateForm = () => {
    const fieldErrors = {}
    let generalError = null

    // Validate service number (must be numeric)
    if (!svc_number.trim()) {
      fieldErrors.svc_number = 'Service number is required'
    } else if (!/^[0-9]+$/.test(svc_number) || svc_number.length < 3 || svc_number.length > 15) {
      generalError = 'Invalid credentials'
    }

    // Validate password
    if (!password) {
      fieldErrors.password = 'Password is required'
    } else if (password.length < 4 || password.length > 128) {
      generalError = 'Invalid credentials'
    }

    return { fieldErrors, generalError }
  }

  const onSubmit = async (e) => {
    e.preventDefault()

    // Client-side validation
    const { fieldErrors: validationFieldErrors, generalError } = validateForm()
    if (Object.keys(validationFieldErrors).length > 0 || generalError) {
      setFieldErrors(validationFieldErrors)
      setError(generalError || 'Please fix the errors.')
      return
    }

    setLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      // Trim values before sending to API
      const result = await login(svc_number.trim(), password)
      if (result.ok) {
        // go to dashboard after successful login
        navigate('/dashboard')
      } else {
        // Check if there are field-level errors
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
          setError('Please fix the errors.')
        } else {
          // show inline error
          setError(result.error || 'Login failed. Please check your credentials and try again.')
        }
        setLoading(false)
      }
    } catch (err) {
      setError(err?.message || 'An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  const renderIcon = (name, props = {}) => {
    const Comp = LucideIcons[name]
    if (Comp) return <Comp {...props} />
    // fallback: small neutral square to avoid rendering undefined
    return <span className={`${props.className || ''} inline-block w-4 h-4 bg-gray-300 rounded`} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Graphic / branding: modern maroon gradient hero with logo */}
        <div className="hidden lg:flex items-center justify-center px-6">
          <div className="w-full max-w-md p-8 rounded-3xl bg-gradient-to-br from-red-900 via-red-800 to-rose-900 text-white shadow-2xl transform transition hover:scale-[1.01] relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="flex flex-col items-center relative z-10">
              <div className="w-36 h-36 rounded-full bg-white p-3 flex items-center justify-center mb-4 shadow-lg ring-4 ring-white/20">
                <img src="/ka.png" alt="Kenya Army logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-lg font-extrabold text-white text-center leading-tight">Kenya Army School Management System</h1>
              <p className="mt-3 text-sm text-red-100 text-center">Manage Classes, Students, Exams And Results</p>
              <div className="mt-6 flex gap-3 flex-wrap justify-center">
                <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-white flex items-center gap-1.5">
                  <LucideIcons.FileText className="w-3.5 h-3.5" />
                  Assignments
                </span>
                <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-white flex items-center gap-1.5">
                  <LucideIcons.ClipboardList className="w-3.5 h-3.5" />
                  Exams
                </span>
                <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-white flex items-center gap-1.5">
                  <LucideIcons.BarChart3 className="w-3.5 h-3.5" />
                  Results
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100 w-full max-w-md mx-auto lg:max-w-none">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-rose-800 p-0.5 mb-3 shadow-lg">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <img src="/ka.png" alt="Kenya Army logo" className="w-12 h-12 object-contain" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Welcome back</h2>
              <p className="text-sm text-gray-500 mt-1">Sign In With Your School Credentials</p>
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4"
            noValidate
            autoComplete="on"
          >
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Service Number</span>
              <div className="mt-1.5 relative">
                {renderIcon('User', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' })}
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={svc_number}
                  onChange={handleServiceNumberChange}
                  className={`w-full pl-10 pr-3 py-3 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    fieldErrors.svc_number ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-red-100 focus:border-red-300'
                  }`}
                  placeholder="e.g. 123456"
                  aria-invalid={!!fieldErrors.svc_number}
                  aria-describedby={fieldErrors.svc_number ? 'svc-number-error' : undefined}
                  autoComplete="username"
                  maxLength={15}
                  pattern="[0-9]+"
                  title="Service number must contain only numbers"
                />
              </div>
              {fieldErrors.svc_number && (
                <p id="svc-number-error" className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.svc_number}
                </p>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Password</span>
              <div className="mt-1.5 relative">
                {renderIcon('Lock', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' })}
                <input
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={handlePasswordChange}
                  className={`w-full pl-10 pr-10 py-3 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    fieldErrors.password ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-red-100 focus:border-red-300'
                  }`}
                  placeholder="Enter your password"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  autoComplete="current-password"
                  maxLength={128}
                  minLength={4}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {show ? renderIcon('EyeOff', { className: 'w-4 h-4' }) : renderIcon('Eye', { className: 'w-4 h-4' })}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </label>

            {/* <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-red-800 focus:ring-red-200 focus:ring-offset-0" />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm text-red-800 hover:text-red-900 font-medium transition-colors">Forgot password?</a>
            </div> */}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-red-900 to-red-800 text-white font-medium hover:from-red-800 hover:to-red-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  renderIcon('Loader2', { className: 'w-4 h-4 animate-spin' })
                ) : null}
                Sign in
              </button>
            </div>

            {error ? (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {renderIcon('AlertCircle', { className: 'w-5 h-5 flex-shrink-0 mt-0.5' })}
                <div className="flex-1">
                  <p className="font-medium">Login Failed</p>
                  <p className="text-red-500 mt-0.5">{error}</p>
                </div>
              </div>
            ) : null}
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
                         © {new Date().getFullYear()} KASMS All Rights Reserved.
          </p>

        </div>
      </div>
    </div>
  )
}
