import { useEffect, useState, useMemo } from 'react'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'
import ModernDatePicker from '../../components/ModernDatePicker'

export default function Notices() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [notices, setNotices] = useState([])
  const [form, setForm] = useState({ title: '', content: '', priority: 'medium', expiry_date: '', is_active: true })
  const [recipient, setRecipient] = useState('all')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [errors, setErrors] = useState({})

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const PRIORITY_CLASSES = {
    low: 'bg-green-100 text-green-700',
    medium: 'bg-indigo-100 text-indigo-700',
    high: 'bg-amber-100 text-amber-700',
    urgent: 'bg-rose-100 text-rose-700',
  }

  // Check if a notice has expired based on expiry_date
  const isExpired = (notice) => {
    if (!notice.expiry_date) return false
    const now = new Date()
    const expiryDate = new Date(notice.expiry_date)
    // Set to end of day for expiry date
    expiryDate.setHours(23, 59, 59, 999)
    return now > expiryDate
  }

  // Check if any filter is active (search or filter inputs are being used)
  const hasActiveFilters = useMemo(() => {
    return searchTerm.trim() !== '' ||
           filterPriority !== 'all' ||
           filterStatus !== 'all' ||
           filterDateFrom !== '' ||
           filterDateTo !== ''
  }, [searchTerm, filterPriority, filterStatus, filterDateFrom, filterDateTo])

  // Filtered notices based on search and filters
  const filteredNotices = useMemo(() => {
    let filtered = [...notices]

    // If no filters are active, hide inactive notices by default
    if (!hasActiveFilters) {
      filtered = filtered.filter(n => {
        const expired = isExpired(n)
        const effectivelyActive = n.is_active && !expired
        return effectivelyActive
      })
    }

    // Search by title or content
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase()
      filtered = filtered.filter(n =>
        (n.title || '').toLowerCase().includes(query) ||
        (n.content || '').toLowerCase().includes(query)
      )
    }

    // Filter by priority
    if (filterPriority !== 'all') {
      filtered = filtered.filter(n => n.priority === filterPriority)
    }

    // Filter by status (active/inactive)
    // A notice is considered inactive if either:
    // 1. is_active is false, OR
    // 2. The expiry date has passed
    if (filterStatus !== 'all') {
      const isActive = filterStatus === 'active'
      filtered = filtered.filter(n => {
        const expired = isExpired(n)
        const effectivelyActive = n.is_active && !expired
        return effectivelyActive === isActive
      })
    }

    // Filter by date range (created date)
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom)
      fromDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(n => {
        if (!n.created_at) return false
        const createdDate = new Date(n.created_at)
        return createdDate >= fromDate
      })
    }

    if (filterDateTo) {
      const toDate = new Date(filterDateTo)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(n => {
        if (!n.created_at) return false
        const createdDate = new Date(n.created_at)
        return createdDate <= toDate
      })
    }

    return filtered
  }, [notices, searchTerm, filterPriority, filterStatus, filterDateFrom, filterDateTo, hasActiveFilters])

  // Clear all filters
  function clearFilters() {
    setSearchTerm('')
    setFilterPriority('all')
    setFilterStatus('all')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await api.getNotices()
        const list = Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : [])
        if (!mounted) return
        setNotices(list)
      } catch (err) {
        toast.error(err?.message || 'Failed to load notices')
      } finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [toast])

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Backend does not support role-targeting yet. If recipient != 'all', show confirm modal.
  async function handleCreate(e) {
    e && e.preventDefault()
    // clear previous errors
    setErrors({})

    // client-side validation
    const localErrors = {}
    if (!form.title || !form.title.trim()) localErrors.title = 'Title is required'
    if (!form.content || !form.content.trim()) localErrors.content = 'Content is required'
    if (Object.keys(localErrors).length) {
      setErrors(localErrors)
      return
    }

    if (recipient !== 'all') {
      // open confirmation modal that informs admin that backend will publish to all
      setConfirmOpen(true)
      return
    }

    await doCreate()
  }

  async function doCreate() {
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.expiry_date) delete payload.expiry_date
      // Note: 'recipient' is not sent because backend currently doesn't support it.
      if (editTarget && editTarget.id) {
        const updated = await api.updateNotice(editTarget.id, payload)
        toast.success('Notice updated')
        setNotices(s => s.map(x => (x.id === updated.id ? updated : x)))
          // notify other parts of the app (calendar) that notices changed
        try { window.dispatchEvent(new CustomEvent('notices:changed')) } catch (err) { console.debug('dispatch error', err) }
        // Also dispatch a targeted edit event so creators see an immediate
        // notification in the bell (client-side). Include the updated notice
        // in the event detail so listeners can show a small notification.
        try { window.dispatchEvent(new CustomEvent('notice:edited', { detail: updated })) } catch (err) { console.debug('dispatch error', err) }
      } else {
        const created = await api.createNotice(payload)
        toast.success('Notice created')
        setNotices(s => [created, ...s])
    try { window.dispatchEvent(new CustomEvent('notices:changed')) } catch (err) { console.debug('dispatch error', err) }
      }
      setForm({ title: '', content: '', priority: 'medium', expiry_date: '', is_active: true })
      setRecipient('all')
      // close modal on success
      setModalOpen(false)
      setEditTarget(null)
    } catch (err) {
      // Try to surface server-side validation errors in the modal form
      if (err && err.data && typeof err.data === 'object') {
        // DRF validation errors often come as { field: ["err"] }
        const serverErrors = {}
        for (const k of Object.keys(err.data)) {
          const val = err.data[k]
          serverErrors[k] = Array.isArray(val) ? val.join(' ') : String(val)
        }
        setErrors(serverErrors)
      }
      toast.error(err?.message || (err && err.data) ? JSON.stringify(err.data) : (editTarget ? 'Failed to update notice' : 'Failed to create notice'))
    } finally { setSaving(false); setConfirmOpen(false) }
  }

  function openEdit(n) {
    setEditTarget(n)
    setForm({
      title: n.title || '',
      content: n.content || '',
      priority: n.priority || 'medium',
      expiry_date: n.expiry_date || '',
      is_active: n.is_active === undefined ? true : !!n.is_active,
    })
    setRecipient('all')
    setErrors({})
    setModalOpen(true)
  }

  // Prompt delete: open confirmation modal
  function promptDelete(n) {
    setDeleteTarget(n)
    setDeleteConfirmOpen(true)
  }

  // Perform delete after confirmation
  async function performDelete() {
    if (!deleteTarget || !deleteTarget.id) return
    setDeleting(true)
    try {
      await api.deleteNotice(deleteTarget.id)
      setNotices(s => s.filter(x => x.id !== deleteTarget.id))
      toast.success('Notice deleted')
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
  try { window.dispatchEvent(new CustomEvent('notices:changed')) } catch (err) { console.debug('dispatch error', err) }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete notice')
    } finally {
      setDeleting(false)
    }
  }

  return (
  <div className="text-black w-full">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Notices</h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Manage and publish notices to users</p>
        </div>
        <div className="text-right">
          <button onClick={() => { setModalOpen(true); setForm({ title: '', content: '', priority: 'medium', expiry_date: '', is_active: true }); setRecipient('all'); setErrors({}); setEditTarget(null) }} className="w-full sm:w-auto px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Add notice</button>
        </div>
      </header>

      {/* Search and Filter Section */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-5 mb-4 sm:mb-6">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by title or content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Priority Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Date From */}
            <ModernDatePicker
              label="Created From"
              value={filterDateFrom}
              onChange={(value) => setFilterDateFrom(value)}
              placeholder="Select start date"
            />

            {/* Date To */}
            <ModernDatePicker
              label="Created To"
              value={filterDateTo}
              onChange={(value) => setFilterDateTo(value)}
              placeholder="Select end date"
            />
          </div>

          {/* Filter Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-neutral-600">
              Showing {filteredNotices.length} of {notices.length} notices
            </div>
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Form modal for creating a notice */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 w-full max-w-2xl">
            <div className="bg-white rounded-xl p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <h4 className="text-lg font-medium">{editTarget ? 'Edit notice' : 'Create notice'}</h4>
                <button type="button" onClick={() => { setModalOpen(false); setEditTarget(null) }} aria-label="Close" className="text-neutral-500 hover:text-neutral-700 p-1 rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* top-level server/non-field errors */}
              {errors && (errors.non_field_errors || errors.detail || errors.__all__ || errors.non_field) && (
                <div className="mt-3 p-3 bg-rose-50 text-rose-700 rounded">{errors.non_field_errors || errors.detail || errors.__all__ || errors.non_field}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input value={form.title} onChange={e => { update('title', e.target.value); if (errors && errors.title) setErrors(prev => ({ ...prev, title: undefined })) }} className={`mt-2 p-3 rounded-md border w-full bg-white ${errors.title ? 'border-rose-500' : ''}`} placeholder="Short headline" />
                  {errors.title && <div className="text-rose-600 text-sm mt-1">{errors.title}</div>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Content</label>
                  <textarea value={form.content} onChange={e => { update('content', e.target.value); if (errors && errors.content) setErrors(prev => ({ ...prev, content: undefined })) }} rows={6} className={`mt-2 p-3 rounded-md border w-full bg-white ${errors.content ? 'border-rose-500' : ''}`} placeholder="Message to users" />
                  {errors.content && <div className="text-rose-600 text-sm mt-1">{errors.content}</div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Priority</label>
                    <select value={form.priority} onChange={e => update('priority', e.target.value)} className="mt-2 p-2 rounded-md border w-full bg-white">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    {errors.priority && <div className="text-rose-600 text-sm mt-1">{errors.priority}</div>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Expiry / Event date</label>
                    <input type="date" value={form.expiry_date} onChange={e => update('expiry_date', e.target.value)} className="mt-2 p-2 rounded-md border w-full bg-white" />
                    {errors.expiry_date && <div className="text-rose-600 text-sm mt-1">{errors.expiry_date}</div>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Recipient</label>
                  <select value={recipient} onChange={e => setRecipient(e.target.value)} className="mt-2 p-2 rounded-md border w-full bg-white">
                    <option value="all">All users</option>
                    <option value="students">Students</option>
                    <option value="instructors">Instructors</option>
                  </select>
                  {recipient !== 'all' && (
                    <div className="mt-2 text-xs text-amber-700">Note: targeted delivery is not yet implemented on the backend; selecting this will publish the notice to all users. You will be prompted to confirm.</div>
                  )}
                  {errors.recipient && <div className="text-rose-600 text-sm mt-1">{errors.recipient}</div>}
                </div>

                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!form.is_active} onChange={e => update('is_active', e.target.checked)} />
                    <span className="text-sm text-gray-600">Active</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setForm({ title: '', content: '', priority: 'medium', expiry_date: '', is_active: true }); setRecipient('all'); setErrors({}); setEditTarget(null) }} className="px-3 py-2 rounded-md border">Reset</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 text-white">{saving ? 'Saving…' : (editTarget ? 'Update notice' : 'Publish notice')}</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      <div>
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Notices</h3>
          </div>

          <div className="space-y-3">
            {loading && <div className="p-6 text-center text-neutral-500">Loading…</div>}
            {!loading && filteredNotices.length === 0 && notices.length === 0 && <div className="p-6 text-center text-neutral-500">No notices yet</div>}
            {!loading && filteredNotices.length === 0 && notices.length > 0 && <div className="p-6 text-center text-neutral-500">No notices match your filters</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredNotices.map(n => {
                const expired = isExpired(n)
                const effectivelyActive = n.is_active && !expired

                return (
                <article key={n.id} className={`p-4 border rounded-lg flex flex-col justify-between ${expired ? 'bg-gray-50 opacity-75' : ''}`}>
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-black">{n.title}</h4>
                        <div className="text-xs text-neutral-500 mt-1">
                          <span className={`inline-flex items-center text-xs px-2 py-1 rounded ${PRIORITY_CLASSES[n.priority] || 'bg-neutral-100 text-neutral-700'}`}>{n.priority_display || n.priority}</span>
                          <span className="mx-2">•</span>
                          <span>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col gap-1">
                        <div className={`inline-block text-xs px-2 py-1 rounded ${effectivelyActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {effectivelyActive ? 'Active' : 'Inactive'}
                        </div>
                        {expired && (
                          <div className="inline-block text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                            Expired
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-neutral-700">{n.content}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-neutral-500">
                      <span className={expired ? 'text-red-600 font-medium' : ''}>
                        Expiry: {n.expiry_date ? new Date(n.expiry_date).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(n)} className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Edit</button>
                      <button onClick={() => promptDelete(n)} className="px-2 py-1 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 transition">Delete</button>
                    </div>
                  </div>
                </article>
              )})}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm modal when recipient != all */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-6 shadow-2xl">
              <h4 className="text-lg font-medium">Confirm targeted notice</h4>
              <p className="text-sm text-neutral-600 mt-2">You selected <strong>{recipient}</strong> as recipient. The backend currently does not support sending notices to specific roles — publishing will deliver this notice to all users. Do you want to continue?</p>
              <div className="mt-4 flex justify-end gap-3">
                <button onClick={() => setConfirmOpen(false)} className="px-3 py-2 rounded-md border">Cancel</button>
                <button onClick={doCreate} className="px-4 py-2 rounded-md bg-indigo-600 text-white">Publish to all</button>
              </div>
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
