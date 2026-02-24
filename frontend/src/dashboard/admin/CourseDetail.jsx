import React, { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getCourses, getClassesPaginated, getAllClasses, addClass, updateClass, deleteClass, getAllInstructors, getClassEnrolledStudents } from '../../lib/api'
import { QK } from '../../lib/queryKeys'
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
  const queryClient = useQueryClient()
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(12)

  // Add class modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', class_code: '', index_prefix: '', index_start_from: 1, instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
  const [classErrors, setClassErrors] = useState({})
  const [classErrorsFromValidation, setClassErrorsFromValidation] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Edit class modal
  const [editingClass, setEditingClass] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editClassForm, setEditClassForm] = useState({ name: '', class_code: '', index_prefix: '', index_start_from: 1, instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
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

  const { data: course = null } = useQuery({
    queryKey: [...QK.courses(), 'detail', id],
    queryFn: async () => {
      const courses = await getCourses()
      const list = Array.isArray(courses) ? courses : (courses && courses.results) ? courses.results : []
      return list.find(c => String(c.id) === String(id)) || { id, name: `Course ${id}`, code: '', description: '' }
    },
  })

  const { data: instructors = [] } = useQuery({
    queryKey: QK.instructors(),
    queryFn: async () => {
      const ins = await getAllInstructors()
      const list = Array.isArray(ins) ? ins : []
      list.sort((a, b) => getRankSortIndex(a.rank || a.rank_display) - getRankSortIndex(b.rank || b.rank_display))
      return list
    },
  })

  const classParams = `course=${id}&is_active=${showOnlyActive}&page=${currentPage}&page_size=${pageSize}`
  const { data: classQueryResult = { list: [], totalCount: 0, totalPages: 1 }, isFetching: loading } = useQuery({
    queryKey: QK.classes(classParams),
    queryFn: async () => {
      let data
      try {
        data = await getClassesPaginated(classParams)
      } catch {
        const fallbackParams = showOnlyActive ? `course=${id}&is_active=true` : `course=${id}`
        const all = await getAllClasses(fallbackParams)
        data = { results: Array.isArray(all) ? all : [], count: Array.isArray(all) ? all.length : 0 }
      }

      const rawList = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      const count = data?.count ?? rawList.length
      const pages = Math.ceil(count / pageSize) || 1

      const initialMapped = rawList.map(cl => ({
        ...cl,
        students_count: cl.current_enrollment ?? cl.enrollment_count ?? cl.students_count ?? null,
      }))

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
        return { list: mapped, totalCount: count, totalPages: pages }
      }
      return { list: initialMapped, totalCount: count, totalPages: pages }
    },
    placeholderData: keepPreviousData,
  })

  const classes = classQueryResult.list
  const totalCount = classQueryResult.totalCount
  const totalPages = classQueryResult.totalPages

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
    setClassErrorsFromValidation(false)
    setClassForm({ name: '', class_code: '', index_prefix: '', index_start_from: 1, instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
    setAddModalOpen(true)
    setTimeout(() => { modalRef.current?.querySelector('input,select,button')?.focus() }, 20)
  }

  async function handleAddClass(e) {
    e.preventDefault()
    setClassErrors({})
    setClassErrorsFromValidation(false)
    const errors = {}
    if (!classForm.name?.trim()) errors.name = 'Class Name Required'
    if (!classForm.instructor) errors.instructor = 'Please Select an Instructor'
    if (classForm.start_date) {
      const start = new Date(classForm.start_date)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      if (start < today) errors.start_date = 'Start Date Cannot Be in the Past'
    }
    if (classForm.start_date && classForm.end_date && new Date(classForm.end_date) < new Date(classForm.start_date)) {
      errors.end_date = 'End Date Must Be After Start Date'
    }
    if (classForm.capacity && (isNaN(Number(classForm.capacity)) || Number(classForm.capacity) < 1)) {
      errors.capacity = 'Capacity Must Be a Positive Number'
    }
    if (Object.keys(errors).length) {
      setClassErrors(errors)
      setClassErrorsFromValidation(true)
      reportError('Please Check the Highlighted Fields')
      return
    }

    setIsSaving(true)
    try {
      await addClass({
        name: classForm.name.trim(),
        class_code: classForm.class_code?.trim() || undefined,
        index_prefix: classForm.index_prefix.trim().toUpperCase() || '',
        index_start_from: Number(classForm.index_start_from) || 1,
        course: id,
        instructor: Number(classForm.instructor),
        start_date: classForm.start_date || null,
        end_date: classForm.end_date || null,
        capacity: classForm.capacity ? Number(classForm.capacity) : undefined,
        is_active: classForm.is_active,
      })
      reportSuccess('Class Created')
      setAddModalOpen(false)
      setClassErrors({})
      setClassErrorsFromValidation(false)
      await loadClasses()
    } catch (err) {
      const d = err?.data
      if (d && typeof d === 'object') {
        const friendlyErrors = { ...d }
        const dateFields = ['start_date', 'end_date']
        dateFields.forEach(field => {
          if (friendlyErrors[field]) {
            const errStr = Array.isArray(friendlyErrors[field]) ? friendlyErrors[field].join(' ') : String(friendlyErrors[field])
            if (errStr.toLowerCase().includes('may not be null') || errStr.toLowerCase().includes('required')) {
              friendlyErrors[field] = 'Please Select the Date'
            }
          }
        })
        setClassErrors(friendlyErrors)
        setClassErrorsFromValidation(false)
        const nonField = d.non_field_errors || d.detail || d.message || d.error
        if (nonField) reportError(Array.isArray(nonField) ? nonField.join(' ') : String(nonField))
      } else {
        reportError(err?.message || 'Failed to add class')
      }
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
                          index_prefix: c.index_prefix || '',
                          index_start_from: c.index_start_from || 1,
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
                    index_prefix: editClassForm.index_prefix.trim().toUpperCase() || '',
                    index_start_from: Number(editClassForm.index_start_from) || 1,
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
                    <label className="text-sm text-neutral-600 mb-1 block">Index prefix</label>
                    <input className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 uppercase" value={editClassForm.index_prefix} maxLength={20} onBeforeInput={(e) => { if (e.data && !/^[A-Za-z0-9]+$/.test(e.data)) e.preventDefault() }} onChange={(e) => setEditClassForm({ ...editClassForm, index_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="e.g. INF" />
                    <p className="text-xs text-neutral-400 mt-1">Optional. Student indexes will display as PREFIX/001 (e.g. INF/001).</p>
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Index starts from</label>
                    <input type="number" min={1} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={editClassForm.index_start_from} onChange={(e) => setEditClassForm({ ...editClassForm, index_start_from: e.target.value })} placeholder="1" />
                    <p className="text-xs text-neutral-400 mt-1">First index number assigned to new students (e.g. 50 → first student gets 050).</p>
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!isSaving) { setAddModalOpen(false); setClassErrors({}); setClassErrorsFromValidation(false) } }} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add Class</h4>
                  <p className="text-sm text-neutral-500">Create a new class under {course?.name || 'this course'}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { if (!isSaving) { setAddModalOpen(false); setClassErrors({}); setClassErrorsFromValidation(false) } }} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={handleAddClass}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class name *</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.name ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.name} maxLength={50} onChange={(e) => { setClassForm({ ...classForm, name: sanitizeInput(e.target.value).slice(0, 50) }); setClassErrors(prev => ({ ...prev, name: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, name: undefined }).length > 0) }} placeholder="e.g. Class A" />
                    {classErrors.name && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.name) ? classErrors.name.join(' ') : String(classErrors.name)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class code</label>
                    <input className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.class_code ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.class_code} maxLength={20} onChange={(e) => { setClassForm({ ...classForm, class_code: sanitizeInput(e.target.value).slice(0, 20) }); setClassErrors(prev => ({ ...prev, class_code: undefined })) }} placeholder="e.g. CLS-001" />
                    {classErrors.class_code && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.class_code) ? classErrors.class_code.join(' ') : String(classErrors.class_code)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Index prefix</label>
                    <input className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 uppercase" value={classForm.index_prefix} maxLength={20} onBeforeInput={(e) => { if (e.data && !/^[A-Za-z0-9]+$/.test(e.data)) e.preventDefault() }} onChange={(e) => setClassForm({ ...classForm, index_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="e.g. INF" />
                    <p className="text-xs text-neutral-400 mt-1">Optional. Student indexes will display as PREFIX/001 (e.g. INF/001).</p>
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Index starts from</label>
                    <input type="number" min={1} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={classForm.index_start_from} onChange={(e) => setClassForm({ ...classForm, index_start_from: e.target.value })} placeholder="1" />
                    <p className="text-xs text-neutral-400 mt-1">First index number assigned to new students (e.g. 50 → first student gets 050).</p>
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor *</label>
                    <SearchableSelect
                      value={classForm.instructor}
                      onChange={(val) => { setClassForm({ ...classForm, instructor: val }); setClassErrors(prev => ({ ...prev, instructor: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, instructor: undefined }).length > 0) }}
                      options={instructors.map(ins => ({ id: ins.id, label: `${ins.svc_number || '—'}  ${ins.rank || ins.rank_display || '—'} ${ins.full_name || ins.username}` }))}
                      placeholder="— Select instructor —"
                      searchPlaceholder="Search by service number, rank, or name..."
                      error={!!classErrors.instructor}
                    />
                    {classErrors.instructor && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.instructor) ? classErrors.instructor.join(' ') : String(classErrors.instructor)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Capacity</label>
                    <input type="number" min="1" className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.capacity ? 'border-rose-500' : 'border-neutral-200'}`} value={classForm.capacity} onChange={(e) => { setClassForm({ ...classForm, capacity: e.target.value }); setClassErrors(prev => ({ ...prev, capacity: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, capacity: undefined }).length > 0) }} placeholder="e.g. 30" />
                    {classErrors.capacity && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.capacity) ? classErrors.capacity.join(' ') : String(classErrors.capacity)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Start date</label>
                    <ModernDatePicker
                      value={classForm.start_date}
                      onChange={(date) => { setClassForm({ ...classForm, start_date: date }); setClassErrors(prev => ({ ...prev, start_date: undefined, end_date: undefined })) }}
                      placeholder="Select start date"
                      minDate={new Date().toISOString().split('T')[0]}
                    />
                    {classErrors.start_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.start_date) ? classErrors.start_date.join(' ') : String(classErrors.start_date)}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">End date</label>
                    <ModernDatePicker
                      value={classForm.end_date}
                      onChange={(date) => { setClassForm({ ...classForm, end_date: date }); setClassErrors(prev => ({ ...prev, end_date: undefined })); if (classErrorsFromValidation) setClassErrorsFromValidation(Object.keys({ ...classErrors, end_date: undefined }).length > 0) }}
                      placeholder="Select end date"
                      minDate={classForm.start_date || new Date().toISOString().split('T')[0]}
                    />
                    {classErrors.end_date && <div className="text-xs text-rose-600 mt-1">{Array.isArray(classErrors.end_date) ? classErrors.end_date.join(' ') : String(classErrors.end_date)}</div>}
                  </div>
                </div>

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
                  <button type="button" onClick={() => { if (!isSaving) { setAddModalOpen(false); setClassErrors({}); setClassErrorsFromValidation(false) } }} disabled={isSaving} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{isSaving ? 'Saving...' : 'Add Class'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
