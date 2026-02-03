import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCourses, getAllClasses, addClass, getAllInstructors, getClassEnrolledStudents } from '../../lib/api'
import useToast from '../../hooks/useToast'
import Card from '../../components/Card'
import ModernDatePicker from '../../components/ModernDatePicker'

export default function CourseDetail(){
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [course, setCourse] = useState(null)
  const [classes, setClasses] = useState([])
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  const [instructors, setInstructors] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', class_code: '', instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
  const [classErrors, setClassErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [studentsModalOpen, setStudentsModalOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState(null)
  const [enrolledStudents, setEnrolledStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState(null)
  const toast = useToast()
  const modalRef = useRef(null)

  const reportError = useCallback((m)=>{ if (!m) return; if (toast?.error) return toast.error(m); if (toast?.showToast) return toast.showToast(m, { type: 'error' }); }, [toast])
  const reportSuccess = useCallback((m)=>{ if (!m) return; if (toast?.success) return toast.success(m); if (toast?.showToast) return toast.showToast(m, { type: 'success' }); }, [toast])

  useEffect(()=>{
    // focus and escape handling for modal
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(()=>{ const first = modalRef.current?.querySelector('input,select,button'); first?.focus() }, 0)
    function onKey(e){ if (e.key === 'Escape') setModalOpen(false) }
    document.addEventListener('keydown', onKey)
    return ()=>{ document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [modalOpen])

  useEffect(()=>{ (async ()=>{
    setLoading(true)
    try{
      const courses = await getCourses()
      const list = Array.isArray(courses) ? courses : (courses && courses.results) ? courses.results : []
      const found = list.find(c => String(c.id) === String(id))
      setCourse(found || { id, name: `Course ${id}`, code: '', description: '' })
    }catch(e){ reportError('Failed to load course') }
    finally{ setLoading(false) }
  })() }, [id, reportError])

  const loadClasses = useCallback(async () => {
    try{
      const params = showOnlyActive ? `course=${id}&is_active=true` : `course=${id}`
      const data = await getAllClasses(params)
      const list = Array.isArray(data) ? data : []
      setClasses(list)

      // fetch enrolled students count for each class (best-effort)
      try{
        const counts = await Promise.allSettled(list.map((cl) => getClassEnrolledStudents(cl.id).catch(() => null)))
        const mapped = list.map((cl, idx) => {
          const res = counts[idx]
          let studentsCount = null
          if (res && res.status === 'fulfilled' && res.value) {
            const v = res.value
            studentsCount = Array.isArray(v) ? v.length : (v?.count ?? null)
          }
          return { ...cl, students_count: studentsCount }
        })
        setClasses(mapped)
      }catch{ /* ignore per-class failures */ }
    }catch{ reportError('Failed to load classes') }
  }, [id, showOnlyActive, reportError])

  useEffect(()=>{ loadClasses() }, [loadClasses])

  async function openAddModal(){
    try{
      const ins = await getAllInstructors()
      setInstructors(Array.isArray(ins) ? ins : [])
    }catch(e){ setInstructors([]) }
    setModalOpen(true)
  }

  async function handleAddClass(e){
    e.preventDefault()
    setClassErrors({})

    // Client-side validation
    const errors = {}
    if (!classForm.name?.trim()) errors.name = 'Class name is required'
    if (!classForm.instructor) errors.instructor = 'Please select an instructor'
    if (classForm.start_date && classForm.end_date) {
      const start = new Date(classForm.start_date)
      const end = new Date(classForm.end_date)
      if (end < start) errors.end_date = 'End date must be after start date'
    }
    if (classForm.capacity && (isNaN(Number(classForm.capacity)) || Number(classForm.capacity) < 1)) {
      errors.capacity = 'Capacity must be a positive number'
    }

    if (Object.keys(errors).length > 0) {
      setClassErrors(errors)
      reportError('Please fix the highlighted errors')
      return
    }

    setIsSaving(true)
    const payload = {
      name: classForm.name.trim(),
      class_code: classForm.class_code?.trim() || undefined,
      course: id,
      instructor: classForm.instructor ? Number(classForm.instructor) : null,
      start_date: classForm.start_date || null,
      end_date: classForm.end_date || null,
      capacity: Number(classForm.capacity) || 30,
      is_active: classForm.is_active
    }
    try{
      await addClass(payload)
      reportSuccess('Class added successfully')
      setClassForm({ name: '', class_code: '', instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
      setModalOpen(false)
      await loadClasses()
    }catch(err){
      const d = err?.data
      if (d && typeof d === 'object'){
        const fieldErrors = {}
        Object.keys(d).forEach(k => {
          if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' ')
          else fieldErrors[k] = String(d[k])
        })
        if (Object.keys(fieldErrors).length) {
          setClassErrors(fieldErrors)
          reportError('Please check the highlighted fields')
          return
        }
      }
      reportError(err?.message || 'Failed to add class')
    } finally {
      setIsSaving(false)
    }
  }

  async function openStudentsModal(cls){
    if (!cls) return
    setSelectedClass(cls)
    setStudentsModalOpen(true)
    setStudentsLoading(true)
    setStudentsError(null)
    setEnrolledStudents([])
    try{
      const data = await getClassEnrolledStudents(cls.id)
      // unwrap paginated response if needed
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      setEnrolledStudents(list)
    }catch(err){
      setStudentsError(err)
    }finally{
      setStudentsLoading(false)
    }
  }

  return (
    <div>
      {/* Students modal */}
      {studentsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setStudentsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Students in {selectedClass?.name || ''}</h4>
                  <p className="text-sm text-neutral-500">{selectedClass?.class_code || ''}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setStudentsModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <div className="mt-4">
                {studentsLoading ? (
                  <div className="text-sm text-neutral-500">Loading students…</div>
                ) : studentsError ? (
                  <div className="text-sm text-red-600">Failed to load students: {studentsError.message || String(studentsError)}</div>
                ) : enrolledStudents.length === 0 ? (
                  <div className="text-sm text-neutral-500">No students enrolled.</div>
                ) : (
                  <div className="overflow-auto max-h-80">
                    <table className="min-w-full table-auto">
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-2 text-sm text-neutral-600">Service No</th>
                          <th className="px-3 py-2 text-sm text-neutral-600">Name</th>
                          <th className="px-3 py-2 text-sm text-neutral-600">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrolledStudents.map((s) => (
                          <tr key={s.id} className="border-t last:border-b hover:bg-neutral-50">
                            <td className="px-3 py-2 text-sm text-neutral-700">{s.svc_number || '-'}</td>
                            <td className="px-3 py-2 text-sm text-neutral-700">{s.first_name ? `${s.first_name} ${s.last_name}` : (s.full_name || '-')}</td>
                            <td className="px-3 py-2 text-sm text-neutral-700">{s.email || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={() => setStudentsModalOpen(false)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-black">{course?.name || `Course ${id}`}</h2>
          <p className="text-sm text-neutral-500">Code: {course?.code} — {course?.description}</p>
        </div>
        <div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-black">
              <input type="checkbox" checked={!showOnlyActive} onChange={() => setShowOnlyActive((s) => !s)} />
              <span>Show inactive classes</span>
            </label>
            <button onClick={() => navigate('/list/courses')} className="px-3 py-1 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Back</button>
            <button onClick={openAddModal} className="ml-2 bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 transition">Add class</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {classes.length === 0 ? (
          <div className="text-sm text-neutral-400">No classes yet</div>
        ) : (
          classes.map((c) => (
            <div key={c.id} className="relative">
                  <Card
                    title={c.class_code || c.name}
                    value={c.name}
                    badge={`${c.subjects_count ?? 0} subjects • ${c.is_active ? 'Active' : 'Inactive'}`}
                    icon="Layers"
                    accent={c.is_active ? 'bg-emerald-500' : 'bg-neutral-400'}
                    colored={true}
                  >
                    <div>Instructor: {c.instructor_name || c.instructor || 'TBD'}</div>
                    <div className="mt-1">{c.start_date || ''} → {c.end_date || ''}</div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-sm bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{c.students_count != null ? `${c.students_count} students` : '— students'}</span>
                      <div className={`text-sm ${c.is_active ? 'text-emerald-600' : 'text-neutral-600'}`}>Status: {c.is_active ? 'Active' : 'Inactive'}</div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => openStudentsModal(c)} className="px-3 py-1 rounded-md border bg-white text-sm">View students</button>
                    </div>
                  </Card>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!isSaving) setModalOpen(false) }} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add Class</h4>
                  <p className="text-sm text-neutral-500">Create a new class under {course?.name || 'this course'}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { if (!isSaving) setModalOpen(false) }} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
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
                    <select
                      value={classForm.instructor}
                      onChange={(e) => { setClassForm({ ...classForm, instructor: e.target.value }); setClassErrors(prev => ({ ...prev, instructor: undefined })) }}
                      className={`w-full p-2.5 rounded-lg text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${classErrors.instructor ? 'border-red-500' : 'border-neutral-200'}`}
                    >
                      <option value="">— Select instructor —</option>
                      {instructors.map(ins => <option key={ins.id} value={ins.id}>{ins.full_name || ins.username}</option>)}
                    </select>
                    {classErrors.instructor && <p className="text-red-500 text-xs mt-1">{classErrors.instructor}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Capacity</label>
                    <input
                      type="number"
                      min={1}
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
                    />
                    {classErrors.start_date && <p className="text-red-500 text-xs mt-1">{classErrors.start_date}</p>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">End Date</label>
                    <ModernDatePicker
                      value={classForm.end_date}
                      onChange={(date) => { setClassForm({ ...classForm, end_date: date }); setClassErrors(prev => ({ ...prev, end_date: undefined })) }}
                      placeholder="Select end date"
                      minDate={classForm.start_date || null}
                    />
                    {classErrors.end_date && <p className="text-red-500 text-xs mt-1">{classErrors.end_date}</p>}
                  </div>
                </div>

                <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={classForm.is_active}
                      onChange={(e) => setClassForm({ ...classForm, is_active: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-neutral-600">Class is active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => { if (!isSaving) setModalOpen(false) }}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-lg text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Adding...
                      </>
                    ) : (
                      'Add Class'
                    )}
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
