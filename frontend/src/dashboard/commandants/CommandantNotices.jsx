import { useEffect, useState, useMemo, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import ModernDatePicker from '../../components/ModernDatePicker'
import {
  getCommandantNotices,
  createCommandantNotice,
  updateCommandantNotice,
  deleteCommandantNotice,
  getMyCommandantNotices,
} from '../../lib/api'
import useToast from '../../hooks/useToast'

const PRIORITY_CLASSES = {
  low: 'bg-fill-green-100 text-mark-green-700',
  medium: 'bg-fill-indigo-100 text-mark-indigo-700',
  high: 'bg-fill-amber-100 text-mark-amber-700',
  urgent: 'bg-fill-rose-100 text-mark-rose-700',
  normal: 'bg-surface-2 text-fg-muted',
}

const TARGET_ROLE_LABELS = {
  all: 'All',
  student: 'Students',
  instructor: 'Instructors',
  admin: 'Admin',
  commandant: 'Commandant',
  chief_instructor: 'Chief Instructor',
}

const DEFAULT_FORM = {
  title: '',
  content: '',
  priority: 'medium',
  target_role: 'all',
  expiry_date: '',
  is_active: true,
}

export default function CommandantNotices() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [notices, setNotices] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTargetRole, setFilterTargetRole] = useState('')
  const [filterMyNotices, setFilterMyNotices] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const itemsPerPage = 10

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingNotice, setEditingNotice] = useState(null) // null = create, object = edit
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [errors, setErrors] = useState({})

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const toastSuccess = useCallback((msg) => {
    toast?.success?.(msg) || toast?.showToast?.(msg, { type: 'success' })
  }, [toast])

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM })
    setErrors({})
  }

  const openCreateModal = () => {
    setEditingNotice(null)
    resetForm()
    setModalOpen(true)
  }

  const openEditModal = (notice) => {
    setEditingNotice(notice)
    setForm({
      title: notice.title || '',
      content: notice.content || '',
      priority: notice.priority || 'medium',
      target_role: notice.target_role || 'all',
      expiry_date: notice.expiry_date || '',
      is_active: notice.is_active !== false,
    })
    setErrors({})
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingNotice(null)
    resetForm()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.title?.trim()) newErrors.title = 'Title is required'
    if (!form.content?.trim()) newErrors.content = 'Content is required'
    if (form.expiry_date) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (new Date(form.expiry_date) < today) {
        newErrors.expiry_date = 'Expiry date cannot be in the past'
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        priority: form.priority,
        target_role: form.target_role,
        expiry_date: form.expiry_date || null,
        is_active: form.is_active,
      }

      if (editingNotice) {
        await updateCommandantNotice(editingNotice.id, payload)
        toastSuccess('Notice updated successfully')
      } else {
        await createCommandantNotice(payload)
        toastSuccess('Notice created successfully')
      }

      closeModal()
      setRefreshKey(k => k + 1)
    } catch (err) {
      const errData = err?.response?.data || err
      if (errData && typeof errData === 'object' && !Array.isArray(errData)) {
        setErrors(errData)
        if (errData.non_field_errors) {
          reportError(Array.isArray(errData.non_field_errors) ? errData.non_field_errors[0] : errData.non_field_errors)
        }
      } else {
        reportError(err?.message || `Failed to ${editingNotice ? 'update' : 'create'} notice`)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCommandantNotice(deleteTarget.id)
      toastSuccess('Notice deleted successfully')
      setDeleteTarget(null)
      setRefreshKey(k => k + 1)
    } catch (err) {
      reportError(err?.message || 'Failed to delete notice')
    } finally {
      setDeleting(false)
    }
  }

  const hasActiveFilters = useMemo(() => (
    searchTerm.trim() !== '' || filterPriority !== '' || filterStatus !== '' || filterTargetRole !== '' || filterMyNotices
  ), [searchTerm, filterPriority, filterStatus, filterTargetRole, filterMyNotices])

  function clearFilters() {
    setSearchTerm('')
    setFilterPriority('')
    setFilterStatus('')
    setFilterTargetRole('')
    setFilterMyNotices(false)
    setCurrentPage(1)
  }

  const isExpired = (notice) => {
    if (!notice.expiry_date) return false
    const [y, m, d] = notice.expiry_date.split('-').map(Number)
    return new Date() > new Date(y, m - 1, d, 23, 59, 59)
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: currentPage, page_size: itemsPerPage })
        if (searchTerm.trim()) params.append('search', searchTerm.trim())
        if (filterPriority) params.append('priority', filterPriority)
        if (filterStatus) params.append('is_active', filterStatus)
        if (filterTargetRole) params.append('target_role', filterTargetRole)

        const res = filterMyNotices
          ? await getMyCommandantNotices(params.toString())
          : await getCommandantNotices(params.toString())

        if (!mounted) return
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
        reportError(err?.message || 'Failed to load notices')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [currentPage, itemsPerPage, searchTerm, filterPriority, filterStatus, filterTargetRole, filterMyNotices, reportError, refreshKey])

  return (
    <div className="text-fg w-full">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Notices</h1>
          <p className="text-xs sm:text-sm text-fg-soft mt-1">School-wide announcements and notices</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-fill-indigo-600 text-white rounded-lg hover:bg-fill-indigo-700 transition text-sm font-medium whitespace-nowrap"
        >
          <LucideIcons.Plus size={18} />
          Create Notice
        </button>
      </header>

      {/* Filters */}
      <div className="bg-surface rounded-xl shadow p-4 sm:p-5 mb-4 sm:mb-6">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search by title or content..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            className="w-full px-3 py-2 text-sm border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-edge-indigo-200"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-fg-body mb-2">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => { setFilterPriority(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-fg bg-surface border border-line-strong rounded-lg focus:ring-2 focus:ring-edge-indigo-500 focus:border-edge-indigo-500 transition-colors"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-body mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-fg bg-surface border border-line-strong rounded-lg focus:ring-2 focus:ring-edge-indigo-500 focus:border-edge-indigo-500 transition-colors"
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-body mb-2">Target Audience</label>
              <select
                value={filterTargetRole}
                onChange={(e) => { setFilterTargetRole(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-fg bg-surface border border-line-strong rounded-lg focus:ring-2 focus:ring-edge-indigo-500 focus:border-edge-indigo-500 transition-colors"
              >
                <option value="">All Audiences</option>
                <option value="all">All</option>
                <option value="commandant">Commandant</option>
                <option value="chief_instructor">Chief Instructor</option>
                <option value="admin">Admin</option>
                <option value="instructor">Instructors</option>
                <option value="student">Students</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span className="text-xs sm:text-sm text-fg-muted">
                Showing {notices.length} of {totalCount} notices
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  checked={filterMyNotices}
                  onChange={(e) => { setFilterMyNotices(e.target.checked); setCurrentPage(1) }}
                  className="w-4 h-4 rounded border-line-strong focus:ring-edge-indigo-500"
                />
                <span className="text-fg-body font-medium">My Notices</span>
              </label>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm rounded-md bg-surface-3 text-fg-body hover:bg-surface-4 transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notice List */}
      <div className="bg-surface rounded-xl shadow p-5">
        <div className="space-y-3">
          {loading && <div className="p-6 text-center text-fg-soft">Loading…</div>}
          {!loading && notices.length === 0 && (
            <div className="p-6 text-center text-fg-soft">
              {hasActiveFilters ? 'No notices match your filters' : 'No notices yet'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {notices.map((n) => {
              const expired = isExpired(n)
              const effectivelyActive = n.is_active && !expired
              return (
                <article
                  key={n.id}
                  className={`p-4 border rounded-lg flex flex-col justify-between ${expired ? 'bg-canvas opacity-75' : ''}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-fg">{n.title}</h4>
                        <div className="text-xs text-fg-soft mt-1 flex flex-wrap items-center gap-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded ${PRIORITY_CLASSES[n.priority] || 'bg-surface-2 text-fg-body'}`}>
                            {n.priority_display || n.priority}
                          </span>
                          <span>•</span>
                          <span>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs px-2 py-1 rounded ${effectivelyActive ? 'bg-fill-green-100 text-mark-green-700' : 'bg-fill-red-100 text-mark-red-700'}`}>
                          {effectivelyActive ? 'Active' : 'Inactive'}
                        </span>
                        {expired && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-fill-amber-100 text-mark-amber-700">
                            Expired
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-fg-body">{n.content}</p>
                    {(n.created_by_rank || n.created_by_name || n.created_by_svc_number) && (
                      <p className="mt-2 text-xs text-fg-faint">
                        By: {[n.created_by_rank, n.created_by_name, n.created_by_svc_number].filter(Boolean).join(' ')}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="text-xs text-fg-soft flex flex-wrap items-center gap-2">
                      <span className={expired ? 'text-mark-red-600 font-medium' : ''}>
                        Expiry: {n.expiry_date ? n.expiry_date : '—'}
                      </span>
                      {n.target_role && n.target_role !== 'all' && (
                        <span className="bg-fill-blue-50 text-mark-blue-700 px-2 py-0.5 rounded text-[11px]">
                          {TARGET_ROLE_LABELS[n.target_role] || n.target_role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(n)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-fill-indigo-50 text-mark-indigo-700 hover:bg-fill-indigo-100 transition"
                      >
                        <LucideIcons.Pencil size={13} />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(n)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-fill-red-50 text-mark-red-700 hover:bg-fill-red-100 transition"
                      >
                        <LucideIcons.Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-line">
              <div className="text-sm text-fg-muted">
                Page {currentPage} of {totalPages} ({totalCount} total)
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 rounded-md bg-surface border border-line-strong text-fg-body text-sm hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 rounded-md bg-surface border border-line-strong text-fg-body text-sm hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
                <div className="px-4 py-2 bg-fill-indigo-600 text-white rounded-md text-sm font-medium">{currentPage}</div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 rounded-md bg-surface border border-line-strong text-fg-body text-sm hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 rounded-md bg-surface border border-line-strong text-fg-body text-sm hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-inverse bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-fg">
                {editingNotice ? 'Edit Notice' : 'Create New Notice'}
              </h2>
              <button onClick={closeModal} className="text-fg-soft hover:text-fg-body transition">
                <LucideIcons.X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-fg-body mb-2">
                  Title <span className="text-mark-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateForm('title', e.target.value)}
                  placeholder="Notice title"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${errors.title ? 'border-edge-red-500 bg-fill-red-50' : 'border-line-strong focus:ring-edge-indigo-500'}`}
                />
                {errors.title && <p className="text-mark-red-600 text-sm mt-1">{errors.title}</p>}
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-fg-body mb-2">
                  Content <span className="text-mark-red-500">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => updateForm('content', e.target.value)}
                  placeholder="Notice content"
                  rows={5}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition resize-none ${errors.content ? 'border-edge-red-500 bg-fill-red-50' : 'border-line-strong focus:ring-edge-indigo-500'}`}
                />
                {errors.content && <p className="text-mark-red-600 text-sm mt-1">{errors.content}</p>}
              </div>

              {/* Priority + Target Audience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg-body mb-2">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => updateForm('priority', e.target.value)}
                    className="w-full px-4 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-edge-indigo-500 transition"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-body mb-2">Target Audience</label>
                  <select
                    value={form.target_role}
                    onChange={(e) => updateForm('target_role', e.target.value)}
                    className="w-full px-4 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-edge-indigo-500 transition"
                  >
                    <option value="all">All</option>
                    <option value="commandant">Commandant</option>
                    <option value="chief_instructor">Chief Instructor</option>
                    <option value="admin">Admin</option>
                    <option value="instructor">Instructors</option>
                    <option value="student">Students</option>
                  </select>
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-sm font-medium text-fg-body mb-2">
                  Expiry Date <span className="text-fg-soft text-xs">(Optional)</span>
                </label>
                <ModernDatePicker
                  value={form.expiry_date}
                  onChange={(date) => updateForm('expiry_date', date)}
                  placeholder="Select expiry date"
                  minDate={new Date().toISOString().split('T')[0]}
                />
                {errors.expiry_date && <p className="text-mark-red-600 text-sm mt-1">{errors.expiry_date}</p>}
              </div>

              {/* Is Active */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => updateForm('is_active', e.target.checked)}
                    className="w-4 h-4 border-line-strong rounded focus:ring-2 focus:ring-edge-indigo-500"
                  />
                  <span className="text-sm font-medium text-fg-body">Active</span>
                  <span className="text-xs text-fg-soft">(Inactive notices won't be visible)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-6 py-2 border border-line-strong rounded-lg text-fg-body font-medium hover:bg-canvas transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-fill-indigo-600 text-white rounded-lg font-medium hover:bg-fill-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {editingNotice ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <LucideIcons.Save size={18} />
                      {editingNotice ? 'Save Changes' : 'Create Notice'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-inverse bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-fill-red-100 flex items-center justify-center shrink-0">
                <LucideIcons.Trash2 size={20} className="text-mark-red-600" />
              </div>
              <h2 className="text-lg font-bold text-fg">Delete Notice</h2>
            </div>
            <p className="text-sm text-fg-muted mb-2">Are you sure you want to delete this notice?</p>
            <p className="text-sm font-medium text-fg mb-6 bg-canvas px-3 py-2 rounded border">
              "{deleteTarget.title}"
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-5 py-2 border border-line-strong rounded-lg text-fg-body font-medium hover:bg-canvas transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 bg-fill-red-600 text-white rounded-lg font-medium hover:bg-fill-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <LucideIcons.Trash2 size={16} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
