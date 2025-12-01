import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../lib/api'
import useToast from '../hooks/useToast'

const roles = [
  { value: 'admin', label: 'Admin' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'student', label: 'Student' },
  { value: 'commandant', label: 'Commandant' },
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
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
    console.error(msg)
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm((f) => {
      // if role changes away from student, clear class_obj
      if (name === 'role' && value !== 'student') {
        return { ...f, [name]: type === 'checkbox' ? checked : value, class_obj: '' }
      }
      return { ...f, [name]: type === 'checkbox' ? checked : value }
    })
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoadingClasses(true)
      try {
        // Request only active classes from the backend
        const data = await api.getClasses('is_active=true')
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

    // basic client-side checks — build fieldErrors so missing fields are highlighted
    const required = ['username', 'first_name', 'last_name', 'email', 'svc_number', 'password', 'password2']
    const fErrs = {}
    for (const k of required) {
      if (!form[k]) fErrs[k] = 'This field is required'
    }
    // require class for students
    if (form.role === 'student' && !form.class_obj) {
      fErrs.class_obj = 'Please select a class'
    }
    // password match
    if (form.password && form.password2 && form.password !== form.password2) {
      fErrs.password2 = 'Passwords do not match'
    }

    if (Object.keys(fErrs).length) {
      setFieldErrors(fErrs)
      const first = Object.keys(fErrs)[0]
      setError('Please correct the highlighted fields')
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
        // map field errors
        const fErrs = {}
        for (const k of Object.keys(data)) {
          fErrs[k] = Array.isArray(data[k]) ? data[k].join(' ') : String(data[k])
        }
        setFieldErrors(fErrs)
        if (data.detail || data.error) {
          setError(data.detail || data.error)
          reportError(data.detail || data.error)
        } else {
          setError('There were validation errors')
          reportError('There were validation errors')
        }
      } else {
        const msg = err?.message || 'Failed to create user'
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
                <input name="username" value={form.username} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.username ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.username && <div className="text-xs text-rose-600 mt-1">{fieldErrors.username}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Service number</label>
                <input name="svc_number" value={form.svc_number} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.svc_number ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.svc_number && <div className="text-xs text-rose-600 mt-1">{fieldErrors.svc_number}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Rank</label>
                <select name="rank" value={form.rank} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.rank ? 'border-rose-500' : 'border-neutral-200'}`}>
                  <option value="">Unassigned</option>
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
                <input name="first_name" value={form.first_name} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.first_name ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.first_name && <div className="text-xs text-rose-600 mt-1">{fieldErrors.first_name}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Last name</label>
                <input name="last_name" value={form.last_name} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.last_name ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.last_name && <div className="text-xs text-rose-600 mt-1">{fieldErrors.last_name}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input name="email" type="email" value={form.email} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.email ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.email && <div className="text-xs text-rose-600 mt-1">{fieldErrors.email}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Phone number</label>
                <input name="phone_number" value={form.phone_number} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.phone_number ? 'border-rose-500' : 'border-neutral-200'}`} />
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
                  <select name="class_obj" value={form.class_obj} onChange={onChange} required={form.role === 'student'} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.class_obj ? 'border-rose-500' : 'border-neutral-200'}`}>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input name="password" type="password" value={form.password} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.password ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.password && <div className="text-xs text-rose-600 mt-1">{fieldErrors.password}</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm password</label>
                <input name="password2" type="password" value={form.password2} onChange={onChange} className={`mt-1 w-full rounded-md border px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors.password2 ? 'border-rose-500' : 'border-neutral-200'}`} />
                {fieldErrors.password2 && <div className="text-xs text-rose-600 mt-1">{fieldErrors.password2}</div>}
              </div>
            </div>

            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded p-2">{error}</div>}

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm">Cancel</button>
              <button disabled={loading || (form.role === 'student' && !form.class_obj)} type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60">
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
