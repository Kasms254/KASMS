import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCourses, getClassesPaginated, getAllClasses, addClass, updateClass, deleteClass, getAllInstructors, getClassEnrolledStudents } from '../../lib/api'
import useToast from '../../hooks/useToast'
import Card from '../../components/Card'
import ModernDatePicker from '../../components/ModernDatePicker'
import SearchableSelect from '../../components/SearchableSelect'
import { getRankSortIndex } from '../../lib/rankOrder'

function normalizeDate(dateStr) {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (typeof dateStr === 'string' && dateStr.length >= 10) {
    const prefix = dateStr.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return prefix
  }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sanitizeInput(value, trimSpaces = false) {
  if (typeof value !== 'string') return value
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
  const cleaned = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(controlChars, '')
  return trimSpaces ? cleaned.trim() : cleaned
}

export default function CourseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [course, setCourse] = useState(null)
  const [classes, setClasses] = useState([])
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(12)
  const [instructors, setInstructors] = useState([])

  // Add class modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', class_code: '', instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
  const [classErrors, setClassErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  // Edit class modal
  const [editingClass, setEditingClass] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editClassForm, setEditClassForm] = useState({ name: '', class_code: '', instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
  const [editClassErrors, setEditClassErrors] = useState({})

  // Delete confirmation
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const toast = useToast()
  const modalRef = useRef(null)

  const reportError = useCallback((m) => {
    if (!m) return
    if (toast?.error) return toast.error(m)
    if (toast?.showToast) return toast.showToast(m, { type: 'error' })
  }, [toast])

  const reportSuccess = useCallback((m) => {
    if (!m) return
    if (toast?.success) return toast.success(m)
    if (toast?.showToast) return toast.showToast(m, { type: 'success' })
  }, [toast])

  // Load course info
  useEffect(() => {
    (async () => {
      try {
        const courses = await getCourses()
        const list = Array.isArray(courses) ? courses : (courses && courses.results) ? courses.results : []
        const found = list.find(c => String(c.id) === String(id))
        setCourse(found || { id, name: `Course ${id}`, code: '', description: '' })
      } catch {
        reportError('Failed to load course')
      }
    })()
  }, [id, reportError])

  const loadClasses = useCallback(async () => {
    setLoading(true)
    try {
      let data
      try {
        const params = `course=${id}&is_active=${showOnlyActive}&page=${currentPage}&page_size=${pageSize}`
        data = await getClassesPaginated(params)
      } catch {
        const fallbackParams = showOnlyActive ? `course=${id}&is_active=true` : `course=${id}`
        const all = await getAllClasses(fallbackParams)
        data = { results: Array.isArray(all) ? all : [], count: Array.isArray(all) ? all.length : 0 }
      }

      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }

      const initialMapped = list.map(cl => ({
        ...cl,
        students_count: cl.current_enrollment ?? cl.enrollment_count ?? cl.students_count ?? null,
      }))
      setClasses(initialMapped)

      const toFetch = initialMapped.reduce((acc, cl, idx) => {
        if (cl.students_count == null) acc.push({ id: cl.id, idx })
        return acc
      }, [])

      if (toFetch.length > 0) {
        const counts = await Promise.allSettled(toFetch.map(t => getClassEnrolledStudents(t.id).catch(() => null)))
        const mapped = [...initialMapped]
        toFetch.forEach((t, i) => {
          const res = counts[i]
          let cnt = null
          if (res && res.status === 'fulfilled' && res.value) {
            const v = res.value
            cnt = Array.isArray(v) ? v.length : (v?.count ?? null)
          }
          mapped[t.idx] = { ...mapped[t.idx], students_count: cnt }
        })
        setClasses(mapped)
      }
    } catch {
      reportError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }, [id, showOnlyActive, currentPage, pageSize, reportError])

  useEffect(() => { loadClasses() }, [loadClasses])

  async function openAddModal() {
    try {
      const ins = await getAllInstructors()
      const list = Array.isArray(ins) ? ins : []
      list.sort((a, b) => getRankSortIndex(a.rank || a.rank_display) - getRankSortIndex(b.rank || b.rank_display))
      setInstructors(list)
    } catch {
      setInstructors([])
    }
    setClassErrors({})
    setClassForm({ name: '', class_code: '', instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
    setAddModalOpen(true)
    setTimeout(() => { modalRef.current?.querySelector('input,select,button')?.focus() }, 20)
  }

  async function handleAddClass(e) {
    e.preventDefault()
    setClassErrors({})
    const errors = {}
    if (!classForm.name?.trim()) errors.name = 'Class name is required'
    if (!classForm.instructor) errors.instructor = 'Please select an instructor'
    if (classForm.start_date && classForm.end_date && new Date(classForm.end_date) < new Date(classForm.start_date)) {
      errors.end_date = 'End date must be after start date'
    }
    if (classForm.capacity && (isNaN(Number(classForm.capacity)) || Number(classForm.capacity) < 1)) {
      errors.capacity = 'Capacity must be a positive number'
    }
    if (Object.keys(errors).length) { setClassErrors(errors); reportError('Please fix the highlighted errors'); return }

    setIsSaving(true)
    try {
      await addClass({
        name: classForm.name.trim(),
        class_code: classForm.class_code?.trim() || undefined,
        course: id,
        instructor: Number(classForm.instructor),
        start_date: classForm.start_date || null,
        end_date: classForm.end_date || null,
        capacity: Number(classForm.capacity) || 30,
        is_active: classForm.is_active,
      })
      reportSuccess('Class added successfully')
      setAddModalOpen(false)
      await loadClasses()
    } catch (err) {
      const d = err?.data
      if (d && typeof d === 'object') {
        const fieldErrors = {}
        Object.keys(d).forEach(k => { fieldErrors[k] = Array.isArray(d[k]) ? d[k].join(' ') : String(d[k]) })
        if (Object.keys(fieldErrors).length) { setClassErrors(fieldErrors); return }
      }
      reportError(err?.message || 'Failed to add class')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      {/* Header — same layout as Classes.jsx */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">{course?.name || `Course ${id}`}</h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            {course?.code ? `${course.code}${course.description ? ' — ' + course.description : ''}` : (course?.description || 'Click a Class to View Details.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-black">
            <input type="checkbox" checked={!showOnlyActive} onChange={() => { setShowOnlyActive(s => !s); setCurrentPage(1) }} />
            <span className="hidden sm:inline">Show Only Inactive Classes</span>
            <span className="sm:hidden">Only Inactive</span>
          </label>
          <button onClick={() => navigate('/list/courses')} className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Back</button>
          <button onClick={openAddModal} className="flex-1 sm:flex-none bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition">Add Class</button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} classes
        </div>
      )}

      {/* Class grid — identical structure to Classes.jsx */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? <div className="text-sm text-neutral-400">Loading...</div> : (
          classes.length === 0 ? <div className="text-sm text-neutral-400">No Classes Found</div> : classes.map(c => (
            <div key={c.id} className="relative h-full cursor-pointer" onClick={() => navigate(`/list/classes/${c.id}/students`)}>
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
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          const ins = await getAllInstructors()
                          const list = Array.isArray(ins) ? ins : []
                          list.sort((a, b) => getRankSortIndex(a.rank || a.rank_display) - getRankSortIndex(b.rank || b.rank_display))
                          setInstructors(list)
                        } catch { setInstructors([]) }
                        setEditingClass(c)
                        setEditClassForm({
                          name: c.name || '',
                          class_code: c.class_code || '',
                          instructor: c.instructor || c.instructor_id || '',
                          start_date: normalizeDate(c.start_date),
                          end_date: normalizeDate(c.end_date),
                          capacity: c.capacity || '',
                          is_active: !!c.is_active,
                        })
                        setEditClassErrors({})
                        setEditModalOpen(true)
                      }}
                      className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
                      aria-label={`Edit ${c.name || 'class'}`}
                    >Edit</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/list/classes/${c.id}/certificates`) }}
                      className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition"
                      aria-label={`Certificates for ${c.name || 'class'}`}
                    >Certificates</button>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Pagination — same as Classes.jsx */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      )}

      {/* Edit Class Modal — same as Classes.jsx */}
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
                setEditClassErrors({})
                setIsSaving(true)
                try {
                  await updateClass(editingClass.id, {
                    name: editClassForm.name,
                    class_code: editClassForm.class_code || undefined,
                    instructor: editClassForm.instructor ? Number(editClassForm.instructor) : null,
                    start_date: editClassForm.start_date || null,
                    end_date: editClassForm.end_date || null,
                    capacity: editClassForm.capacity ? Number(editClassForm.capacity) : undefined,
                    is_active: !!editClassForm.is_active,
                  })
                  reportSuccess('Class updated')
                  setEditModalOpen(false)
                  await loadClasses()
                } catch (err) {
                  const d = err?.data
                  if (d && typeof d === 'object') {
                    setEditClassErrors(d)
                    const nonField = d.non_field_errors || d.detail || d.message || d.error
                    if (nonField) reportError(Array.isArray(nonField) ? nonField.join(' ') : String(nonField))
                    else reportError('Please check the highlighted fields')
                  } else {
                    reportError(err?.message || 'Failed to update class')
                  }
                } finally { setIsSaving(false) }
              }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class name *</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editClassErrors.name ? 'border-rose-500' : 'border-neutral-200'}`} value={editClassForm.name} maxLength={50} onChange={(e) => setEditClassForm({ ...editClassForm, name: sanitizeInput(e.target.value).slice(0, 50) })} placeholder="e.g. Class A" />
                    {editClassErrors.name && <div className="text-xs text-rose-600 mt-1">{Array.isArray(editClassErrors.name) ? editClassErrors.name.join(' ') : String(editClassErrors.name)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class code</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editClassErrors.class_code ? 'border-rose-500' : 'border-neutral-200'}`} value={editClassForm.class_code} maxLength={20} onChange={(e) => setEditClassForm({ ...editClassForm, class_code: sanitizeInput(e.target.value).slice(0, 20) })} placeholder="e.g. CLS-001" />
                    {editClassErrors.class_code && <div className="text-xs text-rose-600 mt-1">{Array.isArray(editClassErrors.class_code) ? editClassErrors.class_code.join(' ') : String(editClassErrors.class_code)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Start date</label>
                    <ModernDatePicker value={editClassForm.start_date} onChange={(date) => setEditClassForm({ ...editClassForm, start_date: date })} placeholder="Select start date" />
                    {editClassErrors.start_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(editClassErrors.start_date) ? editClassErrors.start_date.join(' ') : String(editClassErrors.start_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">End date</label>
                    <ModernDatePicker value={editClassForm.end_date} onChange={(date) => setEditClassForm({ ...editClassForm, end_date: date })} placeholder="Select end date" minDate={editClassForm.start_date || null} />
                    {editClassErrors.end_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(editClassErrors.end_date) ? editClassErrors.end_date.join(' ') : String(editClassErrors.end_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Capacity</label>
                    <input type="number" className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editClassErrors.capacity ? 'border-rose-500' : 'border-neutral-200'}`} value={editClassForm.capacity} onChange={(e) => setEditClassForm({ ...editClassForm, capacity: e.target.value })} placeholder="e.g. 30" />
                    {editClassErrors.capacity && <div className="text-xs text-rose-600 mt-1">{Array.isArray(editClassErrors.capacity) ? editClassErrors.capacity.join(' ') : String(editClassErrors.capacity)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor</label>
                    <SearchableSelect
                      value={editClassForm.instructor}
                      onChange={(val) => setEditClassForm({ ...editClassForm, instructor: val })}
                      options={instructors.map(ins => ({ id: ins.id, label: `${ins.svc_number || '—'} | ${ins.rank || ins.rank_display || '—'} ${ins.full_name || ins.username}` }))}
                      placeholder="— Select instructor —"
                      searchPlaceholder="Search by service number, rank, or name..."
                      error={!!editClassErrors.instructor}
                    />
                    {editClassErrors.instructor && <div className="text-xs text-rose-600 mt-1">{Array.isArray(editClassErrors.instructor) ? editClassErrors.instructor.join(' ') : String(editClassErrors.instructor)}</div>}
                  </div>
                </div>

                <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!editClassForm.is_active} onChange={(e) => setEditClassForm({ ...editClassForm, is_active: e.target.checked })} />
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

      {/* Confirm Delete Class Modal — same as Classes.jsx */}
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
                      reportSuccess('Class deleted')
                      setConfirmDeleteClass(null)
                      setEditModalOpen(false)
                      await loadClasses()
                    } catch (err) {
                      reportError(err?.message || 'Failed to delete class')
                    } finally { setIsDeleting(false) }
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!isSaving) setAddModalOpen(false) }} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add Class</h4>
                  <p className="text-sm text-neutral-500">Create a new class under {course?.name || 'this course'}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { if (!isSaving) setAddModalOpen(false) }} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={handleAddClass}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class Name *</label>
                    <input
                      placeholder="e.g. Class A"
                      value={classForm.name}
                      onChange={(e) => { setClassForm({ ...classForm, name: e.target.value }); setClassErrors(prev => ({ ...prev, name: undefined })) }}
                      className={`w-full p-2.5 rounded-lg text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.name ? 'border-red-500' : 'border-neutral-200'}`}
                    />
                    {classErrors.name && <p className="text-red-500 text-xs mt-1">{classErrors.name}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class Code</label>
                    <input
                      placeholder="e.g. CLS-001"
                      value={classForm.class_code}
                      onChange={(e) => { setClassForm({ ...classForm, class_code: e.target.value }); setClassErrors(prev => ({ ...prev, class_code: undefined })) }}
                      className={`w-full p-2.5 rounded-lg text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.class_code ? 'border-red-500' : 'border-neutral-200'}`}
                    />
                    {classErrors.class_code && <p className="text-red-500 text-xs mt-1">{classErrors.class_code}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor *</label>
                    <SearchableSelect
                      value={classForm.instructor}
                      onChange={(val) => { setClassForm({ ...classForm, instructor: val }); setClassErrors(prev => ({ ...prev, instructor: undefined })) }}
                      options={instructors.map(ins => ({ id: ins.id, label: `${ins.svc_number || '—'} | ${ins.rank || ins.rank_display || '—'} ${ins.full_name || ins.username}` }))}
                      placeholder="— Select instructor —"
                      searchPlaceholder="Search by service number, rank, or name..."
                      error={!!classErrors.instructor}
                    />
                    {classErrors.instructor && <p className="text-red-500 text-xs mt-1">{classErrors.instructor}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Capacity</label>
                    <input
                      type="number" min={1}
                      placeholder="e.g. 30"
                      value={classForm.capacity}
                      onChange={(e) => { setClassForm({ ...classForm, capacity: e.target.value }); setClassErrors(prev => ({ ...prev, capacity: undefined })) }}
                      className={`w-full p-2.5 rounded-lg text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.capacity ? 'border-red-500' : 'border-neutral-200'}`}
                    />
                    {classErrors.capacity && <p className="text-red-500 text-xs mt-1">{classErrors.capacity}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Start Date</label>
                    <ModernDatePicker
                      value={classForm.start_date}
                      onChange={(date) => { setClassForm({ ...classForm, start_date: date }); setClassErrors(prev => ({ ...prev, start_date: undefined, end_date: undefined })) }}
                      placeholder="Select start date"
                      minDate={new Date().toISOString().split('T')[0]}
                    />
                    {classErrors.start_date && <p className="text-red-500 text-xs mt-1">{classErrors.start_date}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">End Date</label>
                    <ModernDatePicker
                      value={classForm.end_date}
                      onChange={(date) => { setClassForm({ ...classForm, end_date: date }); setClassErrors(prev => ({ ...prev, end_date: undefined })) }}
                      placeholder="Select end date"
                      minDate={classForm.start_date || new Date().toISOString().split('T')[0]}
                    />
                    {classErrors.end_date && <p className="text-red-500 text-xs mt-1">{classErrors.end_date}</p>}
                  </div>
                </div>

                <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={classForm.is_active} onChange={(e) => setClassForm({ ...classForm, is_active: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                    <span className="text-sm text-neutral-600">Class is active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={() => { if (!isSaving) setAddModalOpen(false) }} disabled={isSaving} className="px-4 py-2 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Adding...</>) : 'Add Class'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
