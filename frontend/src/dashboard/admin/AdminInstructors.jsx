import React, { useState, useMemo, useEffect } from 'react'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import { getRankSortIndex } from '../../lib/rankOrder'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Map of rank internal values to display labels
const RANK_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'lieutenant_general', label: 'Lieutenant General' },
  { value: 'major_general', label: 'Major General' },
  { value: 'brigadier', label: 'Brigadier' },
  { value: 'colonel', label: 'Colonel' },
  { value: 'lieutenant_colonel', label: 'Lieutenant Colonel' },
  { value: 'major', label: 'Major' },
  { value: 'captain', label: 'Captain' },
  { value: 'lieutenant', label: 'Lieutenant' },
  { value: 'warrant_officer_i', label: 'Warrant Officer I' },
  { value: 'warrant_officer_ii', label: 'Warrant Officer II' },
  { value: 'senior_sergeant', label: 'Senior Sergeant' },
  { value: 'sergeant', label: 'Sergeant' },
  { value: 'corporal', label: 'Corporal' },
  { value: 'lance_corporal', label: 'Lance Corporal' },
  { value: 'private', label: 'Private' },
]

// Build a reverse lookup: display label → internal value (case-insensitive)
const RANK_LABEL_TO_VALUE = {}
for (const r of RANK_OPTIONS) {
  RANK_LABEL_TO_VALUE[r.label.toLowerCase()] = r.value
  RANK_LABEL_TO_VALUE[r.value] = r.value // identity mapping for stored values
}

// Normalize a rank value from the backend to the internal value used by dropdowns.
// Handles both raw values ("warrant_officer_i") and display labels ("Warrant Officer I").
function normalizeRank(raw) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  return RANK_LABEL_TO_VALUE[key] || ''
}

// Get display label for a rank value
function getRankDisplay(raw) {
  if (!raw) return ''
  const normalized = normalizeRank(raw)
  const found = RANK_OPTIONS.find(r => r.value === normalized)
  return found ? found.label : raw
}

