import React, { useEffect, useState, useRef, useCallback } from 'react'
import { getClasses, getInstructors, addSubject, getClassEnrolledStudents, updateClass } from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import Card from '../../components/Card'

export default function ClassesList(){
  const [classes, setClasses] = useState([])
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showOnlyActive, setShowOnlyActive] = useState(true)
  // global modal open state; class selection is handled inside the form
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', subject_code: '', description: '', instructor: '', class_obj: '' })
  const [editingClass, setEditingClass] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', class_code: '', instructor: '', start_date: '', end_date: '', capacity: '', is_active: true })
  const [instructors, setInstructors] = useState([])
  const [classErrors, setClassErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  // errors and saving state for the "Add subject" modal
  const [subjectErrors, setSubjectErrors] = useState({})
  const [subjectSaving, setSubjectSaving] = useState(false)
  const toast = useToast()
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    console.error(msg)
  }, [toast])
  const modalRef = useRef(null)

  const loadClasses = useCallback(async () => {
    setLoading(true)
    try{
      // If showOnlyActive is true request only active classes, otherwise request all
      let params = showOnlyActive ? 'is_active=true' : ''
      // If current user is an instructor, prefer to request only classes they teach
      if (user && user.role === 'instructor') {
        params = params ? `${params}&instructor=${user.id}` : `instructor=${user.id}`
      }

      // Try server-side filtering first; fall back to client-side filtering if that fails
      let data
      try {
        data = await getClasses(params)
  } catch {
        // fallback: try fetching all classes and filter locally for instructors
        const all = await getClasses()
        const listAll = Array.isArray(all) ? all : (all && all.results) ? all.results : []
        const list = user && user.role === 'instructor'
          ? listAll.filter((c) => String(c.instructor) === String(user.id) || String(c.instructor_id) === String(user.id) || (c.instructor_name && (c.instructor_name === user.full_name || c.instructor_name.includes(user.username || ''))))
          : listAll
        setClasses(list)
        // still fetch student counts below using the list we have
        data = list
      }

      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      setClasses(list)

      // fetch enrolled students count for each class (do not block the UI)
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
    }catch{
      reportError('Failed to load classes')
    }finally{ setLoading(false) }
  }, [reportError, showOnlyActive, user])

  useEffect(()=>{ loadClasses() }, [loadClasses])

  async function openAddSubjectModal(classId = ''){
    try{
      const ins = await getInstructors()
      setInstructors(Array.isArray(ins) ? ins : (ins && ins.results) ? ins.results : [])
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
      else console.log('Subject added')
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-black">Classes</h2>
          <p className="text-sm text-neutral-500">Click a class to view details. Toggle to include inactive classes.</p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-black">
              <input type="checkbox" checked={!showOnlyActive} onChange={() => setShowOnlyActive((s) => !s)} />
              <span>Show inactive classes</span>
            </label>
            <button onClick={() => openAddSubjectModal()} className="bg-blue-600 text-white px-3 py-1 rounded-md">Add subject</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? <div className="text-sm text-neutral-400">Loading...</div> : (
          classes.length === 0 ? <div className="text-sm text-neutral-400">No classes found</div> : classes.map(c => (
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
                <div className="mt-3 flex gap-2">
                  <button onClick={async () => {
                    // ensure instructors list is loaded for the select
                    try {
                      const ins = await getInstructors()
                      setInstructors(Array.isArray(ins) ? ins : (ins && ins.results) ? ins.results : [])
                    } catch {
                      setInstructors([])
                    }
                    setEditingClass(c)
                    setClassForm({
                      name: c.name || '',
                      class_code: c.class_code || '',
                      instructor: c.instructor || c.instructor_id || '',
                      start_date: c.start_date || '',
                      end_date: c.end_date || '',
                      capacity: c.capacity || '',
                      is_active: !!c.is_active,
                    })
                    setEditModalOpen(true)
                  }} className="px-3 py-1 rounded-md border bg-indigo-600 text-white text-sm" aria-label={`Edit ${c.name || 'class'}`}>Edit</button>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

  {/* Edit Class Modal */}
  {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit class</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditModalOpen(false)} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
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
                  // helpful debug for developer: payload sent to API
                  // remove in production if verbose
                  console.debug('updateClass payload', editingClass?.id, payload)
                  await updateClass(editingClass.id, payload)
                  setEditModalOpen(false)
                  await loadClasses()
                } catch (err) {
                  // If backend returned structured errors, show them inline
                  const d = err?.data
                  if (d && typeof d === 'object') {
                    setClassErrors(d)
                    // show non-field or detail messages as toast
                    const nonField = d.non_field_errors || d.detail || d.message || d.error
                    if (nonField) {
                      const msg = Array.isArray(nonField) ? nonField.join(' ') : String(nonField)
                      if (toast?.error) toast.error(msg)
                      else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
                    } else {
                      // if there are field errors but no non-field error, also show a generic toast
                      if (toast?.error) toast.error('Please check the highlighted fields')
                      else if (toast?.showToast) toast.showToast('Please check the highlighted fields', { type: 'error' })
                    }
                  } else {
                    const msg = err?.message || 'Failed to update class'
                    if (toast?.error) toast.error(msg)
                    else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
                  }
                } finally {
                  setIsSaving(false)
                }
              }} className="mt-4 grid grid-cols-1 gap-3">
                <input className="p-2 rounded-md border border-neutral-200 text-black" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} placeholder="Class name" />
                {classErrors.name && <div className="text-sm text-red-600">{Array.isArray(classErrors.name) ? classErrors.name.join(' ') : String(classErrors.name)}</div>}
                <input className="p-2 rounded-md border border-neutral-200 text-black" value={classForm.class_code} onChange={(e) => setClassForm({ ...classForm, class_code: e.target.value })} placeholder="Class code" />
                {classErrors.class_code && <div className="text-sm text-red-600">{Array.isArray(classErrors.class_code) ? classErrors.class_code.join(' ') : String(classErrors.class_code)}</div>}
                <div className="flex gap-2">
                  <input type="date" className="p-2 rounded-md border border-neutral-200 text-black" value={classForm.start_date} onChange={(e) => setClassForm({ ...classForm, start_date: e.target.value })} />
                  {classErrors.start_date && <div className="text-sm text-red-600">{Array.isArray(classErrors.start_date) ? classErrors.start_date.join(' ') : String(classErrors.start_date)}</div>}
                  <input type="date" className="p-2 rounded-md border border-neutral-200 text-black" value={classForm.end_date} onChange={(e) => setClassForm({ ...classForm, end_date: e.target.value })} />
                  {classErrors.end_date && <div className="text-sm text-red-600">{Array.isArray(classErrors.end_date) ? classErrors.end_date.join(' ') : String(classErrors.end_date)}</div>}
                </div>
                <input type="number" className="p-2 rounded-md border border-neutral-200 text-black" value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} placeholder="Capacity" />
                {classErrors.capacity && <div className="text-sm text-red-600">{Array.isArray(classErrors.capacity) ? classErrors.capacity.join(' ') : String(classErrors.capacity)}</div>}
                <select className="p-2 rounded-md border border-neutral-200 text-black" value={classForm.instructor} onChange={(e) => setClassForm({ ...classForm, instructor: e.target.value })}>
                  <option value="">— Select instructor —</option>
                  {instructors.map(ins => <option key={ins.id} value={ins.id}>{ins.full_name || ins.username}</option>)}
                </select>
                {classErrors.instructor && <div className="text-sm text-red-600">{Array.isArray(classErrors.instructor) ? classErrors.instructor.join(' ') : String(classErrors.instructor)}</div>}
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!classForm.is_active} onChange={(e) => setClassForm({ ...classForm, is_active: e.target.checked })} /> <span className="text-black">Active</span></label>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded-md border text-sm bg-red-700 text-white">Cancel</button>
                  <button type="submit" disabled={isSaving} className={`px-4 py-2 rounded-md text-white ${isSaving ? 'bg-neutral-400' : 'bg-indigo-600'}`}>{isSaving ? 'Saving...' : 'Save'}</button>
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
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add subject to class</h4>
                </div>
                <button type="button" aria-label="Close" onClick={closeModal} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
              </div>
              <form onSubmit={handleAddSubject} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <input placeholder="Subject name" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setSubjectErrors(prev => ({ ...prev, name: undefined })); }} className="p-2 rounded-md border border-neutral-200 text-black" />
                  {subjectErrors.name && <div className="text-sm text-red-600">{Array.isArray(subjectErrors.name) ? subjectErrors.name.join(' ') : String(subjectErrors.name)}</div>}
                </div>

                <div>
                  <input placeholder="Subject code" value={form.subject_code} onChange={(e) => { setForm({ ...form, subject_code: e.target.value }); setSubjectErrors(prev => ({ ...prev, subject_code: undefined })); }} className="p-2 rounded-md border border-neutral-200 text-black" />
                  {subjectErrors.subject_code && <div className="text-sm text-red-600">{Array.isArray(subjectErrors.subject_code) ? subjectErrors.subject_code.join(' ') : String(subjectErrors.subject_code)}</div>}
                </div>

                <div>
                  <select value={form.class_obj} onChange={(e) => { setForm({ ...form, class_obj: e.target.value }); setSubjectErrors(prev => ({ ...prev, class_obj: undefined })); }} className="p-2 rounded-md border border-neutral-200 text-black">
                    <option value="">— Select class —</option>
                    {classes.map(cl => <option key={cl.id} value={cl.id}>{cl.name || cl.class_code}</option>)}
                  </select>
                  {subjectErrors.class_obj && <div className="text-sm text-red-600">{Array.isArray(subjectErrors.class_obj) ? subjectErrors.class_obj.join(' ') : String(subjectErrors.class_obj)}</div>}
                </div>

                <div className="md:col-span-3">
                  <textarea placeholder="Short description" value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); setSubjectErrors(prev => ({ ...prev, description: undefined })); }} className="p-2 rounded-md border border-neutral-200 text-black w-full" rows={3} />
                  {subjectErrors.description && <div className="text-sm text-red-600">{Array.isArray(subjectErrors.description) ? subjectErrors.description.join(' ') : String(subjectErrors.description)}</div>}
                </div>

                <div>
                  <select value={form.instructor} onChange={(e) => { setForm({ ...form, instructor: e.target.value }); setSubjectErrors(prev => ({ ...prev, instructor: undefined })); }} className="p-2 rounded-md border border-neutral-200 text-black">
                    <option value="">— Select instructor —</option>
                    {instructors.map(ins => <option key={ins.id} value={ins.id}>{ins.full_name || ins.username}</option>)}
                  </select>
                  {subjectErrors.instructor && <div className="text-sm text-red-600">{Array.isArray(subjectErrors.instructor) ? subjectErrors.instructor.join(' ') : String(subjectErrors.instructor)}</div>}
                </div>

                <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2 rounded-md border text-sm bg-red-700 text-white">Cancel</button>
                  <button type="submit" disabled={subjectSaving} className={`px-4 py-2 rounded-md text-white ${subjectSaving ? 'bg-neutral-400' : 'bg-blue-600'}`}>{subjectSaving ? 'Adding...' : 'Add subject'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
