import { useState, useEffect, useCallback } from 'react'
import {
  Users, UserPlus, Search, ChevronLeft, ChevronRight,
  Shield, X, Eye, EyeOff, Star, Lock, KeyRound, Check, AlertCircle,
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'

// Chief of Training is a senior appointment — only Major and above are offered,
// ordered by seniority. Values must match User.RANK_CHOICES on the backend.
const RANK_CHOICES = [
  { value: 'general', label: 'General' },
  { value: 'lieutenant_general', label: 'Lieutenant General' },
  { value: 'major_general', label: 'Major General' },
  { value: 'brigadier', label: 'Brigadier' },
  { value: 'colonel', label: 'Colonel' },
  { value: 'lieutenant_colonel', label: 'Lieutenant Colonel' },
  { value: 'major', label: 'Major' },
]
const RANK_LABELS = Object.fromEntries(RANK_CHOICES.map((r) => [r.value, r.label]))

function rankLabel(value) {
  if (!value) return ''
  return RANK_LABELS[value] || value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Remove script/HTML tags and control characters from free-text input.
function sanitizeInput(value) {
  if (typeof value !== 'string') return value
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(controlChars, '')
}

function checkPasswordStrength(password) {
  const feedback = []
  let score = 0
  if (password.length >= 8) { score += 1; feedback.push({ met: true, text: 'At least 8 characters' }) }
  else feedback.push({ met: false, text: 'At least 8 characters' })
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) { score += 1; feedback.push({ met: true, text: 'Contains uppercase and lowercase' }) }
  else feedback.push({ met: false, text: 'Contains uppercase and lowercase' })
  if (/\d/.test(password)) { score += 1; feedback.push({ met: true, text: 'Contains numbers' }) }
  else feedback.push({ met: false, text: 'Contains numbers' })
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) { score += 1; feedback.push({ met: true, text: 'Contains special characters' }) }
  else feedback.push({ met: false, text: 'Contains special characters' })
  return { score, feedback }
}

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  svc_number: '',
  rank: '',
  email: '',
  phone_number: '',
  password: '',
  password2: '',
}

const VALIDATED_FIELDS = ['first_name', 'last_name', 'svc_number', 'rank', 'email', 'phone_number', 'password', 'password2']
const EDIT_FIELDS = ['first_name', 'last_name', 'svc_number', 'email', 'phone_number', 'rank']

