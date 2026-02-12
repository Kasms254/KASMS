import React, { useEffect, useState, useRef, useCallback } from 'react'
import { getClasses, getClassesPaginated, getAllInstructors, addSubject, getClassEnrolledStudents, updateClass, addClass, deleteClass, getAllCourses } from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import Card from '../../components/Card'
import ModernDatePicker from '../../components/ModernDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import { getRankSortIndex } from '../../lib/rankOrder'

// Normalize a date value (from the API) to YYYY-MM-DD format for the date picker
function normalizeDate(dateStr) {
  if (!dateStr) return ''
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  // Strip any time/timezone suffix (e.g. "2024-01-15T00:00:00Z" → "2024-01-15")
  if (typeof dateStr === 'string' && dateStr.length >= 10) {
    const prefix = dateStr.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return prefix
  }
  // Fallback: try to parse and reformat
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Sanitize text input by removing script tags, HTML tags, and control characters
function sanitizeInput(value, trimSpaces = false) {
  if (typeof value !== 'string') return value
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
  const cleaned = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(controlChars, '')

  // Only trim if explicitly requested (for final form submission)
  return trimSpaces ? cleaned.trim() : cleaned
}

export default function ClassesList(){
  const [classes, setClasses] = useState([])
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(12)
  // global modal open state; class selection is handled inside the form
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', subject_code: '', description: '', instructor: '', class_obj: '' })
  const [editingClass, setEditingClass] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', class_code: '', course: '', instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
  const [instructors, setInstructors] = useState([])
  const [classErrors, setClassErrors] = useState({})
  const [classErrorsFromValidation, setClassErrorsFromValidation] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [coursesList, setCoursesList] = useState([])
  // errors and saving state for the "Add subject" modal
  const [subjectErrors, setSubjectErrors] = useState({})
  const [subjectSaving, setSubjectSaving] = useState(false)
  // delete confirmation modal state
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const toast = useToast()
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])
  const modalRef = useRef(null)

  const loadClasses = useCallback(async () => {
    setLoading(true)
    try{
      // showOnlyActive: true = show active, false = show inactive only
      // If current user is an instructor, prefer to call the instructor-specific endpoint
      let data
      if (user && user.role === 'instructor') {
        try {
          // Filter by instructor and active status with pagination
          const params = `instructor=${user.id}&is_active=${showOnlyActive}&page=${currentPage}&page_size=${pageSize}`
          data = await getClassesPaginated(params)
        } catch {
          // If filtering fails, fall back to fetching all classes and filter locally
          const all = await getClasses()
          const listAll = Array.isArray(all) ? all : (all && all.results) ? all.results : []
          const list = listAll.filter((c) => String(c.instructor) === String(user.id) || String(c.instructor_id) === String(user.id) || (c.instructor_name && (c.instructor_name === user.full_name || c.instructor_name.includes(user.username || ''))))
          // Filter by active status
          const finalList = list.filter((c) => c.is_active === showOnlyActive)
          setClasses(finalList)
          setTotalCount(finalList.length)
          setTotalPages(1)
          data = { results: finalList, count: finalList.length }
        }
      } else {
        // Non-instructor: filter by is_active with pagination
        const params = `is_active=${showOnlyActive}&page=${currentPage}&page_size=${pageSize}`
        try {
          data = await getClassesPaginated(params)
        } catch {
          // fallback: fetch all classes and filter locally
          const all = await getClasses()
          const listAll = Array.isArray(all) ? all : (all && all.results) ? all.results : []
          const filtered = listAll.filter((c) => c.is_active === showOnlyActive)
          setClasses(filtered)
          setTotalCount(filtered.length)
          setTotalPages(1)
          data = { results: filtered, count: filtered.length }
        }
      }

      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []

      // Update pagination metadata
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }

      // If the server already provided a count (current_enrollment or enrollment_count), reuse it.
      const initialMapped = list.map((cl) => ({ ...cl, students_count: cl.current_enrollment ?? cl.enrollment_count ?? (cl.students_count ?? null) }))
      setClasses(initialMapped)

      // Determine which classes still need a students_count (null/undefined) and fetch only those
      const toFetch = initialMapped.reduce((acc, cl, idx) => {
        if (cl.students_count == null) acc.push({ id: cl.id, idx })
        return acc
      }, [])

      if (toFetch.length > 0) {
        try {
          const counts = await Promise.allSettled(toFetch.map((t) => getClassEnrolledStudents(t.id).catch(() => null)))
          const mapped = [...initialMapped]
          toFetch.forEach((t, i) => {
            const res = counts[i]
            let studentsCount = null
            if (res && res.status === 'fulfilled' && res.value) {
              const v = res.value
              studentsCount = Array.isArray(v) ? v.length : (v?.count ?? null)
            }
            mapped[t.idx] = { ...mapped[t.idx], students_count: studentsCount }
          })
          setClasses(mapped)
        } catch {
          // ignore per-class failures
        }
      }
    }catch{
      reportError('Failed to load classes')
    }finally{ setLoading(false) }
  }, [reportError, showOnlyActive, user, currentPage, pageSize])

  useEffect(()=>{ loadClasses() }, [loadClasses])

  async function openAddSubjectModal(classId = ''){
    try{
      const ins = await getAllInstructors()
      const list = Array.isArray(ins) ? ins : []
      // Sort by rank: senior first
      list.sort((a, b) => getRankSortIndex(a.rank || a.rank_display) - getRankSortIndex(b.rank || b.rank_display))
      setInstructors(list)
    }catch{
      setInstructors([])
    }
    // clear previous subject modal errors and prefill class selection if caller provided one
    setSubjectErrors({})
    setSubjectSaving(false)
    setForm({ name: '', subject_code: '', instructor: '', class_obj: classId || '' })
    setModalOpen(true)
    setTimeout(()=>{ modalRef.current?.querySelector('input,select,button')?.focus() }, 20)
  }

  async function openAddClassModal(){
    try{
      const [ins, courses] = await Promise.all([getAllInstructors().catch(()=>[]), getAllCourses().catch(()=>[])])
      const list = Array.isArray(ins) ? ins : []
      // Sort by rank: senior first
      list.sort((a, b) => getRankSortIndex(a.rank || a.rank_display) - getRankSortIndex(b.rank || b.rank_display))
      setInstructors(list)
      setCoursesList(Array.isArray(courses) ? courses : [])
    }catch{
      setInstructors([])
      setCoursesList([])
    }
    setClassErrors({})
    setClassErrorsFromValidation(false)
    setClassForm({ name: '', class_code: '', course: '', instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
    setAddModalOpen(true)
    setTimeout(()=>{ modalRef.current?.querySelector('input,select,button')?.focus() }, 20)
  }

  function closeModal(){ setModalOpen(false) }

  async function handleAddSubject(e){
    e.preventDefault()
    // client-side validation: build an errors object and show inline
    const errors = {}
    if (!form.name) errors.name = 'Subject name required'
    if (!form.description) errors.description = 'Subject description required'
    if (!form.class_obj) errors.class_obj = 'Please select a class'
    if (!form.instructor) errors.instructor = 'Please select an instructor'
    if (Object.keys(errors).length) {
      setSubjectErrors(errors)
      return
    }
    // ensure numeric PKs are sent for foreign keys
    const payload = {
      name: form.name,
      subject_code: form.subject_code || undefined,
      description: form.description,
      class_obj: Number(form.class_obj),
      instructor: Number(form.instructor),
    }
    try{
      setSubjectSaving(true)
      await addSubject(payload)
      // clear errors and show success
      setSubjectErrors({})
      if (toast?.success) toast.success('Subject added')
      else if (toast?.showToast) toast.showToast('Subject added', { type: 'success' })
      closeModal()
      await loadClasses()
    }catch(err){
      const d = err?.data
      // If backend provided structured field errors, show them inline
      if (d && typeof d === 'object'){
        setSubjectErrors(d)
        // show non-field messages as toast if present
        const nonField = d.non_field_errors || d.detail || d.message || d.error
        if (nonField) {
          const msg = Array.isArray(nonField) ? nonField.join(' ') : String(nonField)
          if (toast?.error) toast.error(msg)
          else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
        }
        return
      }
      const msg = err?.message || 'Failed to add subject'
      if (toast?.error) toast.error(msg)
      else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
      else reportError(msg)
    }
    finally { setSubjectSaving(false) }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Classes</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Click a Class to View Details.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-black">
            <input type="checkbox" checked={!showOnlyActive} onChange={() => {
              setShowOnlyActive((s) => !s)
              setCurrentPage(1)
            }} />
            <span className="hidden sm:inline">Show Only Inactive Classes</span>
            <span className="sm:hidden">Only Inactive</span>
          </label>
            {user && user.role === 'admin' && (
              <button onClick={() => openAddClassModal()} className="flex-1 sm:flex-none bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition">Add Class</button>
            )}
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} classes
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? <div className="text-sm text-neutral-400">Loading...</div> : (
          classes.length === 0 ? <div className="text-sm text-neutral-400">No Classes Found</div> : classes.map(c => (
            <div key={c.id} className="relative h-full">
              <Card
                title={c.class_code || c.name}
                value={c.name}
                badge={`${c.subjects_count ?? 0} Subjects • ${c.is_active ? 'Active' : 'Inactive'}`}
                icon="Layers"
                accent={c.is_active ? 'bg-emerald-500' : 'bg-neutral-400'}
                colored={true}
                className="h-full flex flex-col"
              >
                <div className="flex flex-col flex-1">
                  <div className="truncate" title={c.instructor_name || c.instructor || 'TBD'}>Instructor: {c.instructor_name || c.instructor || 'TBD'}</div>
                  <div className="mt-1 text-xs">{c.start_date || ''} → {c.end_date || ''}</div>
                  <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{c.students_count != null ? `${c.students_count} Students` : '— Students'}</span>
                    <span className={`text-xs ${c.is_active ? 'text-emerald-600' : 'text-neutral-600'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {user && user.role === 'admin' && (
                    <button onClick={async () => {
                    // ensure instructors list is loaded for the select
                    try {
                      const ins = await getAllInstructors()
                      const list = Array.isArray(ins) ? ins : []
                      // Sort by rank: senior first
                      list.sort((a, b) => getRankSortIndex(a.rank || a.rank_display) - getRankSortIndex(b.rank || b.rank_display))
                      setInstructors(list)
                    } catch {
                      setInstructors([])
                    }
                    setEditingClass(c)
                    setClassForm({
                      name: c.name || '',
                      class_code: c.class_code || '',
                      instructor: c.instructor || c.instructor_id || '',
                      start_date: normalizeDate(c.start_date),
                      end_date: normalizeDate(c.end_date),
                      capacity: c.capacity || '',
                      is_active: !!c.is_active,
                    })
                    setEditModalOpen(true)
                    }} className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition" aria-label={`Edit ${c.name || 'class'}`}>Edit</button>
                  )}
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Last
            </button>
          </div>
        </div>
      )}

  {/* Edit Class Modal */}
  {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit Class</h4>
                  <p className="text-sm text-neutral-500">Update Class Details</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!editingClass) return
                setClassErrors({})
                setIsSaving(true)
                try {
                  const payload = {
                    name: classForm.name,
                    class_code: classForm.class_code || undefined,
                    instructor: classForm.instructor ? Number(classForm.instructor) : null,
                    start_date: classForm.start_date || null,
                    end_date: classForm.end_date || null,
                    capacity: classForm.capacity ? Number(classForm.capacity) : undefined,
                    is_active: !!classForm.is_active,
                  }
                  await updateClass(editingClass.id, payload)
                  setEditModalOpen(false)
                  await loadClasses()
                } catch (err) {
                  const d = err?.data
                  if (d && typeof d === 'object') {
                    // Transform backend error messages to user-friendly messages
                    const friendlyErrors = { ...d }
                    const dateFields = ['start_date', 'end_date']
                    dateFields.forEach(field => {
                      if (friendlyErrors[field]) {
                        const errVal = friendlyErrors[field]
                        const errStr = Array.isArray(errVal) ? errVal.join(' ') : String(errVal)
                        if (errStr.toLowerCase().includes('may not be null') || errStr.toLowerCase().includes('required')) {
                          friendlyErrors[field] = 'Please Select the Date'
                        }
                      }
                    })
                    setClassErrors(friendlyErrors)
                    const nonField = d.non_field_errors || d.detail || d.message || d.error
                    if (nonField) {
                      const msg = Array.isArray(nonField) ? nonField.join(' ') : String(nonField)
                      if (toast?.error) toast.error(msg)
                      else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
                    } else {
                      if (toast?.error) toast.error('Please Check the Highlighted Fields')
                      else if (toast?.showToast) toast.showToast('Please Check the Highlighted Fields', { type: 'error' })
                    }
                  } else {
                    const msg = err?.message || 'Failed to update class'
                    if (toast?.error) toast.error(msg)
                    else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
                  }
                } finally {
                  setIsSaving(false)
                }
              }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class name *</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.name ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.name} maxLength={50} onChange={(e) => setClassForm({ ...classForm, name: sanitizeInput(e.target.value).slice(0, 50) })} placeholder="e.g. Class A" />
                    {classErrors.name && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.name) ? classErrors.name.join(' ') : String(classErrors.name)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class code</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.class_code ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.class_code} maxLength={20} onChange={(e) => setClassForm({ ...classForm, class_code: sanitizeInput(e.target.value).slice(0, 20) })} placeholder="e.g. CLS-001" />
                    {classErrors.class_code && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.class_code) ? classErrors.class_code.join(' ') : String(classErrors.class_code)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Start date</label>
                    <ModernDatePicker
                      value={classForm.start_date}
                      onChange={(date) => setClassForm({ ...classForm, start_date: date })}
                      placeholder="Select start date"
                    />
                    {classErrors.start_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.start_date) ? classErrors.start_date.join(' ') : String(classErrors.start_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">End date</label>
                    <ModernDatePicker
                      value={classForm.end_date}
                      onChange={(date) => setClassForm({ ...classForm, end_date: date })}
                      placeholder="Select end date"
                      minDate={classForm.start_date || null}
                    />
                    {classErrors.end_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.end_date) ? classErrors.end_date.join(' ') : String(classErrors.end_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Capacity</label>
                    <input type="number" className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.capacity ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} placeholder="e.g. 30" />
                    {classErrors.capacity && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.capacity) ? classErrors.capacity.join(' ') : String(classErrors.capacity)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor</label>
                    <SearchableSelect
                      value={classForm.instructor}
                      onChange={(val) => setClassForm({ ...classForm, instructor: val })}
                      options={instructors.map(ins => ({ id: ins.id, label: `${ins.svc_number || '—'} | ${ins.rank || ins.rank_display || '—'} ${ins.full_name || ins.username}` }))}
                      placeholder="— Select instructor —"
                      searchPlaceholder="Search by service number, rank, or name..."
                      error={!!classErrors.instructor}
                    />
                    {classErrors.instructor && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.instructor) ? classErrors.instructor.join(' ') : String(classErrors.instructor)}</div>}
                  </div>
                </div>

                <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!classForm.is_active} onChange={(e) => setClassForm({ ...classForm, is_active: e.target.checked })} />
                    <span className="text-sm text-neutral-600">Active</span>
                  </label>
                </div>

                <div className="flex justify-between gap-2 mt-4">
                  <button type="button" onClick={() => setConfirmDeleteClass(editingClass)} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{isSaving ? 'Saving...' : 'Save changes'}</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Class Modal */}
      {confirmDeleteClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteClass(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                    <span className="text-red-600 text-lg">!</span>
                  </div>
                  <h4 className="text-lg font-medium text-black">Delete class</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDeleteClass(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">Are you sure you want to delete <strong>{confirmDeleteClass.name || confirmDeleteClass.class_code}</strong>? This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDeleteClass(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button
                  onClick={async () => {
                    setIsDeleting(true)
                    try {
                      await deleteClass(confirmDeleteClass.id)
                      if (toast?.success) toast.success('Class deleted')
                      else if (toast?.showToast) toast.showToast('Class deleted', { type: 'success' })
                      setConfirmDeleteClass(null)
                      setEditModalOpen(false)
                      loadClasses()
                    } catch (err) {
                      reportError(err?.message || 'Failed to delete class')
                    } finally {
                      setIsDeleting(false)
                    }
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setAddModalOpen(false); setClassErrors({}); setClassErrorsFromValidation(false); }} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Create class</h4>
                  <p className="text-sm text-neutral-500">Add a new class under a course</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { setAddModalOpen(false); setClassErrors({}); setClassErrorsFromValidation(false); }} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault()
                setClassErrors({})
                setClassErrorsFromValidation(false)
                const errs = {}
                if (!classForm.name) errs.name = 'Class Name Required'
                if (!classForm.course) errs.course = 'Please Select a Course'
                if (!classForm.instructor) errs.instructor = 'Please Select an Instructor'
                // Date validation: start date cannot be in the past
                if (classForm.start_date) {
                  const start = new Date(classForm.start_date)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  if (start < today) {
                    errs.start_date = 'Start Date Cannot Be in the Past'
                  }
                }
                // Date validation: end date should be after start date
                if (classForm.start_date && classForm.end_date) {
                  const start = new Date(classForm.start_date)
                  const end = new Date(classForm.end_date)
                  if (end < start) {
                    errs.end_date = 'End Date Must Be After Start Date'
                  }
                }
                // Capacity validation: must be a positive number if provided
                if (classForm.capacity) {
                  const cap = Number(classForm.capacity)
                  if (isNaN(cap) || cap < 1) {
                    errs.capacity = 'Capacity Must Be a Positive Number'
                  }
                }
                if (Object.keys(errs).length) {
                  setClassErrors(errs)
                  setClassErrorsFromValidation(true)
                  if (toast?.error) toast.error('Please Check the Highlighted Fields')
                  else if (toast?.showToast) toast.showToast('Please Check the Highlighted Fields', { type: 'error' })
                  return
                }
                setIsSaving(true)
                try {
                  const payload = {
                    name: classForm.name,
                    class_code: classForm.class_code || undefined,
                    course: Number(classForm.course),
                    instructor: Number(classForm.instructor),
                    start_date: classForm.start_date || null,
                    end_date: classForm.end_date || null,
                    capacity: classForm.capacity ? Number(classForm.capacity) : undefined,
                    is_active: !!classForm.is_active,
                  }
                  await addClass(payload)
                  if (toast?.success) toast.success('Class Created')
                  else if (toast?.showToast) toast.showToast('Class Created', { type: 'success' })
                  setAddModalOpen(false)
                  setClassForm({ name: '', class_code: '', course: '', instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
                  setClassErrors({})
                  setClassErrorsFromValidation(false)
                  await loadClasses()
                } catch (err) {
                  const d = err?.data
                  if (d && typeof d === 'object') {
                    // Transform backend error messages to user-friendly messages
                    const friendlyErrors = { ...d }
                    const dateFields = ['start_date', 'end_date']
                    dateFields.forEach(field => {
                      if (friendlyErrors[field]) {
                        const errVal = friendlyErrors[field]
                        const errStr = Array.isArray(errVal) ? errVal.join(' ') : String(errVal)
                        if (errStr.toLowerCase().includes('may not be null') || errStr.toLowerCase().includes('required')) {
                          friendlyErrors[field] = 'Please Select the Date'
                        }
                      }
                    })
                    setClassErrors(friendlyErrors)
                    setClassErrorsFromValidation(false)
                    const nonField = d.non_field_errors || d.detail || d.message || d.error
                    if (nonField) {
                      const msg = Array.isArray(nonField) ? nonField.join(' ') : String(nonField)
                      if (toast?.error) toast.error(msg)
                      else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
                    }
                  } else {
                    const msg = err?.message || 'Failed to create class'
                    if (toast?.error) toast.error(msg)
                    else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
                  }
                } finally { setIsSaving(false) }
              }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class name *</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.name ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.name} maxLength={50} onChange={(e) => { setClassForm({ ...classForm, name: sanitizeInput(e.target.value).slice(0, 50) }); setClassErrors(prev => ({ ...prev, name: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, name: undefined }).length > 0); }} placeholder="e.g. Class A" />
                    {classErrors.name && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.name) ? classErrors.name.join(' ') : String(classErrors.name)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class code</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.class_code ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.class_code} maxLength={20} onChange={(e) => { setClassForm({ ...classForm, class_code: sanitizeInput(e.target.value).slice(0, 20) }); setClassErrors(prev => ({ ...prev, class_code: undefined })); }} placeholder="e.g. CLS-001" />
                    {classErrors.class_code && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.class_code) ? classErrors.class_code.join(' ') : String(classErrors.class_code)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Course *</label>
                    <select className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.course ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.course} onChange={(e) => { setClassForm({ ...classForm, course: e.target.value }); setClassErrors(prev => ({ ...prev, course: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, course: undefined }).length > 0); }}>
                      <option value="">— Select course —</option>
                      {coursesList.map(c => <option key={c.id} value={c.id}>{c.name || c.code}</option>)}
                    </select>
                    {classErrors.course && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.course) ? classErrors.course.join(' ') : String(classErrors.course)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor *</label>
                    <SearchableSelect
                      value={classForm.instructor}
                      onChange={(val) => { setClassForm({ ...classForm, instructor: val }); setClassErrors(prev => ({ ...prev, instructor: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, instructor: undefined }).length > 0); }}
                      options={instructors.map(ins => ({ id: ins.id, label: `${ins.svc_number || '—'}  ${ins.rank || ins.rank_display || '—'} ${ins.full_name || ins.username}` }))}
                      placeholder="— Select instructor —"
                      searchPlaceholder="Search by service number, rank, or name..."
                      error={!!classErrors.instructor}
                    />
                    {classErrors.instructor && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.instructor) ? classErrors.instructor.join(' ') : String(classErrors.instructor)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Start date</label>
                    <ModernDatePicker
                      value={classForm.start_date}
                      onChange={(date) => { setClassForm({ ...classForm, start_date: date }); setClassErrors(prev => ({ ...prev, start_date: undefined, end_date: undefined })); }}
                      placeholder="Select start date"
                      minDate={new Date().toISOString().split('T')[0]}
                    />
                    {classErrors.start_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.start_date) ? classErrors.start_date.join(' ') : String(classErrors.start_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">End date</label>
                    <ModernDatePicker
                      value={classForm.end_date}
                      onChange={(date) => { setClassForm({ ...classForm, end_date: date }); setClassErrors(prev => ({ ...prev, end_date: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, end_date: undefined }).length > 0); }}
                      placeholder="Select end date"
                      minDate={classForm.start_date || new Date().toISOString().split('T')[0]}
                    />
                    {classErrors.end_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.end_date) ? classErrors.end_date.join(' ') : String(classErrors.end_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Capacity</label>
                    <input type="number" min="1" className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.capacity ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.capacity} onChange={(e) => { setClassForm({ ...classForm, capacity: e.target.value }); setClassErrors(prev => ({ ...prev, capacity: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, capacity: undefined }).length > 0); }} placeholder="e.g. 30" />
                    {classErrors.capacity && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.capacity) ? classErrors.capacity.join(' ') : String(classErrors.capacity)}</div>}
                  </div>
                </div>

                {/* General error alert - only show for validation errors */}
                {classErrorsFromValidation && Object.keys(classErrors).length > 0 && (
                  <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                    <p className="text-sm text-rose-700">Please fix the highlighted errors before submitting.</p>
                  </div>
                )}

                <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!classForm.is_active} onChange={(e) => setClassForm({ ...classForm, is_active: e.target.checked })} />
                    <span className="text-sm text-neutral-600">Active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => { setAddModalOpen(false); setClassErrors({}); setClassErrorsFromValidation(false); }} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{isSaving ? 'Saving...' : 'Create class'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add subject to class</h4>
                  <p className="text-sm text-neutral-500">Create a new subject and assign it to a class</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeModal} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={handleAddSubject}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Subject name *</label>
                    <input placeholder="e.g. Mathematics" value={form.name} maxLength={50} onChange={(e) => { setForm({ ...form, name: sanitizeInput(e.target.value).slice(0, 50) }); setSubjectErrors(prev => ({ ...prev, name: undefined })); }} className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${subjectErrors.name ? 'border-rose-500' : 'border-neutral-200'}`} />
                    {subjectErrors.name && <div className="text-xs text-rose-600 mt-1">{Array.isArray(subjectErrors.name) ? subjectErrors.name.join(' ') : String(subjectErrors.name)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Subject code</label>
                    <input placeholder="e.g. MATH101" value={form.subject_code} maxLength={20} onChange={(e) => { setForm({ ...form, subject_code: sanitizeInput(e.target.value).slice(0, 20) }); setSubjectErrors(prev => ({ ...prev, subject_code: undefined })); }} className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${subjectErrors.subject_code ? 'border-rose-500' : 'border-neutral-200'}`} />
                    {subjectErrors.subject_code && <div className="text-xs text-rose-600 mt-1">{Array.isArray(subjectErrors.subject_code) ? subjectErrors.subject_code.join(' ') : String(subjectErrors.subject_code)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class *</label>
                    <select value={form.class_obj} onChange={(e) => { setForm({ ...form, class_obj: e.target.value }); setSubjectErrors(prev => ({ ...prev, class_obj: undefined })); }} className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${subjectErrors.class_obj ? 'border-rose-500' : 'border-neutral-200'}`}>
                      <option value="">— Select class —</option>
                      {classes.map(cl => <option key={cl.id} value={cl.id}>{cl.name || cl.class_code}</option>)}
                    </select>
                    {subjectErrors.class_obj && <div className="text-xs text-rose-600 mt-1">{Array.isArray(subjectErrors.class_obj) ? subjectErrors.class_obj.join(' ') : String(subjectErrors.class_obj)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor *</label>
                    <SearchableSelect
                      value={form.instructor}
                      onChange={(val) => { setForm({ ...form, instructor: val }); setSubjectErrors(prev => ({ ...prev, instructor: undefined })); }}
                      options={instructors.map(ins => ({ id: ins.id, label: `${ins.svc_number || '—'} | ${ins.rank || ins.rank_display || '—'} ${ins.full_name || ins.username}` }))}
                      placeholder="— Select instructor —"
                      searchPlaceholder="Search by service number, rank, or name..."
                      error={!!subjectErrors.instructor}
                    />
                    {subjectErrors.instructor && <div className="text-xs text-rose-600 mt-1">{Array.isArray(subjectErrors.instructor) ? subjectErrors.instructor.join(' ') : String(subjectErrors.instructor)}</div>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Description *</label>
                    <textarea placeholder="Short description of the subject" value={form.description} maxLength={150} onChange={(e) => { setForm({ ...form, description: sanitizeInput(e.target.value).slice(0, 150) }); setSubjectErrors(prev => ({ ...prev, description: undefined })); }} className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${subjectErrors.description ? 'border-rose-500' : 'border-neutral-200'}`} rows={3} />
                    {subjectErrors.description && <div className="text-xs text-rose-600 mt-1">{Array.isArray(subjectErrors.description) ? subjectErrors.description.join(' ') : String(subjectErrors.description)}</div>}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={closeModal} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={subjectSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{subjectSaving ? 'Adding...' : 'Add subject'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
