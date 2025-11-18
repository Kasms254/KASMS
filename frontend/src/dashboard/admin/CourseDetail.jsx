import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCourses, getClasses, addClass, getInstructors } from '../../lib/api'
import useToast from '../../hooks/useToast'
import Card from '../../components/Card'

export default function CourseDetail(){
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [course, setCourse] = useState(null)
  const [classes, setClasses] = useState([])
  const [instructors, setInstructors] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [classForm, setClassForm] = useState({ name: '', instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
  const [classErrors, setClassErrors] = useState({})
  const toast = useToast()
  const modalRef = useRef(null)

  const reportError = useCallback((m)=>{ if (!m) return; if (toast?.error) return toast.error(m); if (toast?.showToast) return toast.showToast(m, { type: 'error' }); console.error(m) }, [toast])
  const reportSuccess = useCallback((m)=>{ if (!m) return; if (toast?.success) return toast.success(m); if (toast?.showToast) return toast.showToast(m, { type: 'success' }); console.log(m) }, [toast])

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

  useEffect(()=>{ loadClasses() }, [id])

  async function loadClasses(){
    try{
      const data = await getClasses(`course=${id}`)
      setClasses(Array.isArray(data) ? data : (data && data.results) ? data.results : [])
    }catch(e){ reportError('Failed to load classes') }
  }

  async function openAddModal(){
    try{
      const ins = await getInstructors()
      setInstructors(Array.isArray(ins) ? ins : (ins && ins.results) ? ins.results : [])
    }catch(e){ setInstructors([]) }
    setModalOpen(true)
  }

  async function handleAddClass(e){
    e.preventDefault()
    setClassErrors({})
    if (!classForm.name) return reportError('Class name required')
    if (classForm.start_date && classForm.end_date && classForm.end_date <= classForm.start_date) return reportError('End must be after start')
    const payload = { ...classForm, course: id, instructor: classForm.instructor || null, capacity: Number(classForm.capacity) || 30 }
    try{
      await addClass(payload)
      reportSuccess('Class added')
      setClassForm({ name: '', instructor: '', start_date: '', end_date: '', capacity: 30, is_active: true })
      setModalOpen(false)
      await loadClasses()
    }catch(err){
      const d = err?.data
      if (d && typeof d === 'object'){
        const fieldErrors = {}
        Object.keys(d).forEach(k => { if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' '); else fieldErrors[k] = String(d[k]) })
        if (Object.keys(fieldErrors).length){ setClassErrors(fieldErrors); return }
      }
      reportError(err?.message || 'Failed to add class')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-black">{course?.name || `Course ${id}`}</h2>
          <p className="text-sm text-neutral-500">Code: {course?.code} — {course?.description}</p>
        </div>
        <div>
          <button onClick={() => navigate('/list/courses')} className="px-3 py-1 rounded-md border bg-green-600">Back</button>
          <button onClick={openAddModal} className="ml-2 bg-blue-600 text-white px-3 py-1 rounded-md">Add class</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {classes.length === 0 ? (
          <div className="text-sm text-neutral-400">No classes yet</div>
        ) : (
          classes.map((c) => (
            <div key={c.id} className="relative">
              <Card
                title={c.class_code || c.name}
                value={c.name}
                badge={`${c.subjects_count ?? 0} subjects`}
                icon="Layers"
                accent="bg-emerald-500"
                colored={true}
              >
                <div>Instructor: {c.instructor_name || c.instructor || 'TBD'}</div>
                <div className="mt-1">{c.start_date || ''} → {c.end_date || ''}</div>
              </Card>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add class to {course?.name || ''}</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setModalOpen(false)} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
              </div>
              <form onSubmit={handleAddClass} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                <input placeholder="Class name" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                <select value={classForm.instructor} onChange={(e) => setClassForm({ ...classForm, instructor: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black">
                  <option value="">— Select instructor —</option>
                  {instructors.map(ins => <option key={ins.id} value={ins.id}>{ins.full_name || ins.username}</option>)}
                </select>
                <input type="number" min={1} value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" placeholder="Capacity" />
                <input type="date" value={classForm.start_date} onChange={(e) => setClassForm({ ...classForm, start_date: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                <input type="date" value={classForm.end_date} onChange={(e) => setClassForm({ ...classForm, end_date: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={classForm.is_active} onChange={(e) => setClassForm({ ...classForm, is_active: e.target.checked })} />
                  <span className="text-sm text-neutral-600">Active</span>
                </label>

                <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md border text-sm bg-red-700 text-white">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm">Add class</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
