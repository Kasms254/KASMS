import React, { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await login(username, password)
      if (result.ok) {
        // go to dashboard after successful login
        navigate('/dashboard')
        return
      }
      // show inline error
      setError(result.error || 'Login failed')
    } catch (err) {
      setError(err?.message || 'Login failed')
    } finally {
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
            <h1 className="text-4xl font-extrabold text-black">Welcome back</h1>
            <p className="mt-2 text-sm text-gray-600">Sign in to manage classes, students and school data.</p>
          </div>

          <div className="rounded-2xl p-6 bg-gradient-to-tr from-indigo-50 to-pink-50 shadow-md">
            <div className="text-indigo-600 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">S</div>
              <div>
                <div className="text-sm font-semibold">School Management System</div>
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

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-gray-700">Username</span>
              <div className="mt-1 relative">
                {renderIcon('Mail', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-3' })}
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="username"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm text-gray-700">Password</span>
              <div className="mt-1 relative">
                {renderIcon('Lock', { className: 'w-4 h-4 text-gray-400 absolute left-3 top-3' })}
                <input
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-2 text-gray-500 p-1 rounded"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? renderIcon('EyeOff', { className: 'w-4 h-4' }) : renderIcon('Eye', { className: 'w-4 h-4' })}
                </button>
              </div>
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
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-2">
                {error}
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