export default function AdminInstructors() {
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    // Error already shown via toast
  }
  const [instructors, setInstructors] = useState([])
  const [classesList, setClassesList] = useState([])
  const [subjectsList, setSubjectsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  // pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // filter state
  const [selectedClass, setSelectedClass] = useState('all')
  // edit/delete UI state
  const [editingInstructor, setEditingInstructor] = useState(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', svc_number: '', email: '', phone_number: '', unit: '', is_active: true })
  const [editLoading, setEditLoading] = useState(false)
  const [editFieldErrors, setEditFieldErrors] = useState({})
  const [editTouched, setEditTouched] = useState({})
  const [editError, setEditError] = useState('')

  // Validate a single field for edit form
  function validateEditField(name, value) {
    switch (name) {
      case 'first_name':
        if (!value) return 'First name is required'
        if (value.length < 2) return 'First name must be at least 2 characters'
        if (!/^[a-zA-Z\s'-]+$/.test(value)) return 'First name can only contain letters'
        return ''
      case 'last_name':
        if (!value) return 'Last name is required'
        if (value.length < 2) return 'Last name must be at least 2 characters'
        if (!/^[a-zA-Z\s'-]+$/.test(value)) return 'Last name can only contain letters'
        return ''
      case 'email':
        if (!value) return 'Email is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address'
        return ''
      case 'svc_number':
        if (!value) return 'Service number is required'
        if (!/^\d+$/.test(value)) return 'Service number must contain only numbers'
        if (value.length > 7) return 'Service number cannot exceed 7 digits'
        return ''
      case 'phone_number':
        if (value && !/^\d{7,15}$/.test(value)) return 'Phone number must be 7-15 digits'
        return ''
      default:
        return ''
    }
  }

  // Handle field blur for edit form validation
  function onEditBlur(e) {
    const { name, value } = e.target
    setEditTouched((t) => ({ ...t, [name]: true }))
    const error = validateEditField(name, value)
    setEditFieldErrors((prev) => ({ ...prev, [name]: error }))
  }
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Password reset modal state
  const [resetPasswordUser, setResetPasswordUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [] })
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // Toggle activation loading
  const [togglingId, setTogglingId] = useState(null)

  // Fetch ALL instructors, classes, and subjects once on mount
  useEffect(() => {
    let mounted = true
    setLoading(true)

    Promise.all([
      api.getAllInstructors(),
      api.getAllClasses(),
      api.getAllSubjects(),
    ])
      .then(([instructorsData, classesData, subjectsData]) => {
        if (!mounted) return
        const list = Array.isArray(instructorsData) ? instructorsData : []
        const normalized = list.map((it) => ({
          id: it.id,
          first_name: it.first_name,
          last_name: it.last_name,
          full_name: it.full_name || `${it.first_name || ''} ${it.last_name || ''}`.trim(),
          svc_number: it.svc_number,
          email: it.email,
          phone_number: it.phone_number,
          rank: normalizeRank(it.rank || it.rank_display),
          unit: it.unit || '',
          role: it.role,
          role_display: it.role_display,
          is_active: it.is_active,
          created_at: it.created_at,
        }))
        setInstructors(normalized)
        setClassesList(Array.isArray(classesData) ? classesData : [])
        setSubjectsList(Array.isArray(subjectsData) ? subjectsData : [])
        setError(null)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  // Filter and sort instructors client-side
  const filteredInstructors = useMemo(() => {
    let filtered = instructors

    // Filter by class
    if (selectedClass !== 'all') {
      filtered = filtered.filter((it) => {
        const instructorClasses = getInstructorClasses(it.id)
        return instructorClasses.some(c => String(c.id) === String(selectedClass))
      })
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      filtered = filtered.filter((it) =>
        (it.full_name || '').toLowerCase().includes(q) ||
        (it.email || '').toLowerCase().includes(q) ||
        (it.svc_number || '').toLowerCase().includes(q) ||
        (it.rank || '').toLowerCase().includes(q) ||
        (it.unit || '').toLowerCase().includes(q)
      )
    }

    // Sort by rank: senior first
    filtered.sort((a, b) => getRankSortIndex(a.rank) - getRankSortIndex(b.rank))
    return filtered
  }, [instructors, selectedClass, classesList, searchTerm])

  // Client-side pagination
  const totalCount = filteredInstructors.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedInstructors = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredInstructors.slice(start, start + pageSize)
  }, [filteredInstructors, page, pageSize])

  function handleDelete(it) {
    setConfirmDelete(it)
  }

  async function performDelete(it) {
    if (!it) return
    setDeletingId(it.id)
    try {
      await api.deleteUser(it.id)
      setInstructors((s) => s.filter((x) => x.id !== it.id))
      // close confirm modal and edit modal if open
      setConfirmDelete(null)
      closeEdit()
      toast?.success?.('Instructor deleted successfully') || toast?.showToast?.('Instructor deleted successfully', { type: 'success' })
    } catch (err) {
      setError(err)
      reportError('Failed to delete instructor: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  // Toggle user activation status
  async function toggleActivation(it) {
    setTogglingId(it.id)
    try {
      if (it.is_active) {
        await api.deactivateUser(it.id)
        setInstructors((s) => s.map((x) => x.id === it.id ? { ...x, is_active: false } : x))
        toast?.success?.('Instructor deactivated successfully') || toast?.showToast?.('Instructor deactivated successfully', { type: 'success' })
      } else {
        await api.activateUser(it.id)
        setInstructors((s) => s.map((x) => x.id === it.id ? { ...x, is_active: true } : x))
        toast?.success?.('Instructor activated successfully') || toast?.showToast?.('Instructor activated successfully', { type: 'success' })
      }
    } catch (err) {
      reportError('Failed to update status: ' + (err.message || String(err)))
    } finally {
      setTogglingId(null)
    }
  }

  // Password reset handlers
  // Password strength checker
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

  function openResetPassword(it) {
    setResetPasswordUser(it)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordStrength({ score: 0, feedback: [] })
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  function closeResetPassword() {
    setResetPasswordUser(null)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordStrength({ score: 0, feedback: [] })
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  function handleNewPasswordChange(e) {
    const value = e.target.value
    setNewPassword(value)
    setPasswordStrength(checkPasswordStrength(value))
  }

  async function submitResetPassword(e) {
    e.preventDefault()
    if (!resetPasswordUser) return
    if (passwordStrength.score < 4) {
      reportError('Password does not meet all requirements')
      return
    }
    if (newPassword !== confirmPassword) {
      reportError('Passwords do not match')
      return
    }
    setResetLoading(true)
    try {
      await api.resetUserPassword(resetPasswordUser.id, newPassword)
      toast?.success?.('Password reset successfully') || toast?.showToast?.('Password reset successfully', { type: 'success' })
      closeResetPassword()
    } catch (err) {
      reportError('Failed to reset password: ' + (err.message || String(err)))
    } finally {
      setResetLoading(false)
    }
  }

  function openEdit(it) {
    setEditingInstructor(it)
    setEditError('')
    setEditFieldErrors({})
    setEditTouched({})
    setEditForm({
      first_name: it.first_name || '',
      last_name: it.last_name || '',
      svc_number: it.svc_number || '',
      email: it.email || '',
      phone_number: it.phone_number || '',
      rank: normalizeRank(it.rank || it.rank_display),
      unit: it.unit || '',
      is_active: !!it.is_active,
    })
  }

  function closeEdit() {
    setEditingInstructor(null)
    setEditForm({ first_name: '', last_name: '', svc_number: '', email: '', phone_number: '', unit: '', is_active: true, rank: '' })
    setEditFieldErrors({})
    setEditTouched({})
    setEditError('')
  }

  function handleEditChange(k, v) {
    let newValue = v

    // Only allow numeric input for service number (max 7 digits)
    if (k === 'svc_number') {
      newValue = v.replace(/\D/g, '').slice(0, 7)
    }

    // Only allow numeric input for phone number
    if (k === 'phone_number') {
      newValue = v.replace(/\D/g, '')
    }

    setEditForm((f) => ({ ...f, [k]: newValue }))

    // Clear error when user types (if field was touched)
    if (editTouched[k]) {
      const error = validateEditField(k, newValue)
      setEditFieldErrors((prev) => ({ ...prev, [k]: error }))
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingInstructor) return

    // Validate all fields before submitting
    const fieldsToValidate = ['first_name', 'last_name', 'email', 'svc_number', 'phone_number']
    const errors = {}
    for (const field of fieldsToValidate) {
      const error = validateEditField(field, editForm[field])
      if (error) errors[field] = error
    }

    if (Object.keys(errors).length > 0) {
      setEditFieldErrors(errors)
      setEditTouched(fieldsToValidate.reduce((acc, f) => ({ ...acc, [f]: true }), {}))
      reportError(`Please fix ${Object.keys(errors).length} error(s) before saving`)
      return
    }

    setEditLoading(true)
    setEditError('')
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        svc_number: editForm.svc_number,
        email: editForm.email,
        phone_number: editForm.phone_number,
        rank: editForm.rank || undefined,
        unit: editForm.unit || '',
        is_active: editForm.is_active,
      }
      const updated = await api.partialUpdateUser(editingInstructor.id, payload)
      const norm = {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        full_name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        svc_number: updated.svc_number,
        email: updated.email,
        phone_number: updated.phone_number,
        rank: normalizeRank(updated.rank || updated.rank_display),
        unit: updated.unit || '',
        role: updated.role,
        role_display: updated.role_display,
        is_active: updated.is_active,
        created_at: updated.created_at,
      }
      setInstructors((s) => s.map((x) => (x.id === norm.id ? { ...x, ...norm } : x)))
      closeEdit()
      toast?.success?.('Instructor updated successfully') || toast?.showToast?.('Instructor updated successfully', { type: 'success' })
    } catch (err) {
      const data = err?.data || null
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const fieldErrors = {}
        const knownFields = ['first_name', 'last_name', 'email', 'svc_number', 'phone_number']
        let hasFieldError = false
        for (const field of knownFields) {
          if (data[field]) {
            const rawMsg = Array.isArray(data[field]) ? data[field].join(' ') : String(data[field])
            fieldErrors[field] = rawMsg
              .replace(/this field/gi, 'This field')
              .replace(/a user with this .* already exists/gi, 'This value is already taken')
            hasFieldError = true
          }
        }
        if (hasFieldError) {
          setEditFieldErrors((prev) => ({ ...prev, ...fieldErrors }))
          setEditTouched((prev) => {
            const t = { ...prev }
            for (const f of Object.keys(fieldErrors)) t[f] = true
            return t
          })
        }
        const msg = data.non_field_errors
          ? (Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : String(data.non_field_errors))
          : data.detail || (!hasFieldError ? (err.message || String(err)) : '')
        setEditError(msg || 'Please fix the highlighted errors')
      } else {
        setEditError('Failed to update instructor: ' + (err.message || String(err)))
      }
    } finally {
      setEditLoading(false)
    }
  }

  function downloadCSV() {
    // Service No first, then Rank, Name, Unit, then the rest
    const rows = [['Service No', 'Rank', 'Name', 'Unit', 'Email', 'Phone', 'Role', 'Active', 'Created']]
    filteredInstructors.forEach((it) => {
      const svc = it.svc_number || ''
      const name = it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || '')
      const email = it.email || ''
      const phone = it.phone_number || ''
      const role = it.role_display || it.role || ''
      const active = it.is_active ? 'Yes' : 'No'
      const created = it.created_at ? new Date(it.created_at).toLocaleString() : ''
      rows.push([svc, getRankDisplay(it.rank) || '', name, it.unit || '', email, phone, role, active, created])
    })

    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'instructors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function getInstructorClasses(instId) {
    if (!classesList || classesList.length === 0) return []
    return classesList.filter((c) => {
      // backend may return instructor as id or nested object
      const iid = c.instructor && typeof c.instructor === 'object' ? c.instructor.id : c.instructor
      // Only return active classes
      return String(iid) === String(instId) && c.is_active
    })
  }

  function getInstructorSubjects(instId) {
    if (!subjectsList || subjectsList.length === 0) return []
    return subjectsList.filter((s) => {
      // backend may return instructor as id or nested object
      const iid = s.instructor && typeof s.instructor === 'object' ? s.instructor.id : s.instructor
      // Only return active subjects
      return String(iid) === String(instId) && s.is_active
    })
  }

  return (
  <div className="w-full px-4 sm:px-6 lg:px-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Instructors</h2>
          <p className="text-sm text-neutral-500">Manage instructors — quick table view</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="px-3 py-2 rounded-md bg-green-600 text-sm text-white hover:bg-green-700 transition shadow-sm whitespace-nowrap">Download CSV</button>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col gap-3">
          {/* Search input and Class filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
                placeholder="Search instructors..."
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="w-full sm:w-64">
              <select
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value)
                  setPage(1)
                }}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All Classes</option>
                {classesList.filter(c => c.is_active).map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name || cls.class_code || `Class ${cls.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => setPage(1)} className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm hover:bg-indigo-700 transition whitespace-nowrap shadow-sm">
              Apply Filters
            </button>
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedClass('all')
                setPage(1)
              }}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear All
            </button>
          </div>

          {/* Filter summary badges */}
          {(searchTerm || selectedClass !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
              <span className="text-xs text-neutral-600">Active filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Search: "{searchTerm}"
                  <button onClick={() => { setSearchTerm(''); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedClass !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Class: {classesList.find(c => String(c.id) === String(selectedClass))?.name || 'Unknown'}
                  <button onClick={() => { setSelectedClass('all'); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-center">Error loading instructors: {error.message || String(error)}</div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading instructors…</div>
      ) : paginatedInstructors.length === 0 ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No instructors yet.</div>
      ) : (
        <>
          {/* Desktop Table View (large screens and above) */}
          <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto max-w-full">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Service No</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Rank</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Unit</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Phone</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Classes</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Subjects</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedInstructors.map((it) => (
                  <tr key={it.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-700">{it.svc_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{getRankDisplay(it.rank) || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                          {initials(it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || ''))}
                        </div>
                        <div className="font-medium text-black">{it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || '-')}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{it.unit || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{it.phone_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      {(() => {
                        const cls = getInstructorClasses(it.id)
                        if (!cls || cls.length === 0) return '-'
                        const labels = cls.slice(0, 3).map((c) => {
                          return c.name || c.class_obj_name || '-'
                        })
                        return (
                          <div className="flex flex-wrap gap-2">
                            {labels.map((l, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full whitespace-nowrap">{l}</span>
                            ))}
                            {cls.length > 3 ? <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full whitespace-nowrap">+{cls.length - 3} more</span> : null}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      {(() => {
                        const subjects = getInstructorSubjects(it.id)
                        if (!subjects || subjects.length === 0) return '-'
                        const labels = subjects.slice(0, 3).map((s) => {
                          return s.name || s.subject_code || '-'
                        })
                        return (
                          <div className="flex flex-wrap gap-2">
                            {labels.map((l, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full whitespace-nowrap">{l}</span>
                            ))}
                            {subjects.length > 3 ? <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full whitespace-nowrap">+{subjects.length - 3} more</span> : null}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(it)} className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition whitespace-nowrap">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet Compact View (medium screens: tablets) */}
          <div className="hidden md:block lg:hidden bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="text-left bg-neutral-50">
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">Instructor</th>
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">Contact</th>
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">Teaching</th>
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInstructors.map((it) => (
                    <tr key={it.id} className="border-t last:border-b hover:bg-neutral-50">
                      <td className="px-3 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-black text-sm truncate">{it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || '-')}</div>
                          <div className="text-xs text-neutral-500">{it.svc_number || '-'}</div>
                          {it.rank && <div className="text-xs text-neutral-600">{getRankDisplay(it.rank)}</div>}
                          {it.unit && <div className="text-xs text-neutral-400">{it.unit}</div>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm text-neutral-700">{it.phone_number || '-'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          {(() => {
                            const cls = getInstructorClasses(it.id)
                            const subjects = getInstructorSubjects(it.id)
                            return (
                              <>
                                {cls && cls.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {cls.slice(0, 2).map((c, idx) => (
                                      <span key={idx} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full whitespace-nowrap">{c.name || c.class_obj_name || '-'}</span>
                                    ))}
                                    {cls.length > 2 && <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-full">+{cls.length - 2}</span>}
                                  </div>
                                )}
                                {subjects && subjects.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {subjects.slice(0, 2).map((s, idx) => (
                                      <span key={idx} className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full whitespace-nowrap">{s.name || s.subject_code || '-'}</span>
                                    ))}
                                    {subjects.length > 2 && <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-full">+{subjects.length - 2}</span>}
                                  </div>
                                )}
                                {(!cls || cls.length === 0) && (!subjects || subjects.length === 0) && <span className="text-sm text-neutral-500">-</span>}
                              </>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-stretch gap-1.5">
                          <button onClick={() => openEdit(it)} className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition whitespace-nowrap text-center">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (small screens) */}
          <div className="md:hidden space-y-4">
            {paginatedInstructors.map((it) => (
              <div key={it.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                {/* Header with name */}
                <div className="mb-4">
                  <div className="font-medium text-black text-lg">{it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || '-')}</div>
                  <div className="text-sm text-neutral-500">{it.svc_number || '-'}</div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  {it.rank ? (
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Rank:</span>
                      <span className="text-sm text-neutral-700">{getRankDisplay(it.rank)}</span>
                    </div>
                  ) : null}

                  {it.unit ? (
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Unit:</span>
                      <span className="text-sm text-neutral-700">{it.unit}</span>
                    </div>
                  ) : null}

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Phone:</span>
                    <span className="text-sm text-neutral-700">{it.phone_number || '-'}</span>
                  </div>

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Classes:</span>
                    <div className="flex-1">
                      {(() => {
                        const cls = getInstructorClasses(it.id)
                        if (!cls || cls.length === 0) return <span className="text-sm text-neutral-700">-</span>
                        const labels = cls.slice(0, 3).map((c) => {
                          return c.name || c.class_obj_name || '-'
                        })
                        return (
                          <div className="flex flex-wrap gap-2">
                            {labels.map((l, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">{l}</span>
                            ))}
                            {cls.length > 3 ? <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full">+{cls.length - 3} more</span> : null}
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Subjects:</span>
                    <div className="flex-1">
                      {(() => {
                        const subjects = getInstructorSubjects(it.id)
                        if (!subjects || subjects.length === 0) return <span className="text-sm text-neutral-700">-</span>
                        const labels = subjects.slice(0, 3).map((s) => {
                          return s.name || s.subject_code || '-'
                        })
                        return (
                          <div className="flex flex-wrap gap-2">
                            {labels.map((l, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full">{l}</span>
                            ))}
                            {subjects.length > 3 ? <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full">+{subjects.length - 3} more</span> : null}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-neutral-100">
                    <button onClick={() => openEdit(it)} className="w-full px-3 py-2 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition">Edit</button>
                  </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Results info */}
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> instructors
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              {/* Previous button */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = Math.ceil(totalCount / pageSize)
                  const pages = []
                  const maxVisible = 5

                  if (totalPages <= maxVisible) {
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                            page === i
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }
                  } else {
                    // Always show first page
                    pages.push(
                      <button
                        key={1}
                        onClick={() => setPage(1)}
                        className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                          page === 1
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        1
                      </button>
                    )

                    // Show ellipsis if needed
                    if (page > 3) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }

                    // Show pages around current page
                    const start = Math.max(2, page - 1)
                    const end = Math.min(totalPages - 1, page + 1)
                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                            page === i
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }

                    // Show ellipsis if needed
                    if (page < totalPages - 2) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }

                    // Always show last page
                    pages.push(
                      <button
                        key={totalPages}
                        onClick={() => setPage(totalPages)}
                        className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                          page === totalPages
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              {/* Next button */}
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                disabled={page >= Math.ceil(totalCount / pageSize)}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page size selector */}
              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-neutral-600 hidden sm:inline">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="border border-neutral-200 rounded-lg px-2 py-1 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit modal */}
      {editingInstructor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <form onSubmit={submitEdit} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit instructor</h4>
                  <p className="text-sm text-neutral-500">Update instructor details.</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition flex-shrink-0">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>

              {editError && (
                <div className="flex items-start gap-2 p-3 mb-1 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  <LucideIcons.AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">First name</label>
                  <input value={editForm.first_name} onChange={(e) => handleEditChange('first_name', e.target.value)} onBlur={onEditBlur} name="first_name" className={`w-full border rounded px-3 py-2 text-black text-sm ${editFieldErrors.first_name ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {editFieldErrors.first_name && <div className="text-xs text-rose-600 mt-1">{editFieldErrors.first_name}</div>}
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Last name</label>
                  <input value={editForm.last_name} onChange={(e) => handleEditChange('last_name', e.target.value)} onBlur={onEditBlur} name="last_name" className={`w-full border rounded px-3 py-2 text-black text-sm ${editFieldErrors.last_name ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {editFieldErrors.last_name && <div className="text-xs text-rose-600 mt-1">{editFieldErrors.last_name}</div>}
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Service No</label>
                  <input value={editForm.svc_number} onChange={(e) => handleEditChange('svc_number', e.target.value)} onBlur={onEditBlur} name="svc_number" maxLength={7} className={`w-full border rounded px-3 py-2 text-black text-sm ${editFieldErrors.svc_number ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {editFieldErrors.svc_number && <div className="text-xs text-rose-600 mt-1">{editFieldErrors.svc_number}</div>}
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Rank</label>
                  <select value={editForm.rank || ''} onChange={(e) => handleEditChange('rank', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm">
                    <option value="">Unassigned</option>
                    {RANK_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Unit</label>
                  <input value={editForm.unit} onChange={(e) => handleEditChange('unit', e.target.value)} maxLength={50} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" placeholder="e.g. 21KR" />
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Email</label>
                  <input value={editForm.email} onChange={(e) => handleEditChange('email', e.target.value)} onBlur={onEditBlur} name="email" className={`w-full border rounded px-3 py-2 text-black text-sm ${editFieldErrors.email ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {editFieldErrors.email && <div className="text-xs text-rose-600 mt-1">{editFieldErrors.email}</div>}
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Phone</label>
                  <input value={editForm.phone_number} onChange={(e) => handleEditChange('phone_number', e.target.value)} onBlur={onEditBlur} name="phone_number" className={`w-full border rounded px-3 py-2 text-black text-sm ${editFieldErrors.phone_number ? 'border-rose-500' : 'border-neutral-200'}`} />
                  {editFieldErrors.phone_number && <div className="text-xs text-rose-600 mt-1">{editFieldErrors.phone_number}</div>}
                </div>
              </div>

              <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={!!editForm.is_active} onChange={(e) => handleEditChange('is_active', e.target.checked)} />
                  <span className="text-sm text-neutral-600">Active</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openResetPassword(editingInstructor)} className="px-3 py-2 rounded-md bg-purple-600 text-sm text-white hover:bg-purple-700 transition">
                    <LucideIcons.Key className="w-4 h-4 inline mr-1" />Reset Password
                  </button>
                  <button type="button" onClick={() => handleDelete(editingInstructor)} className="px-3 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 transition">
                    Delete
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Confirm delete</h4>
              <p className="text-sm text-neutral-600 mt-2">Are you sure you want to delete <strong>{confirmDelete.first_name ? `${confirmDelete.first_name} ${confirmDelete.last_name}` : (confirmDelete.full_name || confirmDelete.svc_number || confirmDelete.id)}</strong>? This action cannot be undone.</p>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-4">
                <button onClick={() => setConfirmDelete(null)} className="w-full sm:w-auto px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button onClick={() => performDelete(confirmDelete)} disabled={deletingId === confirmDelete.id} className="w-full sm:w-auto px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === confirmDelete.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeResetPassword} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Reset Password</h4>
              <p className="text-sm text-neutral-600 mt-2">
                Set a new password for <strong>{resetPasswordUser.first_name ? `${resetPasswordUser.first_name} ${resetPasswordUser.last_name}` : (resetPasswordUser.full_name || resetPasswordUser.svc_number)}</strong>
              </p>

              <form onSubmit={submitResetPassword} className="mt-4 space-y-4">
                <div>
                  <div className="text-sm text-neutral-600 mb-1">New Password</div>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={handleNewPasswordChange}
                      className="w-full border border-neutral-200 rounded px-3 py-2 pr-10 text-black text-sm"
                      required
                      minLength={8}
                    />
                    <button type="button" onClick={() => setShowNewPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 transition" tabIndex={-1}>
                      {showNewPassword ? <LucideIcons.EyeOff className="w-4 h-4" /> : <LucideIcons.Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Requirements */}
                {newPassword && (
                  <div className="bg-neutral-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-medium text-neutral-500 mb-2">Password Requirements:</p>
                    {passwordStrength.feedback.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {item.met ? (
                          <LucideIcons.Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <LucideIcons.X className="w-3.5 h-3.5 text-red-500" />
                        )}
                        <span className={item.met ? 'text-green-700' : 'text-neutral-600'}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-sm text-neutral-600 mb-1">Confirm Password</div>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full border border-neutral-200 rounded px-3 py-2 pr-10 text-black text-sm"
                      required
                      minLength={8}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 transition" tabIndex={-1}>
                      {showConfirmPassword ? <LucideIcons.EyeOff className="w-4 h-4" /> : <LucideIcons.Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <LucideIcons.AlertCircle className="w-4 h-4" />
                    Passwords do not match
                  </p>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-4">
                  <button type="button" onClick={closeResetPassword} className="w-full sm:w-auto px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={resetLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword || passwordStrength.score < 4} className="w-full sm:w-auto px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{resetLoading ? 'Resetting...' : 'Reset Password'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Edit modal and confirm-delete modal appended outside main component render


