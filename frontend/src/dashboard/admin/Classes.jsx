import React, { useEffect, useState, useRef, useCallback } from 'react'
import { getClasses, getInstructors, addSubject, getClassEnrolledStudents } from '../../lib/api'
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
  const [instructors, setInstructors] = useState([])
  const toast = useToast()
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
      if (toast?.error) toast.error('Failed to load classes')
      else if (toast?.showToast) toast.showToast('Failed to load classes', { type: 'error' })
      else console.error('Failed to load classes')
    }finally{ setLoading(false) }
  }, [toast, showOnlyActive, user])

  useEffect(()=>{ loadClasses() }, [loadClasses])

  async function openAddSubjectModal(classId = ''){
    try{
      const ins = await getInstructors()
      setInstructors(Array.isArray(ins) ? ins : (ins && ins.results) ? ins.results : [])
    }catch{
      setInstructors([])
    }
    // prefill class selection if caller provided one
    setForm({ name: '', subject_code: '', instructor: '', class_obj: classId || '' })
    setModalOpen(true)
    setTimeout(()=>{ modalRef.current?.querySelector('input,select,button')?.focus() }, 20)
  }

  function closeModal(){ setModalOpen(false) }

  async function handleAddSubject(e){
    e.preventDefault()
  if (!form.name) return (toast?.error || toast?.showToast || console.error)('Subject name required')
  if (!form.description) return (toast?.error || toast?.showToast || console.error)('Subject description required')
  if (!form.class_obj) return (toast?.error || toast?.showToast || console.error)('Please select a class')
  if (!form.instructor) return (toast?.error || toast?.showToast || console.error)('Please select an instructor')
    // ensure numeric PKs are sent for foreign keys
    const payload = {
      name: form.name,
      subject_code: form.subject_code || undefined,
      description: form.description,
      class_obj: Number(form.class_obj),
      instructor: Number(form.instructor),
    }
    try{
      await addSubject(payload)
      if (toast?.success) toast.success('Subject added')
      else if (toast?.showToast) toast.showToast('Subject added', { type: 'success' })
      else console.log('Subject added')
  closeModal()
  await loadClasses()
    }catch(err){
      const d = err?.data
      if (d && typeof d === 'object'){
        // assemble readable message from field errors
        const parts = []
        Object.keys(d).forEach(k => {
          if (Array.isArray(d[k])) parts.push(`${k}: ${d[k].join(' ')}`)
          else parts.push(`${k}: ${String(d[k])}`)
        })
        const combined = parts.join(' | ')
        if (toast?.error) toast.error(combined)
        else if (toast?.showToast) toast.showToast(combined, { type: 'error' })
        else console.error(combined)
        return
      }
      const msg = err?.message || 'Failed to add subject'
      if (toast?.error) toast.error(msg)
      else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
      else console.error(msg)
    }
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
              </Card>
            </div>
          ))
        )}
      </div>

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
                <input placeholder="Subject name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                <input placeholder="Subject code" value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                <select value={form.class_obj} onChange={(e) => setForm({ ...form, class_obj: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black">
                  <option value="">— Select class —</option>
                  {classes.map(cl => <option key={cl.id} value={cl.id}>{cl.name || cl.class_code}</option>)}
                </select>
                <textarea placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black md:col-span-3" rows={3} />
                <select value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black">
                  <option value="">— Select instructor —</option>
                  {instructors.map(ins => <option key={ins.id} value={ins.id}>{ins.full_name || ins.username}</option>)}
                </select>

                <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2 rounded-md border text-sm bg-red-700 text-white">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm">Add subject</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
