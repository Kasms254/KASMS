import React, { useEffect, useState } from 'react'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'

export default function ClassNotices() {
  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [notices, setNotices] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ class_obj: '', subject: '', title: '', content: '', priority: 'medium', expiry_date: '', is_active: true })
  const [errors, setErrors] = useState({})
  const [editTarget, setEditTarget] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 10

  const PRIORITY_CLASSES = {
    low: 'bg-green-100 text-green-700',
    medium: 'bg-indigo-100 text-indigo-700',
    high: 'bg-amber-100 text-amber-700',
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        // Use paginated API with page parameter
        const params = new URLSearchParams({ page: currentPage, page_size: itemsPerPage })
        const res = await api.getMyClassNotices(params.toString())

        if (!mounted) return

        // Handle paginated response
        if (res && typeof res === 'object') {
          const list = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
          setNotices(list)
          setTotalCount(res.count || list.length)
          setTotalPages(Math.ceil((res.count || list.length) / itemsPerPage))
        } else {
          setNotices([])
          setTotalCount(0)
          setTotalPages(1)
        }
      } catch (err) {
        toast.error(err?.message || 'Failed to load class notices')
      } finally { if (mounted) setLoading(false) }
    }

    load()
    return () => { mounted = false }
  }, [toast, currentPage, itemsPerPage])

  useEffect(() => {
    let mounted = true
    async function loadClasses() {
      try {
        const res = await api.getMyClasses()
        const list = Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : [])
        if (mounted) setClasses(list)
      } catch (err) {
        console.debug('failed to load classes', err)
      }
    }
    loadClasses()
    return () => { mounted = false }
  }, [])

  // When a class is selected, fetch its subjects so instructor can
  // select the required subject for the notice.
  const auth = useAuth()

  useEffect(() => {
    let mounted = true
    async function loadSubjects() {
      const cls = form.class_obj
      if (!cls) { if (mounted) setSubjects([]); return }
      try {
        const res = await api.getClassSubjects(cls)
        // endpoint returns { class, count, subjects } — prefer that shape
        const raw = res && Array.isArray(res.subjects) ? res.subjects : (Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : []))
        // Filter to subjects taught by current instructor only
        const filtered = raw.filter(s => {
          try {
            // serializer may include instructor as id or object
            if (!auth || !auth.user) return false
            const uid = auth.user.id
            if (s.instructor == null) return false
            if (typeof s.instructor === 'object') return (s.instructor.id === uid || s.instructor.pk === uid)
            return String(s.instructor) === String(uid)
          } catch {
            return false
          }
        })
        if (mounted) setSubjects(filtered)
      } catch (err) {
        console.debug('failed to load subjects for class', err)
        if (mounted) setSubjects([])
      }
    }
    loadSubjects()
    return () => { mounted = false }
  }, [form.class_obj, auth])

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleCreate(e) {
    e && e.preventDefault()
    setErrors({})
    const localErrors = {}
    if (!form.class_obj) localErrors.class_obj = 'Select a class'
    if (!form.subject) localErrors.subject = 'Select a subject'
    if (!form.title || !form.title.trim()) localErrors.title = 'Title is required'
    if (!form.content || !form.content.trim()) localErrors.content = 'Content is required'

    // Validate dates are not in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (form.start_date) {
      const startDate = new Date(form.start_date)
      startDate.setHours(0, 0, 0, 0)
      if (startDate < today) {
        localErrors.start_date = 'Start date cannot be in the past'
      }
    }

    if (form.expiry_date) {
      const expiryDate = new Date(form.expiry_date)
      expiryDate.setHours(0, 0, 0, 0)
      if (expiryDate < today) {
        localErrors.expiry_date = 'Expiry date cannot be in the past'
      }
    }

    if (Object.keys(localErrors).length) { setErrors(localErrors); return }

    setSaving(true)
    try {
      const payload = { ...form }
      // Normalize FK values to primitive ids
      if (payload.class_obj && typeof payload.class_obj === 'object') payload.class_obj = payload.class_obj.id
      if (payload.subject && typeof payload.subject === 'object') payload.subject = payload.subject.id
      if (!payload.expiry_date) delete payload.expiry_date
      if (editTarget && (editTarget.id || editTarget.pk)) {
        const existingId = editTarget.id || editTarget.pk
        const updated = await api.updateClassNotice(existingId, payload)
        toast.success('Notice updated')
        // Reload from first page to reflect update
        setCurrentPage(1)
        // If backend returned a different id (it created a new object), remove old one and add the updated
        if (updated && (String(updated.id) !== String(existingId))) {
          setNotices(s => [updated, ...(s || []).filter(x => String(x.id) !== String(existingId))])
        } else {
          setNotices(s => s.map(x => (String(x.id) === String(updated.id) ? updated : x)))
        }
        setEditTarget(null)
      } else {
        const created = await api.createClassNotice(payload)
        toast.success('Class notice created')
        // Go to first page to see new notice
        setCurrentPage(1)
        // Prepend to list
        setNotices(s => [created, ...(s || [])])
      }
      setModalOpen(false)
  setForm({ class_obj: '', subject: '', title: '', content: '', priority: 'medium', expiry_date: '', is_active: true })
      try { window.dispatchEvent(new CustomEvent('notices:changed')) } catch (err) { console.debug('dispatch error', err) }
    } catch (err) {
      if (err && err.data && typeof err.data === 'object') {
        const serverErrors = {}
        for (const k of Object.keys(err.data)) serverErrors[k] = Array.isArray(err.data[k]) ? err.data[k].join(' ') : String(err.data[k])
        setErrors(serverErrors)
      }
      toast.error(err?.message || 'Failed to create class notice')
    } finally { setSaving(false) }
  }

  function openEdit(n) {
    // Normalize class and subject to primitive ids so the selects work correctly
    const classVal = n.class_obj ? (typeof n.class_obj === 'object' ? n.class_obj.id : n.class_obj) : ''
    const subjectVal = n.subject ? (typeof n.subject === 'object' ? n.subject.id : n.subject) : ''
    setEditTarget(n)
    setForm({
      class_obj: classVal,
      subject: subjectVal,
      title: n.title || '',
      content: n.content || '',
      priority: n.priority || 'medium',
      expiry_date: n.expiry_date || '',
      is_active: n.is_active === undefined ? true : !!n.is_active,
    })
    setErrors({})
    setModalOpen(true)
  }

  function promptDelete(n) {
    setDeleteTarget(n)
    setDeleteConfirmOpen(true)
  }

  async function performDelete() {
    if (!deleteTarget || !deleteTarget.id) return
    setDeleting(true)
    try {
      await api.deleteClassNotice(deleteTarget.id)
      setNotices(s => s.filter(x => x.id !== deleteTarget.id))
      toast.success('Notice deleted')
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
      // If this was the last notice on the page and we're not on page 1, go back one page
      if (notices.length === 1 && currentPage > 1) {
        setCurrentPage(p => p - 1)
      }
      try { window.dispatchEvent(new CustomEvent('notices:changed')) } catch (err) { console.debug('dispatch error', err) }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete notice')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="text-black w-full">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Class notices</h1>
          <div className="text-sm text-neutral-500">Post a notice to one of your classes</div>
        </div>
        <div className="text-right">
          <button onClick={() => { setModalOpen(true); setForm({ class_obj: '', subject: '', title: '', content: '', priority: 'medium', expiry_date: '', is_active: true }); setErrors({}); setEditTarget(null) }} className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition">Add class notice</button>
        </div>
      </header>

      <div>
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Your class notices</h3>
            <div className="text-sm text-neutral-500">{loading ? 'Loading…' : `${totalCount} total`}</div>
          </div>

          <div className="space-y-3">
            {!loading && notices.length === 0 && <div className="p-6 text-center text-neutral-500">No class notices yet</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {notices.map(n => (
                <article key={n.id || `${n.class_obj || 'c'}-${n.title}-${n.created_at || ''}`} className="p-4 border rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-black">{n.title}</h4>
                        <div className="text-xs text-neutral-500 mt-1">
                          <span className={`inline-flex items-center text-xs px-2 py-1 rounded ${PRIORITY_CLASSES[n.priority] || 'bg-neutral-100 text-neutral-700'}`}>{n.priority || 'medium'}</span>
                          <span className="mx-2">•</span>
                          <span>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`inline-block text-xs px-2 py-1 rounded ${n.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-700'}`}>{n.is_active ? 'Active' : 'Inactive'}</div>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-neutral-700">{n.content}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-neutral-500">Expiry: {n.expiry_date ? new Date(n.expiry_date).toLocaleDateString() : '—'}</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(n)} className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Edit</button>
                      <button onClick={() => promptDelete(n)} className="px-2 py-1 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 transition">Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-neutral-200">
                <div className="text-sm text-neutral-600">
                  Showing page {currentPage} of {totalPages} ({totalCount} total notices)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <div className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium">
                    {currentPage}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 w-full max-w-2xl">
            <div className="bg-white rounded-xl p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <h4 className="text-lg font-medium">Create class notice</h4>
                <button type="button" onClick={() => { setModalOpen(false) }} aria-label="Close" className="text-neutral-500 hover:text-neutral-700 p-1 rounded">✕</button>
              </div>

              {errors && (errors.non_field_errors || errors.detail) && (
                <div className="mt-3 p-3 bg-rose-50 text-rose-700 rounded">{errors.non_field_errors || errors.detail}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Class</label>
                  <select value={form.class_obj} onChange={e => { update('class_obj', e.target.value); if (errors.class_obj) setErrors(prev => ({ ...prev, class_obj: undefined })) }} className={`mt-2 p-2 rounded-md border w-full bg-white ${errors.class_obj ? 'border-rose-500' : ''}`}>
                    <option value="">Select class</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.class_name || `${c.course?.name || ''} — ${c.name || c.class_name || ''}`}</option>
                    ))}
                  </select>
                  {errors.class_obj && <div className="text-rose-600 text-sm mt-1">{errors.class_obj}</div>}
                </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Subject</label>
                    <select value={form.subject} onChange={e => { update('subject', e.target.value); if (errors.subject) setErrors(prev => ({ ...prev, subject: undefined })) }} className={`mt-2 p-2 rounded-md border w-full bg-white ${errors.subject ? 'border-rose-500' : ''}`}>
                      <option value="">Select subject</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name || s.title || `Subject ${s.id}`}</option>
                      ))}
                    </select>
                    {errors.subject && <div className="text-rose-600 text-sm mt-1">{errors.subject}</div>}
                  </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input value={form.title} onChange={e => { update('title', e.target.value); if (errors.title) setErrors(prev => ({ ...prev, title: undefined })) }} className={`mt-2 p-3 rounded-md border w-full bg-white ${errors.title ? 'border-rose-500' : ''}`} placeholder="Short headline" />
                  {errors.title && <div className="text-rose-600 text-sm mt-1">{errors.title}</div>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Content</label>
                  <textarea value={form.content} onChange={e => { update('content', e.target.value); if (errors.content) setErrors(prev => ({ ...prev, content: undefined })) }} rows={6} className={`mt-2 p-3 rounded-md border w-full bg-white ${errors.content ? 'border-rose-500' : ''}`} placeholder="Message to class" />
                  {errors.content && <div className="text-rose-600 text-sm mt-1">{errors.content}</div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Priority</label>
                    <select value={form.priority} onChange={e => update('priority', e.target.value)} className="mt-2 p-2 rounded-md border w-full bg-white">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Expiry / Event date</label>
                    <input type="date" value={form.expiry_date} onChange={e => update('expiry_date', e.target.value)} min={new Date().toISOString().split('T')[0]} className="mt-2 p-2 rounded-md border w-full bg-white" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!form.is_active} onChange={e => update('is_active', e.target.checked)} />
                    <span className="text-sm text-gray-600">Active</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setForm({ class_obj: '', subject: '', title: '', content: '', priority: 'medium', expiry_date: '', is_active: true }); setErrors({}); setEditTarget(null) }} className="px-3 py-2 rounded-md border">Reset</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{saving ? 'Saving…' : (editTarget ? 'Update notice' : 'Publish notice')}</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setDeleteConfirmOpen(false); setDeleteTarget(null) }} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-6 shadow-2xl">
              <h4 className="text-lg font-medium">Delete notice</h4>
              <p className="text-sm text-neutral-600 mt-2">Are you sure you want to delete the notice <strong>{deleteTarget?.title}</strong>? This action cannot be undone.</p>
              <div className="mt-4 flex justify-end gap-3">
                <button onClick={() => { setDeleteConfirmOpen(false); setDeleteTarget(null) }} className="px-3 py-2 rounded-md border">Cancel</button>
                <button onClick={performDelete} disabled={deleting} className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deleting ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
