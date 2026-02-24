import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../../lib/api'
import { QK } from '../../lib/queryKeys'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { useNavigate } from 'react-router-dom'
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

export default function AdminStudents() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }

  const { data: students = [], isLoading: loading, error } = useQuery({
    queryKey: QK.students(),
    queryFn: async () => {
      const studentsData = await api.getAllStudents()
      const list = Array.isArray(studentsData) ? studentsData : []
      return list.map((u) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        full_name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        svc_number: u.svc_number != null ? String(u.svc_number) : '',
        email: u.email,
        phone_number: u.phone_number,
        rank: normalizeRank(u.rank || u.rank_display),
        unit: u.unit || '',
        is_active: u.is_active,
        created_at: u.created_at,
        className: u.class_name || u.class || u.class_obj_name || u.className || 'Unassigned',
      }))
    },
  })

  const { data: availableClasses = [] } = useQuery({
    queryKey: QK.classes('is_active=true'),
    queryFn: () => api.getAllClasses('is_active=true'),
  })

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // edit / delete UI state
  const [editingStudent, setEditingStudent] = useState(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', unit: '', is_active: true, class_obj: '' })
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
  const [classesList, setClassesList] = useState([])
  const [currentEnrollment, setCurrentEnrollment] = useState(null)
  const [enrollmentsList, setEnrollmentsList] = useState([])
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


  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('all')

  // Filter and sort students client-side
  const filteredStudents = useMemo(() => {
    let filtered = students

    // Filter by class
    if (selectedClass !== 'all') {
      const selectedClassName = availableClasses.find(c => c.id === parseInt(selectedClass))?.name || ''
      filtered = filtered.filter((u) => u.className === selectedClassName)
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      filtered = filtered.filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.svc_number || '').toLowerCase().includes(q) ||
        (u.rank || '').toLowerCase().includes(q) ||
        (u.className || '').toLowerCase().includes(q)
      )
    }

    // Sort by rank: senior first
    filtered.sort((a, b) => getRankSortIndex(a.rank) - getRankSortIndex(b.rank))
    return filtered
  }, [students, selectedClass, availableClasses, searchTerm])

  // Client-side pagination
  const totalCount = filteredStudents.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedStudents = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredStudents.slice(start, start + pageSize)
  }, [filteredStudents, page, pageSize])



  function downloadCSV() {
    // Export Service No first, then Rank, Name, Unit, Class, Email, Phone, Active
    const rows = [['Service No', 'Rank', 'Name', 'Unit', 'Class', 'Email', 'Phone', 'Active']]

    filteredStudents.forEach((st) => rows.push([st.svc_number || '', getRankDisplay(st.rank) || '', st.name || '', st.unit || '', st.className || '', st.email || '', st.phone_number || '', st.is_active ? 'Yes' : 'No']))

    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ----- Edit / Delete handlers -----
  function openEdit(st) {
    setEditingStudent(st)
    setEditError('')
    setEditFieldErrors({})
    setEditTouched({})
    setEditForm({
      first_name: st.first_name || '',
      last_name: st.last_name || '',
      email: st.email || '',
      phone_number: st.phone_number || '',
      svc_number: st.svc_number || '',
      is_active: !!st.is_active,
      rank: normalizeRank(st.rank || st.rank_display),
      unit: st.unit || '',
      // ensure class_obj is a string (select values are strings) and fall back to empty
      class_obj: st.class_obj ? String(st.class_obj) : '',
    })
    // fetch classes (if not loaded) and the student's enrollments to get active class
    if (classesList.length === 0) {
      api.getAllClasses('is_active=true').then((c) => {
        const list = Array.isArray(c) ? c : []
        // normalize ids to strings so <select> option values always match
        const normalized = list.map((cls) => ({ ...cls, id: cls.id != null ? String(cls.id) : cls.id }))
        setClassesList(normalized)
      }).catch(() => {})
    }
    api.getUserEnrollments(st.id).then((d) => {
      const list = Array.isArray(d) ? d : (d && Array.isArray(d.results) ? d.results : d && d.results ? d.results : (d && d.enrollments) || [])
      // store full list (used to detect existing enrollments)
      setEnrollmentsList(list)
      // pick the active enrollment if any
      const active = (list && list.find((e) => e.is_active)) || null
      setCurrentEnrollment(active)
      if (active && active.class_obj) {
        // backend may return a pk or nested object; normalize to primitive id
        const classId = typeof active.class_obj === 'object' && active.class_obj !== null ? active.class_obj.id : active.class_obj
        // keep select values as strings so they match option values
        setEditForm((f) => ({ ...f, class_obj: classId != null ? String(classId) : '' }))
      }
    }).catch(() => { setEnrollmentsList([]); setCurrentEnrollment(null) })
  }

  function closeEdit() {
    setEditingStudent(null)
    setEditForm({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', unit: '', is_active: true, rank: '' })
    setEditFieldErrors({})
    setEditTouched({})
    setEditError('')
  }

  function handleEditChange(key, value) {
    let newValue = value

    // Only allow numeric input for service number (max 7 digits)
    if (key === 'svc_number') {
      newValue = value.replace(/\D/g, '').slice(0, 7)
    }

    // Only allow numeric input for phone number
    if (key === 'phone_number') {
      newValue = value.replace(/\D/g, '')
    }

    setEditForm((f) => ({ ...f, [key]: newValue }))

    // Clear error when user types (if field was touched)
    if (editTouched[key]) {
      const error = validateEditField(key, newValue)
      setEditFieldErrors((prev) => ({ ...prev, [key]: error }))
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingStudent) return

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
        email: editForm.email,
        phone_number: editForm.phone_number,
        svc_number: editForm.svc_number,
        rank: editForm.rank || undefined,
        unit: editForm.unit || '',
        is_active: editForm.is_active,
      }
      const updated = await api.partialUpdateUser(editingStudent.id, payload)
      // Determine className: use selected class from edit form, or preserve existing
      let newClassName = editingStudent.className
      if (editForm.class_obj) {
        const cls = classesList.find((c) => String(c.id) === String(editForm.class_obj))
        if (cls) {
          newClassName = cls.name
        }
      } else {
        // No class selected means unassigned
        newClassName = 'Unassigned'
      }
      // normalize returned user into the shape used by this component
      const norm = {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        full_name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        svc_number: updated.svc_number,
        email: updated.email,
        rank: normalizeRank(updated.rank || updated.rank_display),
        unit: updated.unit || '',
        phone_number: updated.phone_number,
        is_active: updated.is_active,
        created_at: updated.created_at,
        className: newClassName,
      }
      queryClient.setQueryData(QK.students(), (old) => (old || []).map((x) => (x.id === norm.id ? norm : x)))
      // if class changed, create a new enrollment
      try {
        const selectedClass = editForm.class_obj
        const currentClassId = currentEnrollment && currentEnrollment.class_obj ? (typeof currentEnrollment.class_obj === 'object' ? currentEnrollment.class_obj.id : currentEnrollment.class_obj) : null
        if (selectedClass && String(selectedClass) !== String(currentClassId)) {
          // check if there's an existing enrollment record for this class
          const existing = enrollmentsList && enrollmentsList.find((e) => {
            const cid = typeof e.class_obj === 'object' && e.class_obj !== null ? e.class_obj.id : e.class_obj
            return String(cid) === String(selectedClass)
          })

          // Before creating/reactivating, withdraw any other active enrollments so the student
          // is active in only one class at a time on the backend.
          const activeOthers = (enrollmentsList || []).filter((e) => {
            const cid = typeof e.class_obj === 'object' && e.class_obj !== null ? e.class_obj.id : e.class_obj
            return e.is_active && String(cid) !== String(selectedClass)
          })
          for (const a of activeOthers) {
            try {
              await api.withdrawEnrollment(a.id)
              // update local copy
              setEnrollmentsList((lst) => lst.map((x) => x.id === a.id ? { ...x, is_active: false } : x))
            } catch (err) {
              // non-fatal: continue but inform user
            }
          }

          if (existing) {
            if (existing.is_active) {
              // already active — nothing to do
            } else {
              // reactivate existing enrollment instead of creating duplicate
              await api.reactivateEnrollment(existing.id)
              // update local state to reflect reactivation
              setCurrentEnrollment({ ...existing, is_active: true })
              setEnrollmentsList((lst) => lst.map((e) => e.id === existing.id ? { ...e, is_active: true } : e))
            }
          } else {
            // POST enrollment { student, class_obj }
            await api.addEnrollment({ student: editingStudent.id, class_obj: selectedClass })
          }

          // update local student's className from classesList if available
          const cls = classesList.find((c) => String(c.id) === String(selectedClass))
          if (cls) {
            queryClient.setQueryData(QK.students(), (old) => (old || []).map((x) => (x.id === norm.id ? { ...x, className: cls.name } : x)))
          }
        }
          } catch (err) {
            // enrollment error: inform user via toast
            reportError('Failed to update enrollment: ' + (err.message || String(err)))
          }
      closeEdit()
      toast?.success?.('Student updated successfully') || toast?.showToast?.('Student updated successfully', { type: 'success' })
    } catch (err) {
      // Parse backend field-level validation errors (e.g. { email: ["already exists"] })
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
        // Show non_field_errors or detail as inline banner
        const msg = data.non_field_errors
          ? (Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : String(data.non_field_errors))
          : data.detail || (!hasFieldError ? (err.message || String(err)) : '')
        setEditError(msg || 'Please fix the highlighted errors')
      } else {
        setEditError('Failed to update student: ' + (err.message || String(err)))
      }
    } finally {
      setEditLoading(false)
    }
  }

  // show confirm modal (instead of window.confirm)
  function handleDelete(st) {
    setConfirmDelete(st)
  }

  async function performDelete(st) {
    if (!st) return
    setDeletingId(st.id)
    try {
      await api.deleteUser(st.id)
      queryClient.setQueryData(QK.students(), (old) => (old || []).filter((x) => x.id !== st.id))
      // close confirm modal and also the edit modal if open
      setConfirmDelete(null)
      closeEdit()
      toast?.success?.('Student deleted successfully') || toast?.showToast?.('Student deleted successfully', { type: 'success' })
    } catch (err) {
      reportError('Failed to delete student: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  // Toggle user activation status
  async function toggleActivation(st) {
    setTogglingId(st.id)
    try {
      if (st.is_active) {
        await api.deactivateUser(st.id)
        queryClient.setQueryData(QK.students(), (old) => (old || []).map((x) => x.id === st.id ? { ...x, is_active: false } : x))
        toast?.success?.('Student deactivated successfully') || toast?.showToast?.('Student deactivated successfully', { type: 'success' })
      } else {
        await api.activateUser(st.id)
        queryClient.setQueryData(QK.students(), (old) => (old || []).map((x) => x.id === st.id ? { ...x, is_active: true } : x))
        toast?.success?.('Student activated successfully') || toast?.showToast?.('Student activated successfully', { type: 'success' })
      }
    } catch (err) {
      reportError('Failed to update status: ' + (err.message || String(err)))
    } finally {
      setTogglingId(null)
    }
  }

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

  // Password reset handlers
  function openResetPassword(st) {
    setResetPasswordUser(st)
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

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Students</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage student records by class</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={downloadCSV} className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 transition shadow-sm whitespace-nowrap">Download CSV</button>
        </div>
      </header>

      <section className="grid gap-4 sm:gap-6">
        {/* Search and Filter bar */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col gap-3">
            {/* Search input and Class filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="relative flex-1">
                <input
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                  placeholder="Search students..."
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
                  {availableClasses.map((cls) => (
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
                  setSearchTerm('');
                  setSelectedClass('all');
                  setPage(1)
                }}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
              >
                Clear All
              </button>
            </div>

            {/* Filter summary */}
            {(searchTerm || selectedClass !== 'all') && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
                <span className="text-xs text-neutral-600">Active filters:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                    Search: "{searchTerm}"
                    <button
                      onClick={() => {
                        setSearchTerm('')
                        setPage(1)
                      }}
                      className="hover:bg-indigo-100 rounded-full p-0.5"
                    >
                      <LucideIcons.X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {selectedClass !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                    Class: {availableClasses.find(c => c.id === parseInt(selectedClass))?.name || 'Unknown'}
                    <button
                      onClick={() => {
                        setSelectedClass('all')
                        setPage(1)
                      }}
                      className="hover:bg-indigo-100 rounded-full p-0.5"
                    >
                      <LucideIcons.X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="p-6 bg-white rounded-xl border border-red-200">
            <EmptyState
              icon="AlertCircle"
              title="Error loading students"
              description={error.message || String(error)}
              variant="minimal"
            />
          </div>
        ) : loading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200">
            <EmptyState
              icon="Loader2"
              title="Loading students..."
              variant="minimal"
            />
          </div>
        ) : paginatedStudents.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200">
            <EmptyState
              icon="Users"
              title="No students found"
              description={searchTerm ? `No students match "${searchTerm}". Try adjusting your search terms.` : "Get started by adding your first student. Students can be enrolled in classes and track their academic progress."}
              actionLabel={!searchTerm ? "Add Student" : undefined}
              onAction={!searchTerm ? () => navigate('/dashboard/add/user') : undefined}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Mobile Card View */}
            <div className="lg:hidden p-4 space-y-3">
              {paginatedStudents.map((st) => (
                <div key={st.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                        {initials(st.name || st.svc_number)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm sm:text-base text-black truncate">{st.name || '-'}</div>
                        <div className="text-xs text-neutral-600">{st.svc_number || '-'}</div>
                        <div className="text-xs text-neutral-500">{st.className}</div>
                        {st.unit && <div className="text-xs text-neutral-400">{st.unit}</div>}
                      </div>
                    </div>
                    <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full flex-shrink-0 ${st.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {st.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm mb-3">
                    {st.rank && <div className="flex justify-between gap-2"><span className="text-neutral-600">Rank:</span><span className="text-black truncate">{getRankDisplay(st.rank)}</span></div>}
                    <div className="flex justify-between gap-2"><span className="text-neutral-600 flex-shrink-0">Email:</span><span className="text-black truncate">{st.email || '-'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-neutral-600">Phone:</span><span className="text-black truncate">{st.phone_number || '-'}</span></div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-200">
                    <button onClick={() => openEdit(st)} className="flex-1 min-w-[70px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-md bg-indigo-600 text-xs sm:text-sm text-white hover:bg-indigo-700 transition">Edit</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Unit</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {paginatedStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.svc_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{getRankDisplay(st.rank) || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">{initials(st.name || st.svc_number)}</div>
                          <div className="font-medium text-sm text-black">{st.name || '-'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{st.unit || '-'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{st.className}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 truncate max-w-[200px]">{st.email || '-'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.phone_number || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${st.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {st.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(st)} className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition whitespace-nowrap">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeEdit} />

          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl animate-in zoom-in-95 duration-200">
            <form onSubmit={submitEdit} className="transform bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit student</h4>
                  <p className="text-sm text-neutral-500">Update student details.</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
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
                  <label className="text-sm text-neutral-600 mb-1 block">Class</label>
                  <select value={editForm.class_obj || ''} onChange={(e) => handleEditChange('class_obj', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm">
                    <option value="">Unassigned</option>
                    {classesList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
                  <button type="button" onClick={() => openResetPassword(editingStudent)} className="px-3 py-2 rounded-md bg-purple-600 text-sm text-white hover:bg-purple-700 transition">
                    <LucideIcons.Key className="w-4 h-4 inline mr-1" />Reset Password
                  </button>
                  <button type="button" onClick={() => handleDelete(editingStudent)} className="px-3 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 transition">
                    Delete
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                    <LucideIcons.AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <h4 className="text-lg font-medium text-black">Confirm delete</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDelete(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-neutral-600 ml-13">Are you sure you want to delete <strong>{confirmDelete.name || confirmDelete.svc_number || confirmDelete.id}</strong>? This action cannot be undone.</p>

              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button onClick={() => performDelete(confirmDelete)} disabled={deletingId === confirmDelete.id} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === confirmDelete.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeResetPassword} />
          <div className="relative z-10 w-full max-w-md animate-in zoom-in-95 duration-200">
            <form onSubmit={submitResetPassword} className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-100">
                    <LucideIcons.Key className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-black">Reset Password</h4>
                    <p className="text-sm text-neutral-500">{resetPasswordUser.name || resetPasswordUser.svc_number}</p>
                  </div>
                </div>
                <button type="button" aria-label="Close" onClick={closeResetPassword} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-sm text-neutral-600 mb-1 block">New Password</span>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={handleNewPasswordChange}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 pr-10 text-black focus:outline-none focus:ring-2 focus:ring-purple-200"
                      placeholder="Enter new password"
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
                  <span className="text-sm text-neutral-600 mb-1 block">Confirm Password</span>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 pr-10 text-black focus:outline-none focus:ring-2 focus:ring-purple-200"
                      placeholder="Confirm new password"
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
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={closeResetPassword} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button 
                  type="submit" 
                  disabled={resetLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword || passwordStrength.score < 4} 
                  className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {resetLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modern Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Results info */}
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> students
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              {/* Previous button */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = Math.ceil(totalCount / pageSize)
                  const pages = []
                  const maxVisible = 5

                  let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
                  let endPage = Math.min(totalPages, startPage + maxVisible - 1)

                  if (endPage - startPage < maxVisible - 1) {
                    startPage = Math.max(1, endPage - maxVisible + 1)
                  }

                  if (startPage > 1) {
                    pages.push(
                      <button key={1} onClick={() => setPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        1
                      </button>
                    )
                    if (startPage > 2) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition ${
                          page === i
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }
                    pages.push(
                      <button key={totalPages} onClick={() => setPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
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
                aria-label="Next page"
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
                  className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
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

    </div>
  )
}