export default function COTOfficersPage() {
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }
  const reportSuccess = (msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }

  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [deleteModal, setDeleteModal] = useState({ open: false, officer: null })

  // Create modal
  const [createModal, setCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [formError, setFormError] = useState(null)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [] })

  // Edit modal
  const [editModal, setEditModal] = useState({ open: false, officer: null })
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', svc_number: '', email: '', phone_number: '', rank: '' })
  const [editErrors, setEditErrors] = useState({})
  const [editTouched, setEditTouched] = useState({})
  const [editError, setEditError] = useState(null)
  const [editSaving, setEditSaving] = useState(false)

  // Reset-password modal (separate, opened from the edit modal)
  const [resetPasswordUser, setResetPasswordUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetStrength, setResetStrength] = useState({ score: 0, feedback: [] })
  const [resetSaving, setResetSaving] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const fetchOfficers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage)
      params.set('page_size', 10)
      params.set('role', 'chief_of_training')
      if (searchTerm) params.set('search', searchTerm)
      const data = await api.getUsers(params.toString())
      setOfficers(data?.results || [])
      setTotalCount(data?.count || 0)
      setTotalPages(Math.ceil((data?.count || 0) / 10))
    } catch (err) {
      console.error('Failed to fetch COT officers:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm])

  useEffect(() => {
    fetchOfficers()
  }, [fetchOfficers])

  const handleDelete = async () => {
    if (!deleteModal.officer) return
    try {
      await api.deleteUser(deleteModal.officer.id)
      setDeleteModal({ open: false, officer: null })
      fetchOfficers()
    } catch (err) {
      console.error('Failed to delete officer:', err)
    }
  }

  function validateField(name, value, formData = form) {
    switch (name) {
      case 'first_name':
        if (!value) return 'First name is required'
        if (value.length < 2) return 'First name must be at least 2 characters'
        if (value.length > 50) return 'First name cannot exceed 50 characters'
        if (!/^[a-zA-Z\s'-]+$/.test(value)) return "First name can only contain letters, spaces, hyphens, and apostrophes"
        return ''
      case 'last_name':
        if (!value) return 'Last name is required'
        if (value.length < 2) return 'Last name must be at least 2 characters'
        if (value.length > 50) return 'Last name cannot exceed 50 characters'
        if (!/^[a-zA-Z\s'-]+$/.test(value)) return "Last name can only contain letters, spaces, hyphens, and apostrophes"
        return ''
      case 'svc_number':
        if (!value) return 'Service number is required'
        if (!/^\d+$/.test(value)) return 'Service number must contain only numbers'
        if (value.length > 7) return 'Service number cannot exceed 7 digits'
        return ''
      case 'rank':
        if (!value) return 'Please select a rank from the list'
        return ''
      case 'email':
        if (!value) return 'Email address is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address (e.g., name@example.com)'
        return ''
      case 'phone_number':
        if (!value) return 'Phone number is required'
        if (!/^\d{7,15}$/.test(value)) return 'Phone number must be 7-15 digits'
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

  // ── Create ────────────────────────────────────────────────────────────────
  const resetCreateForm = () => {
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setTouched({})
    setFormError(null)
    setPasswordStrength({ score: 0, feedback: [] })
  }

  const closeCreate = () => {
    setCreateModal(false)
    resetCreateForm()
  }

  function onBlur(e) {
    const { name, value } = e.target
    setTouched((t) => ({ ...t, [name]: true }))
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
  }

  function onChange(e) {
    const { name, value } = e.target
    let newValue = value
    if (name === 'svc_number') newValue = value.replace(/\D/g, '').slice(0, 7)
    else if (name === 'phone_number') newValue = value.replace(/\D/g, '')
    else if (name === 'first_name' || name === 'last_name') newValue = sanitizeInput(value).slice(0, 50)

    setForm((f) => ({ ...f, [name]: newValue }))
    if (name === 'password') setPasswordStrength(checkPasswordStrength(newValue))
    if (touched[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, newValue, { ...form, [name]: newValue }) }))
    }
    if (name === 'password' && touched.password2 && form.password2) {
      setFieldErrors((prev) => ({ ...prev, password2: newValue !== form.password2 ? 'Passwords do not match' : '' }))
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError(null)
    const fErrs = {}
    for (const field of VALIDATED_FIELDS) {
      const err = validateField(field, form[field], form)
      if (err) fErrs[field] = err
    }
    if (Object.keys(fErrs).length) {
      setFieldErrors(fErrs)
      setTouched(Object.fromEntries(VALIDATED_FIELDS.map((f) => [f, true])))
      const count = Object.keys(fErrs).length
      setFormError(`Please fix ${count} ${count === 1 ? 'error' : 'errors'} before submitting`)
      return
    }
    setSaving(true)
    try {
      await api.addUser({
        username: form.svc_number,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
        svc_number: form.svc_number,
        rank: form.rank,
        password: form.password,
        password2: form.password2,
        role: 'chief_of_training',
        is_active: true,
      })
      reportSuccess('COT officer created successfully')
      closeCreate()
      fetchOfficers()
    } catch (err) {
      console.error('Failed to create COT officer:', err)
      if (err.data && typeof err.data === 'object') {
        const backendErrors = {}
        Object.entries(err.data).forEach(([key, value]) => {
          backendErrors[key] = Array.isArray(value) ? value[0] : String(value)
        })
        setFieldErrors(backendErrors)
        setFormError(err.data.detail || err.data.error || 'Please correct the highlighted fields.')
      } else {
        setFormError(err?.message || 'Failed to create COT officer')
      }
    } finally {
      setSaving(false)
    }
  }

  const inputClass = (field) =>
    `w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${fieldErrors[field] ? 'border-red-500' : 'border-neutral-200'}`

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (officer) => {
    setEditForm({
      first_name: officer.first_name || '',
      last_name: officer.last_name || '',
      svc_number: officer.svc_number || officer.username || '',
      email: officer.email || '',
      phone_number: officer.phone_number || '',
      rank: officer.rank || '',
    })
    setEditErrors({})
    setEditTouched({})
    setEditError(null)
    setEditModal({ open: true, officer })
  }

  const closeEdit = () => setEditModal({ open: false, officer: null })

  function onEditChange(e) {
    const { name, value } = e.target
    let v = value
    if (name === 'svc_number') v = value.replace(/\D/g, '').slice(0, 7)
    else if (name === 'phone_number') v = value.replace(/\D/g, '')
    else if (name === 'first_name' || name === 'last_name') v = sanitizeInput(value).slice(0, 50)
    setEditForm((f) => ({ ...f, [name]: v }))
    if (editTouched[name]) setEditErrors((p) => ({ ...p, [name]: validateField(name, v, { ...editForm, [name]: v }) }))
  }

  function onEditBlur(e) {
    const { name, value } = e.target
    setEditTouched((t) => ({ ...t, [name]: true }))
    setEditErrors((p) => ({ ...p, [name]: validateField(name, value) }))
  }

  const editInputClass = (field) =>
    `w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editErrors[field] ? 'border-red-500' : 'border-neutral-200'}`

  const handleUpdate = async (e) => {
    e.preventDefault()
    setEditError(null)
    const errs = {}
    for (const f of EDIT_FIELDS) {
      const er = validateField(f, editForm[f], editForm)
      if (er) errs[f] = er
    }
    if (Object.keys(errs).length) {
      setEditErrors(errs)
      setEditTouched(Object.fromEntries(EDIT_FIELDS.map((f) => [f, true])))
      setEditError('Please fix the highlighted fields.')
      return
    }
    setEditSaving(true)
    try {
      await api.partialUpdateUser(editModal.officer.id, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        svc_number: editForm.svc_number,
        email: editForm.email,
        phone_number: editForm.phone_number,
        rank: editForm.rank,
      })
      reportSuccess('Officer updated successfully')
      closeEdit()
      fetchOfficers()
    } catch (err) {
      console.error('Failed to update COT officer:', err)
      if (err.data && typeof err.data === 'object') {
        const be = {}
        Object.entries(err.data).forEach(([k, v]) => { be[k] = Array.isArray(v) ? v[0] : String(v) })
        setEditErrors(be)
        setEditError(err.data.detail || err.data.error || 'Please correct the highlighted fields.')
      } else {
        setEditError(err?.message || 'Failed to update officer')
      }
    } finally {
      setEditSaving(false)
    }
  }

  // ── Reset password (separate modal) ────────────────────────────────────────
  const openResetPassword = (officer) => {
    setResetPasswordUser(officer)
    setNewPassword('')
    setConfirmPassword('')
    setResetStrength({ score: 0, feedback: [] })
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const closeResetPassword = () => setResetPasswordUser(null)

  function handleNewPasswordChange(e) {
    const v = e.target.value
    setNewPassword(v)
    setResetStrength(checkPasswordStrength(v))
  }

  async function submitResetPassword(e) {
    e.preventDefault()
    if (!resetPasswordUser) return
    if (newPassword !== confirmPassword) return
    setResetSaving(true)
    try {
      await api.resetUserPassword(resetPasswordUser.id, newPassword)
      reportSuccess('Password reset successfully')
      closeResetPassword()
    } catch (err) {
      console.error('Failed to reset password:', err)
      const raw = err?.data?.error
      reportError('Failed to reset password: ' + (Array.isArray(raw) ? raw.join(' ') : (raw || err?.message || 'Unknown error')))
    } finally {
      setResetSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Chief of Training Officers</h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            Global role — no school affiliation. Can view all schools' submitted reports.
          </p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add COT Officer
        </button>
      </header>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name, email, or service number..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : officers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
            <Users className="w-12 h-12 mb-4 text-neutral-300" />
            <p>{searchTerm ? 'No officers match your search' : 'No COT Officers added yet'}</p>
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="mt-2 text-indigo-600 hover:text-indigo-700">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Officer</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Contact</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Added</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {officers.map((officer) => (
                    <tr key={officer.id} className="hover:bg-neutral-50 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                            {(officer.first_name || officer.username || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-black">
                              {officer.rank ? `${rankLabel(officer.rank)} ` : ''}{officer.first_name} {officer.last_name}
                            </p>
                            <p className="text-sm text-neutral-500">SVC: {officer.svc_number || officer.username || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-neutral-700">{officer.email || '—'}</p>
                        {officer.phone_number && (
                          <p className="text-xs text-neutral-400">{officer.phone_number}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                          <Star className="w-3 h-3" />
                          Chief of Training
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-500">
                        {officer.created_at ? new Date(officer.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(officer)}
                            className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition whitespace-nowrap"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteModal({ open: true, officer })}
                            className="px-3 py-1.5 rounded-md bg-red-600 text-xs text-white hover:bg-red-700 transition whitespace-nowrap"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-neutral-200 gap-3">
                <p className="text-sm text-neutral-600">
                  Showing <span className="font-semibold text-black">{(currentPage - 1) * 10 + 1}</span>–
                  <span className="font-semibold text-black">{Math.min(currentPage * 10, totalCount)}</span> of{' '}
                  <span className="font-semibold text-black">{totalCount}</span> officers
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
                  >
                    <ChevronLeft className="w-4 h-4 text-neutral-600" />
                  </button>
                  <span className="text-sm text-neutral-600">
                    Page <span className="font-semibold text-black">{currentPage}</span> of{' '}
                    <span className="font-semibold text-black">{totalPages}</span>
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative bg-white rounded-xl p-5 max-w-lg w-full shadow-2xl ring-1 ring-black/5 z-10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-black">Add COT Officer</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Global role — no school required</p>
              </div>
              <button onClick={closeCreate} className="p-2 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3" noValidate>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">First Name *</label>
                  <input type="text" name="first_name" value={form.first_name} onChange={onChange} onBlur={onBlur} maxLength={50} className={inputClass('first_name')} />
                  {fieldErrors.first_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Last Name *</label>
                  <input type="text" name="last_name" value={form.last_name} onChange={onChange} onBlur={onBlur} maxLength={50} className={inputClass('last_name')} />
                  {fieldErrors.last_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.last_name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Service Number *</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" name="svc_number" maxLength={7}
                    value={form.svc_number} onChange={onChange} onBlur={onBlur} placeholder="e.g.. 1234567"
                    className={`${inputClass('svc_number')} font-mono`}
                  />
                  {fieldErrors.svc_number
                    ? <p className="text-red-500 text-xs mt-1">{fieldErrors.svc_number}</p>
                    : <p className="text-neutral-400 text-xs mt-0.5">Numbers only — used for login</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Rank *</label>
                  <select name="rank" value={form.rank} onChange={onChange} onBlur={onBlur} className={inputClass('rank')}>
                    <option value="" disabled>— Select rank —</option>
                    {RANK_CHOICES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {fieldErrors.rank && <p className="text-red-500 text-xs mt-1">{fieldErrors.rank}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Email *</label>
                  <input type="email" name="email" value={form.email} onChange={onChange} onBlur={onBlur} className={inputClass('email')} />
                  {fieldErrors.email && <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Phone *</label>
                  <input type="tel" inputMode="numeric" name="phone_number" value={form.phone_number} onChange={onChange} onBlur={onBlur} className={inputClass('phone_number')} />
                  {fieldErrors.phone_number && <p className="text-red-500 text-xs mt-1">{fieldErrors.phone_number}</p>}
                </div>
              </div>

              {/* Role — fixed for this page */}
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Role</label>
                <div className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-50 text-neutral-700 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <Star className="w-4 h-4 text-amber-500" />
                    Chief of Training
                  </span>
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} name="password"
                    value={form.password} onChange={onChange} onBlur={onBlur}
                    className={`${inputClass('password')} pr-10`}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'} name="password2"
                    value={form.password2} onChange={onChange} onBlur={onBlur}
                    className={`${inputClass('password2')} pr-10`}
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password2 && <p className="text-red-500 text-xs mt-1">{fieldErrors.password2}</p>}
              </div>

              {/* Password strength */}
              {form.password && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-600">Strength:</span>
                    <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${
                        passwordStrength.score === 0 ? 'w-0 bg-neutral-300' :
                        passwordStrength.score === 1 ? 'w-1/4 bg-red-500' :
                        passwordStrength.score === 2 ? 'w-2/4 bg-yellow-500' :
                        passwordStrength.score === 3 ? 'w-3/4 bg-blue-500' : 'w-full bg-green-500'
                      }`} />
                    </div>
                    <span className={`text-xs font-medium ${
                      passwordStrength.score <= 1 ? 'text-red-600' :
                      passwordStrength.score === 2 ? 'text-yellow-600' :
                      passwordStrength.score === 3 ? 'text-blue-600' : 'text-green-600'
                    }`}>
                      {passwordStrength.score <= 1 ? 'Weak' : passwordStrength.score === 2 ? 'Fair' : passwordStrength.score === 3 ? 'Good' : 'Strong'}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {passwordStrength.feedback.map((item, idx) => (
                      <li key={idx} className={`flex items-center gap-1.5 ${item.met ? 'text-green-600' : 'text-neutral-400'}`}>
                        <span>{item.met ? '✓' : '○'}</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Info banner */}
              {/* <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <Shield className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                <span>
                  This officer will have read-only access to submitted reports from <strong>all schools</strong>.
                  They are not assigned to any school.
                </span>
              </div> */}

              {formError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">{formError}</div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button type="button" onClick={closeCreate} className="px-4 py-2 text-neutral-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50">
                  {saving ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating...</>
                  ) : (
                    <><UserPlus className="w-4 h-4" />Add Officer</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative bg-white rounded-xl p-5 max-w-lg w-full shadow-2xl ring-1 ring-black/5 z-10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-black">Edit COT Officer</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {rankLabel(editModal.officer?.rank)} {editModal.officer?.first_name} {editModal.officer?.last_name}
                  {' · '}SVC: {editModal.officer?.svc_number || editModal.officer?.username || '—'}
                </p>
              </div>
              <button onClick={closeEdit} className="p-2 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3" noValidate>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">First Name *</label>
                  <input type="text" name="first_name" value={editForm.first_name} onChange={onEditChange} onBlur={onEditBlur} maxLength={50} className={editInputClass('first_name')} />
                  {editErrors.first_name && <p className="text-red-500 text-xs mt-1">{editErrors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Last Name *</label>
                  <input type="text" name="last_name" value={editForm.last_name} onChange={onEditChange} onBlur={onEditBlur} maxLength={50} className={editInputClass('last_name')} />
                  {editErrors.last_name && <p className="text-red-500 text-xs mt-1">{editErrors.last_name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Service Number *</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" name="svc_number" maxLength={7}
                    value={editForm.svc_number} onChange={onEditChange} onBlur={onEditBlur}
                    className={`${editInputClass('svc_number')} font-mono`}
                  />
                  {editErrors.svc_number
                    ? <p className="text-red-500 text-xs mt-1">{editErrors.svc_number}</p>
                    : <p className="text-neutral-400 text-xs mt-0.5">Numbers only — used for login</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Rank *</label>
                  <select name="rank" value={editForm.rank} onChange={onEditChange} onBlur={onEditBlur} className={editInputClass('rank')}>
                    <option value="" disabled>— Select rank —</option>
                    {RANK_CHOICES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {editErrors.rank && <p className="text-red-500 text-xs mt-1">{editErrors.rank}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Email *</label>
                  <input type="email" name="email" value={editForm.email} onChange={onEditChange} onBlur={onEditBlur} className={editInputClass('email')} />
                  {editErrors.email && <p className="text-red-500 text-xs mt-1">{editErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Phone *</label>
                  <input type="tel" inputMode="numeric" name="phone_number" value={editForm.phone_number} onChange={onEditChange} onBlur={onEditBlur} className={editInputClass('phone_number')} />
                  {editErrors.phone_number && <p className="text-red-500 text-xs mt-1">{editErrors.phone_number}</p>}
                </div>
              </div>

              {/* Role — fixed */}
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Role</label>
                <div className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-50 text-neutral-700 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <Star className="w-4 h-4 text-amber-500" />
                    Chief of Training
                  </span>
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                </div>
              </div>

              {editError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">{editError}</div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => openResetPassword(editModal.officer)}
                  className="px-3 py-2 rounded-lg bg-purple-600 text-sm text-white hover:bg-purple-700 transition flex items-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4" />Reset Password
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editSaving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 transition flex items-center gap-2">
                    {editSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving...</>) : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeResetPassword} />
          <div className="relative bg-white rounded-xl p-5 max-w-md w-full shadow-2xl ring-1 ring-black/5 z-10">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-lg font-semibold text-black flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-purple-600" />
                Reset Password
              </h4>
              <button onClick={closeResetPassword} className="p-2 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <p className="text-sm text-neutral-600">
              Set a new password for{' '}
              <strong>{rankLabel(resetPasswordUser.rank)} {resetPasswordUser.first_name} {resetPasswordUser.last_name}</strong>
            </p>

            <form onSubmit={submitResetPassword} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm text-neutral-600 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={handleNewPasswordChange}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 pr-10 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    required minLength={8}
                  />
                  <button type="button" onClick={() => setShowNewPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 transition" tabIndex={-1}>
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {newPassword && (
                <div className="bg-neutral-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-neutral-500 mb-2">Password Requirements:</p>
                  {resetStrength.feedback.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      {item.met ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                      <span className={item.met ? 'text-green-700' : 'text-neutral-600'}>{item.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm text-neutral-600 mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 pr-10 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    required minLength={8}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 transition" tabIndex={-1}>
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  Passwords do not match
                </p>
              )}

              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                The officer must set a new password on their next login.
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <button type="button" onClick={closeResetPassword} className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                <button
                  type="submit"
                  disabled={resetSaving || !newPassword || !confirmPassword || newPassword !== confirmPassword || resetStrength.score < 4}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {resetSaving ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModal({ open: false, officer: null })} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full shadow-2xl ring-1 ring-black/5 z-10">
            <h3 className="text-lg font-semibold text-black">Remove COT Officer</h3>
            <p className="mt-2 text-neutral-600">
              Are you sure you want to remove{' '}
              <strong>{deleteModal.officer?.first_name} {deleteModal.officer?.last_name}</strong> as a
              Chief of Training officer? Their account will be deleted.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, officer: null })}
                className="px-4 py-2 text-neutral-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
