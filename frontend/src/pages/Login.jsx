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
    const errors = {}

    // Validate service number (must be numeric)
    if (!svc_number.trim()) {
      errors.svc_number = 'Service number is required'
    } else if (!/^[0-9]+$/.test(svc_number)) {
      errors.svc_number = 'Service number must contain only numbers'
    } else if (svc_number.length < 3) {
      errors.svc_number = 'Service number must be at least 3 digits'
    } else if (svc_number.length > 15) {
      errors.svc_number = 'Service number must not exceed 15 digits'
    }

    // Validate password
    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 4) {
      errors.password = 'Password must be at least 4 characters'
    } else if (password.length > 128) {
      errors.password = 'Password must not exceed 128 characters'
    }

    return errors
  }

  const onSubmit = async (e) => {
    e.preventDefault()

    // Client-side validation
    const validationErrors = validateForm()
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setError('Please fix the errors below.')
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
          setError('Please fix the errors below.')
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
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Graphic / branding */}
        <div className="hidden md:flex flex-col justify-center px-6">
          <div className="mb-6">
            <h1 className="text-4xl font-extrabold text-black">Welcome</h1>
            <p className="mt-2 text-sm text-gray-600">Sign in to manage classes, students and school data.</p>
          </div>

          <div className="rounded-2xl p-6 bg-gradient-to-tr from-indigo-50 to-pink-50 shadow-md">
            <div className="text-indigo-600 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">SM</div>
              <div>
                <div className="text-sm font-semibold">Kenya Army School Management System</div>
                <div className="text-xs text-gray-500">Organize your academic life.</div>
              </div>
            </div>
            <div className="text-sm text-gray-700">
              <ul className="list-disc pl-5 space-y-2">
                <li>Fast class & student management</li>
                <li>Assignments, exams and results</li>
                <li>Secure role-based access</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-10">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-black">Sign in to your account</h2>
            <p className="text-sm text-gray-500">Use your school credentials to continue</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4"
            noValidate
            autoComplete="on"
          >
            <label className="block">
              <span className="text-sm text-gray-700">Service Number</span>
              <div className="mt-1 relative">
                {renderIcon('Mail', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-3' })}
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={svc_number}
                  onChange={handleServiceNumberChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    fieldErrors.svc_number ? 'border-red-300 focus:ring-red-200' : 'focus:ring-indigo-200'
                  }`}
                  placeholder="e.g., 123456"
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
              <span className="text-sm text-gray-700">Password</span>
              <div className="mt-1 relative">
                {renderIcon('Lock', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-3' })}
                <input
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={handlePasswordChange}
                  className={`w-full pl-10 pr-10 py-2 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    fieldErrors.password ? 'border-red-300 focus:ring-red-200' : 'focus:ring-indigo-200'
                  }`}
                  placeholder="Your password"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  autoComplete="current-password"
                  maxLength={128}
                  minLength={4}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-2 text-gray-500 p-1 rounded hover:bg-gray-100 transition-colors"
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

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="form-checkbox h-4 w-4 text-indigo-600" />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm text-indigo-600">Forgot password?</a>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
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

            <div className="flex items-center gap-3">
              <div className="h-px bg-gray-200 flex-1" />
              <div className="text-xs text-gray-400">or continue with</div>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            {/* <div className="flex gap-3">
              <button type="button" className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 hover:shadow-sm">
                {renderIcon('Google', { className: 'w-4 h-4 text-rose-500' })}
                <span className="text-sm">Google</span>
              </button>
              <button type="button" className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 hover:shadow-sm">
                {renderIcon('Github', { className: 'w-4 h-4' })}
                <span className="text-sm">GitHub</span>
              </button>
            </div> */}
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account? <a href="#" className="text-indigo-600">Request access</a>
          </p>
        </div>
      </div>
    </div>
  )
}
