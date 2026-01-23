import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../lib/api'
import useToast from '../hooks/useToast'

const roles = [
  { value: 'student', label: 'Student', description: 'Can view classes, exams, and results' },
  { value: 'instructor', label: 'Instructor', description: 'Can manage classes and grade exams' },
  { value: 'admin', label: 'Admin', description: 'Full system access' },
  { value: 'commandant', label: 'Commandant', description: 'Oversight and management' },
]

const ranks = [
  { value: 'general', label: 'General' },
  { value: 'lieutenant colonel', label: 'Lieutenant Colonel' },
  { value: 'major', label: 'Major' },
  { value: 'captain', label: 'Captain' },
  { value: 'lieutenant', label: 'Lieutenant' },
  { value: 'warrant_officer_1', label: 'Warrant Officer I' },
  { value: 'warrant_officer_2', label: 'Warrant Officer II' },
  { value: 'seniorsergeant', label: 'Senior Sergeant' },
  { value: 'sergeant', label: 'Sergeant' },
  { value: 'corporal', label: 'Corporal' },
  { value: 'lance_corporal', label: 'Lance Corporal' },
  { value: 'private', label: 'Private' },
]

export default function AddUser({ onSuccess } = {}) {
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    svc_number: '',
    phone_number: '',
    role: 'student',
    rank: '',
    class_obj: '',
    password: '',
    password2: '',
    is_active: true,
  })
  const [classes, setClasses] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(false)
  const [classesError, setClassesError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [] })
  const [touched, setTouched] = useState({})
  const navigate = useNavigate()
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    try {
      if (toast?.error) return toast.error(msg)
      if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    } catch {
      // ignore toast errors
    }
    // developer fallback
  }

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

  // Validate a single field and return error message or empty string
  function validateField(name, value, formData = form) {
    switch (name) {
      case 'username':
        if (!value) return 'Username is required'
        if (value.length < 3) return 'Username must be at least 3 characters'
        if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Username can only contain letters, numbers, and underscores'
        return ''
      case 'first_name':
        if (!value) return 'First name is required'
        if (value.length < 2) return 'First name must be at least 2 characters'
        if (!/^[a-zA-Z\s'-]+$/.test(value)) return 'First name can only contain letters, spaces, hyphens, and apostrophes'
        return ''
      case 'last_name':
        if (!value) return 'Last name is required'
        if (value.length < 2) return 'Last name must be at least 2 characters'
        if (!/^[a-zA-Z\s'-]+$/.test(value)) return 'Last name can only contain letters, spaces, hyphens, and apostrophes'
        return ''
      case 'email':
        if (!value) return 'Email address is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address (e.g., name@example.com)'
        return ''
      case 'svc_number':
        if (!value) return 'Service number is required'
        if (!/^\d+$/.test(value)) return 'Service number must contain only numbers'
        if (value.length > 7) return 'Service number cannot exceed 7 digits'
        return ''
      case 'phone_number':
        if (value && !/^\d{7,15}$/.test(value)) return 'Phone number must be 7-15 digits'
        return ''
      case 'rank':
        if (!value) return 'Please select a rank from the list'
        return ''
      case 'class_obj':
        if (formData.role === 'student' && !value) return 'Students must be assigned to a class'
        return ''
      case 'password': {
        if (!value) return 'Password is required'
        if (value.length < 8) return 'Password must be at least 8 characters long'
        const strength = checkPasswordStrength(value)
        if (strength.score < 2) return 'Password is too weak. Include uppercase, lowercase, numbers, and special characters'
        return ''
      }
      case 'password2':
        if (!value) return 'Please confirm your password'
        if (formData.password && value !== formData.password) return 'Passwords do not match'
        return ''
      default:
        return ''
    }
  }

  // Handle field blur for real-time validation
  function onBlur(e) {
    const { name, value } = e.target
    setTouched((t) => ({ ...t, [name]: true }))
    const error = validateField(name, value)
    setFieldErrors((prev) => ({ ...prev, [name]: error }))
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target
    let newValue = type === 'checkbox' ? checked : value

    // Only allow numeric input for service number (max 7 digits)
    if (name === 'svc_number') {
      newValue = value.replace(/\D/g, '').slice(0, 7)
    }

    // Only allow numeric input for phone number
    if (name === 'phone_number') {
      newValue = value.replace(/\D/g, '')
    }

    setForm((f) => {
      // if role changes away from student, clear class_obj
      if (name === 'role' && value !== 'student') {
        return { ...f, [name]: newValue, class_obj: '' }
      }
      return { ...f, [name]: newValue }
    })

    // Update password strength in real-time
    if (name === 'password') {
      setPasswordStrength(checkPasswordStrength(value))
    }

    // Clear error when user starts typing (if field was touched)
    if (touched[name]) {
      const error = validateField(name, newValue, { ...form, [name]: newValue })
      setFieldErrors((prev) => ({ ...prev, [name]: error }))
    }

    // Re-validate password2 when password changes
    if (name === 'password' && touched.password2 && form.password2) {
      const pw2Error = value && form.password2 !== value ? 'Passwords do not match' : ''
      setFieldErrors((prev) => ({ ...prev, password2: pw2Error }))
    }
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoadingClasses(true)
      try {
        // Request only active classes from the backend
        const data = await api.getAllClasses('is_active=true')
        if (!mounted) return
        // expect array
        setClasses(Array.isArray(data) ? data : [])
      } catch {
        // show empty list on error
        setClasses([])
      } finally {
        if (mounted) setLoadingClasses(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    // Field-specific validation with descriptive messages
    const fErrs = {}
    const fieldsToValidate = ['username', 'first_name', 'last_name', 'email', 'svc_number', 'phone_number', 'rank', 'class_obj', 'password', 'password2']

    for (const field of fieldsToValidate) {
      const error = validateField(field, form[field], form)
      if (error) {
        fErrs[field] = error
      }
    }

    if (Object.keys(fErrs).length) {
      setFieldErrors(fErrs)
      const first = Object.keys(fErrs)[0]
      const errorCount = Object.keys(fErrs).length
      setError(`Please fix ${errorCount} ${errorCount === 1 ? 'error' : 'errors'} before submitting`)
      // focus first invalid input if present
      const el = typeof document !== 'undefined' && document.querySelector ? document.querySelector(`[name="${first}"]`) : null
      if (el && typeof el.focus === 'function') el.focus()
      return
    }

    setLoading(true)
    try {
      const payload = { ...form }
      // backend expects password and password2 fields; api.addUser will send the body as JSON
      await api.addUser(payload)
      // show toast, clear form, notify parent
      try {
        toast?.showToast('User created successfully', { type: 'success' })
  } catch { /* ignore toast errors */ }
      // clear form
      setForm({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        svc_number: '',
        phone_number: '',
        role: 'student',
        rank: '',
        class_obj: '',
        password: '',
        password2: '',
        is_active: true,
      })
      if (typeof onSuccess === 'function') onSuccess()
      // if no parent handler, navigate back to dashboard
      if (!onSuccess) navigate('/dashboard')
    } catch (err) {
      // API may return structured errors
      const data = err?.data || null
      if (data && typeof data === 'object') {
        // map field errors with user-friendly messages
        const fErrs = {}
        const fieldLabels = {
          username: 'Username',
          email: 'Email',
          svc_number: 'Service number',
          first_name: 'First name',
          last_name: 'Last name',
          password: 'Password',
          password2: 'Confirm password',
          rank: 'Rank',
          class_obj: 'Class',
          phone_number: 'Phone number',
          role: 'Role',
        }

        for (const k of Object.keys(data)) {
          const rawMsg = Array.isArray(data[k]) ? data[k].join(' ') : String(data[k])
          // Make common backend messages more user-friendly
          let friendlyMsg = rawMsg
            .replace(/this field/gi, fieldLabels[k] || 'This field')
            .replace(/a user with this username already exists/gi, 'This username is already taken. Please choose another')
            .replace(/a user with this email already exists/gi, 'An account with this email already exists')
            .replace(/a user with this svc_number already exists/gi, 'This service number is already registered')
            .replace(/enter a valid email/gi, 'Please enter a valid email address')
            .replace(/this password is too common/gi, 'This password is too common. Please choose a stronger one')
            .replace(/this password is entirely numeric/gi, 'Password cannot be all numbers')
          fErrs[k] = friendlyMsg
        }
        setFieldErrors(fErrs)

        if (data.detail || data.error) {
          setError(data.detail || data.error)
          reportError(data.detail || data.error)
        } else if (data.non_field_errors) {
          const nonFieldMsg = Array.isArray(data.non_field_errors) 
            ? data.non_field_errors.join(' ') 
            : String(data.non_field_errors)
          setError(nonFieldMsg)
          reportError(nonFieldMsg)
        } else {
          const errorCount = Object.keys(fErrs).length
          const msg = `Please fix ${errorCount} ${errorCount === 1 ? 'error' : 'errors'} to continue`
          setError(msg)
          reportError(msg)
        }
      } else {
        // Handle network or unknown errors with friendly messages
        let msg = err?.message || 'Failed to create user'
        if (msg.includes('Network') || msg.includes('fetch')) {
          msg = 'Unable to connect to the server. Please check your internet connection and try again.'
        } else if (msg.includes('500') || msg.includes('Internal Server')) {
          msg = 'Something went wrong on our end. Please try again later or contact support.'
        } else if (msg.includes('401') || msg.includes('Unauthorized')) {
          msg = 'Your session has expired. Please log in again.'
        } else if (msg.includes('403') || msg.includes('Forbidden')) {
          msg = 'You do not have permission to create users.'
        }
        setError(msg)
        reportError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Add user</h1>
              <p className="text-sm text-gray-500 mt-1">Create a new account for staff or students.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input name="username" value={form.username} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.username ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.username && <div className="text-xs text-rose-600 mt-1">{fieldErrors.username}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Service number</label>
                <input name="svc_number" value={form.svc_number} onChange={onChange} onBlur={onBlur} maxLength={7} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.svc_number ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.svc_number && <div className="text-xs text-rose-600 mt-1">{fieldErrors.svc_number}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Rank</label>
                <select
                  name="rank"
                  value={form.rank}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    fieldErrors.rank ? 'border-rose-500' : 'border-neutral-200'
                  }`}
                >
                  <option value="" disabled>-- Select a rank --</option>
                  <option value="general">General</option>
                  <option value="lieutenant colonel">Lieutenant Colonel</option>
                  <option value="major">Major</option>
                  <option value="captain">Captain</option>
                  <option value="lieutenant">Lieutenant</option>
                  <option value="warrant_officer">Warrant Officer I</option>
                  <option value="warrant_officer">Warrant Officer II</option>
                  <option value="seniorsergeant">Senior Sergeant</option>
                  <option value="sergeant">Sergeant</option>
                  <option value="corporal">Corporal</option>
                  <option value="lance_corporal">Lance Corporal</option>
                  <option value="private">Private</option>
                </select>
                {fieldErrors.rank && <div className="text-xs text-rose-600 mt-1">{fieldErrors.rank}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">First name</label>
                <input name="first_name" value={form.first_name} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.first_name ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.first_name && <div className="text-xs text-rose-600 mt-1">{fieldErrors.first_name}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Last name</label>
                <input name="last_name" value={form.last_name} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.last_name ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.last_name && <div className="text-xs text-rose-600 mt-1">{fieldErrors.last_name}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input name="email" type="email" value={form.email} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.email ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.email && <div className="text-xs text-rose-600 mt-1">{fieldErrors.email}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Phone number</label>
                <input name="phone_number" value={form.phone_number} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.phone_number ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.phone_number && <div className="text-xs text-rose-600 mt-1">{fieldErrors.phone_number}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select name="role" value={form.role} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.role ? 'border-rose-500' : 'border-neutral-200'}`}>
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {fieldErrors.role && <div className="text-xs text-rose-600 mt-1">{fieldErrors.role}</div>}
              </div>

              {form.role === 'student' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Class</label>
                  <div className="relative">
                    <select name="class_obj" value={form.class_obj} onChange={onChange} onBlur={onBlur} required={form.role === 'student'} disabled={loadingClasses} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100 disabled:cursor-not-allowed ${fieldErrors.class_obj ? 'border-rose-500' : 'border-neutral-200'}`}>
                        <option value="" disabled>-- Select a class --</option>
                        {loadingClasses ? (
                          <option disabled>Loading classes...</option>
                        ) : (
                          // show a helpful disabled option when there are no active classes
                          classes.length === 0 ? (
                            <option disabled>No active classes available</option>
                          ) : (
                            classes.map(c => (
                              <option key={c.id} value={c.id}>{`${c.name}${c.class_code ? ` (${c.class_code})` : ''}${c.course_name ? ` — ${c.course_name}` : ''}`}</option>
                            ))
                          )
                        )}
                    </select>
                    {loadingClasses && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 animate-spin text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                      </div>
                    )}
                  </div>
                  {fieldErrors.class_obj && <div className="text-xs text-rose-600 mt-1">{fieldErrors.class_obj}</div>}
                </div>
              )}

              <div className="flex items-center">
                <label className="inline-flex items-center">
                  <input type="checkbox" name="is_active" checked={form.is_active} onChange={onChange} className="mr-2" />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Password Setup</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input name="password" type="password" value={form.password} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.password ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {fieldErrors.password && <div className="text-xs text-rose-600 mt-1">{fieldErrors.password}</div>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                  <input name="password2" type="password" value={form.password2} onChange={onChange} onBlur={onBlur} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.password2 ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {fieldErrors.password2 && <div className="text-xs text-rose-600 mt-1">{fieldErrors.password2}</div>}
                </div>
              </div>

              {form.password && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">Password strength:</span>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          passwordStrength.score === 0 ? 'w-0 bg-gray-300' :
                          passwordStrength.score === 1 ? 'w-1/4 bg-red-500' :
                          passwordStrength.score === 2 ? 'w-2/4 bg-yellow-500' :
                          passwordStrength.score === 3 ? 'w-3/4 bg-blue-500' :
                          'w-full bg-green-500'
                        }`}
                      />
                    </div>
                    <span className={`text-xs font-medium ${
                      passwordStrength.score === 0 ? 'text-gray-500' :
                      passwordStrength.score === 1 ? 'text-red-600' :
                      passwordStrength.score === 2 ? 'text-yellow-600' :
                      passwordStrength.score === 3 ? 'text-blue-600' :
                      'text-green-600'
                    }`}>
                      {passwordStrength.score === 0 ? 'Too weak' :
                       passwordStrength.score === 1 ? 'Weak' :
                       passwordStrength.score === 2 ? 'Fair' :
                       passwordStrength.score === 3 ? 'Good' :
                       'Strong'}
                    </span>
                  </div>
                  <ul className="text-xs space-y-1">
                    {passwordStrength.feedback.map((item, idx) => (
                      <li key={idx} className={`flex items-center gap-2 ${item.met ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{item.met ? '✓' : '○'}</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded p-2">{error}</div>}

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
              <button disabled={loading || (form.role === 'student' && !form.class_obj)} type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                {loading ? (
                  <svg className="w-4 h-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                ) : null}
                {loading ? 'Saving...' : 'Create user'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
