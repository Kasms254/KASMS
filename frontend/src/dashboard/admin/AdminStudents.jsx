import { useState, useEffect } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { useNavigate } from 'react-router-dom'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminStudents() {
  const navigate = useNavigate()
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    console.error(msg)
  }
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  // edit / delete UI state
  const [editingStudent, setEditingStudent] = useState(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', is_active: true, class_obj: '' })
  const [editLoading, setEditLoading] = useState(false)
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
  // Toggle activation loading
  const [togglingId, setTogglingId] = useState(null)


  // fetch students from API with pagination
  useEffect(() => {
    let mounted = true
    setLoading(true)
    const params = new URLSearchParams()
    params.append('page', page)
    params.append('page_size', pageSize)

    api
      .getStudentsPaginated(params.toString())
      .then((data) => {
        if (!mounted) return
        // Extract results and pagination info
        const list = data.results || []
        setTotalCount(data.count || 0)
        // normalize shape used by this component
        const mapped = list.map((u) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          full_name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          // normalize svc_number to a string so client-side searches are consistent
          svc_number: u.svc_number != null ? String(u.svc_number) : '',
          email: u.email,
          phone_number: u.phone_number,
          rank: u.rank || u.rank_display || '',
          is_active: u.is_active,
          created_at: u.created_at,
          // backend may include class name under different keys; fall back to 'Unassigned'
          className: u.class_name || u.class || u.class_obj_name || u.className || 'Unassigned',
        }))
        setStudents(mapped)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [page, pageSize])

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('all')
  const [availableClasses, setAvailableClasses] = useState([])

  // Load available classes for filter
  useEffect(() => {
    api.getAllClasses('is_active=true')
      .then((data) => {
        const classList = Array.isArray(data) ? data : []
        setAvailableClasses(classList)
      })
      .catch((err) => {
        console.error('Failed to load classes:', err)
      })
  }, [])

  // Update the API call to include search and class filter
  useEffect(() => {
    let mounted = true
    setLoading(true)
    const params = new URLSearchParams()
    params.append('page', page)
    params.append('page_size', pageSize)
    if (searchTerm.trim()) {
      // When searching, include all students (even those in inactive classes)
      params.append('search', searchTerm.trim())
    } else {
      // By default, only show students whose class is active
      params.append('class_is_active', 'true')
    }
    // Note: Backend filtering by class would require a class_id or class query parameter
    // If the backend doesn't support this, we'll do client-side filtering

    api
      .getStudentsPaginated(params.toString())
      .then((data) => {
        if (!mounted) return
        // Extract results and pagination info
        let list = data.results || []

        // Client-side filtering by class if a class is selected
        if (selectedClass !== 'all') {
          list = list.filter((u) => {
            const userClassName = u.class_name || u.class || u.class_obj_name || u.className || ''
            const selectedClassName = availableClasses.find(c => c.id === parseInt(selectedClass))?.name || ''
            return userClassName === selectedClassName
          })
        }

        setTotalCount(selectedClass !== 'all' ? list.length : data.count || 0)
        // normalize shape used by this component
        const mapped = list.map((u) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          full_name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          // normalize svc_number to a string so client-side searches are consistent
          svc_number: u.svc_number != null ? String(u.svc_number) : '',
          email: u.email,
          phone_number: u.phone_number,
          rank: u.rank || u.rank_display || '',
          is_active: u.is_active,
          created_at: u.created_at,
          // backend may include class name under different keys; fall back to 'Unassigned'
          className: u.class_name || u.class || u.class_obj_name || u.className || 'Unassigned',
        }))
        setStudents(mapped)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [page, pageSize, searchTerm, selectedClass, availableClasses])



  function downloadCSV() {
    // Export Service No first, then Rank, Name, Class, Email, Phone, Active
    const rows = [['Service No', 'Rank', 'Name', 'Class', 'Email', 'Phone', 'Active']]

    students.forEach((st) => rows.push([st.svc_number || '', st.rank || '', st.name || '', st.className || '', st.email || '', st.phone_number || '', st.is_active ? 'Yes' : 'No']))

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
    setEditForm({
      first_name: st.first_name || '',
      last_name: st.last_name || '',
      email: st.email || '',
      phone_number: st.phone_number || '',
      svc_number: st.svc_number || '',
      is_active: !!st.is_active,
      rank: st.rank || st.rank_display || '',
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
    setEditForm({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', is_active: true, rank: '' })
  }

  function handleEditChange(key, value) {
    setEditForm((f) => ({ ...f, [key]: value }))
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingStudent) return
    setEditLoading(true)
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        svc_number: editForm.svc_number,
        rank: editForm.rank || undefined,
        is_active: editForm.is_active,
      }
      const updated = await api.partialUpdateUser(editingStudent.id, payload)
      // normalize returned user into the shape used by this component
      const norm = {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        full_name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        svc_number: updated.svc_number,
        email: updated.email,
        rank: updated.rank || updated.rank_display || '',
        phone_number: updated.phone_number,
        is_active: updated.is_active,
        created_at: updated.created_at,
        className: updated.class_name || updated.class || updated.class_obj_name || updated.className || 'Unassigned',
      }
      setStudents((s) => s.map((x) => (x.id === norm.id ? norm : x)))
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
              console.warn('Failed to withdraw previous enrollment', err)
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
            setStudents((s) => s.map((x) => (x.id === norm.id ? { ...x, className: cls.name } : x)))
          }
        }
          } catch (err) {
            // enrollment error: inform user via toast
            reportError('Failed to update enrollment: ' + (err.message || String(err)))
          }
      closeEdit()
    } catch (err) {
      setError(err)
      // simple user feedback
      reportError('Failed to update student: ' + (err.message || String(err)))
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
      setStudents((s) => s.filter((x) => x.id !== st.id))
      // close confirm modal and also the edit modal if open
      setConfirmDelete(null)
      closeEdit()
      toast?.success?.('Student deleted successfully') || toast?.showToast?.('Student deleted successfully', { type: 'success' })
    } catch (err) {
      setError(err)
      // prefer toast later; keep simple for now
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
        setStudents((s) => s.map((x) => x.id === st.id ? { ...x, is_active: false } : x))
        toast?.success?.('Student deactivated successfully') || toast?.showToast?.('Student deactivated successfully', { type: 'success' })
      } else {
        await api.activateUser(st.id)
        setStudents((s) => s.map((x) => x.id === st.id ? { ...x, is_active: true } : x))
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
  }

  function closeResetPassword() {
    setResetPasswordUser(null)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordStrength({ score: 0, feedback: [] })
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
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
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
                  onChange={(e) => setSearchTerm(e.target.value)}
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
        ) : students.length === 0 ? (
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
              {students.map((st) => (
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
                      </div>
                    </div>
                    <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full flex-shrink-0 ${st.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {st.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm mb-3">
                    {st.rank && <div className="flex justify-between gap-2"><span className="text-neutral-600">Rank:</span><span className="text-black truncate">{st.rank}</span></div>}
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
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {students.map((st) => (
                    <tr key={st.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.svc_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{st.rank || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">{initials(st.name || st.svc_number)}</div>
                          <div className="font-medium text-sm text-black">{st.name || '-'}</div>
                        </div>
                      </td>
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
          <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" onClick={closeEdit} />

          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md animate-in zoom-in-95 duration-200">
            <form onSubmit={submitEdit} className="transform bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit student</h4>
                  <p className="text-sm text-neutral-500">Update student details (class assignment is handled via enrollments).</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <button type="button" onClick={() => openResetPassword(editingStudent)} className="px-3 py-1.5 rounded-md bg-purple-600 text-sm text-white hover:bg-purple-700 transition">
                  <LucideIcons.Key className="w-4 h-4 inline mr-1" />Reset Password
                </button>

                <button type="button" onClick={() => handleDelete(editingStudent)} className="px-3 py-1.5 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 transition">
                  Delete User
                </button>
              </div>

              <div className="mt-4">
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">First name</div>
                  <input value={editForm.first_name} onChange={(e) => handleEditChange('first_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Last name</div>
                  <input value={editForm.last_name} onChange={(e) => handleEditChange('last_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Service No</div>
                  <input value={editForm.svc_number} onChange={(e) => handleEditChange('svc_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Rank</div>
                  <select value={editForm.rank || ''} onChange={(e) => handleEditChange('rank', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
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
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Class</div>
                  <select value={editForm.class_obj || ''} onChange={(e) => handleEditChange('class_obj', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                    <option value="">Unassigned</option>
                    {classesList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Email</div>
                  <input value={editForm.email} onChange={(e) => handleEditChange('email', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Phone</div>
                  <input value={editForm.phone_number} onChange={(e) => handleEditChange('phone_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={!!editForm.is_active} onChange={(e) => handleEditChange('is_active', e.target.checked)} />
                  <span className="text-sm text-neutral-600">Active</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" onClick={() => setConfirmDelete(null)} />
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
          <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" onClick={closeResetPassword} />
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
                <label className="block">
                  <span className="text-sm text-neutral-600 mb-1 block">New Password</span>
                  <input 
                    type="password" 
                    value={newPassword} 
                    onChange={handleNewPasswordChange} 
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-purple-200"
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                </label>

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

                <label className="block">
                  <span className="text-sm text-neutral-600 mb-1 block">Confirm Password</span>
                  <input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-purple-200"
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                </label>
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
