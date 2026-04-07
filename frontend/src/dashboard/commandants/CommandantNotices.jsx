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
  low: 'bg-green-100 text-green-700',
  medium: 'bg-indigo-100 text-indigo-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-rose-100 text-rose-700',
  normal: 'bg-neutral-100 text-neutral-600',
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
      expiry_date: notice.expiry_date ? notice.expiry_date.split('T')[0] : '',
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
    const expiry = new Date(notice.expiry_date)
    expiry.setHours(23, 59, 59, 999)
    return new Date() > expiry
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
    <div className="text-black w-full">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Notices</h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">School-wide announcements and notices</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium whitespace-nowrap"
        >
          <LucideIcons.Plus size={18} />
          Create Notice
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-5 mb-4 sm:mb-6">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search by title or content..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => { setFilterPriority(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Target Audience</label>
              <select
                value={filterTargetRole}
                onChange={(e) => { setFilterTargetRole(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              >
                <option value="">All Audiences</option>
                <option value="all">All</option>
                <option value="student">Students</option>
                <option value="instructor">Instructors</option>
                <option value="admin">Admin</option>
                <option value="commandant">Commandant</option>
                <option value="chief_instructor">Chief Instructor</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span className="text-xs sm:text-sm text-neutral-600">
                Showing {notices.length} of {totalCount} notices
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input
                  type="checkbox"
                  checked={filterMyNotices}
                  onChange={(e) => { setFilterMyNotices(e.target.checked); setCurrentPage(1) }}
                  className="w-4 h-4 rounded border-neutral-300 focus:ring-indigo-500"
                />
                <span className="text-neutral-700 font-medium">My Notices</span>
              </label>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notice List */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="space-y-3">
          {loading && <div className="p-6 text-center text-neutral-500">Loading…</div>}
          {!loading && notices.length === 0 && (
            <div className="p-6 text-center text-neutral-500">
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
                  className={`p-4 border rounded-lg flex flex-col justify-between ${expired ? 'bg-gray-50 opacity-75' : ''}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-black">{n.title}</h4>
                        <div className="text-xs text-neutral-500 mt-1 flex flex-wrap items-center gap-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded ${PRIORITY_CLASSES[n.priority] || 'bg-neutral-100 text-neutral-700'}`}>
                            {n.priority_display || n.priority}
                          </span>
                          <span>•</span>
                          <span>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs px-2 py-1 rounded ${effectivelyActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {effectivelyActive ? 'Active' : 'Inactive'}
                        </span>
                        {expired && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                            Expired
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-neutral-700">{n.content}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-2">
                      <span className={expired ? 'text-red-600 font-medium' : ''}>
                        Expiry: {n.expiry_date ? new Date(n.expiry_date).toLocaleDateString() : '—'}
                      </span>
                      {n.target_role && n.target_role !== 'all' && (
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px]">
                          {TARGET_ROLE_LABELS[n.target_role] || n.target_role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(n)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                      >
                        <LucideIcons.Pencil size={13} />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(n)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100 transition"
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-neutral-200">
              <div className="text-sm text-neutral-600">
                Page {currentPage} of {totalPages} ({totalCount} total)
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
                <div className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium">{currentPage}</div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-black">
                {editingNotice ? 'Edit Notice' : 'Create New Notice'}
              </h2>
              <button onClick={closeModal} className="text-neutral-500 hover:text-neutral-700 transition">
                <LucideIcons.X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateForm('title', e.target.value)}
                  placeholder="Notice title"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ${errors.title ? 'border-red-500 bg-red-50' : 'border-neutral-300 focus:ring-indigo-500'}`}
                />
                {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => updateForm('content', e.target.value)}
                  placeholder="Notice content"
                  rows={5}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition resize-none ${errors.content ? 'border-red-500 bg-red-50' : 'border-neutral-300 focus:ring-indigo-500'}`}
                />
                {errors.content && <p className="text-red-600 text-sm mt-1">{errors.content}</p>}
              </div>

              {/* Priority + Target Audience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => updateForm('priority', e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Target Audience</label>
                  <select
                    value={form.target_role}
                    onChange={(e) => updateForm('target_role', e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  >
                    <option value="all">All</option>
                    <option value="student">Students</option>
                    <option value="instructor">Instructors</option>
                    <option value="admin">Admin</option>
                    <option value="commandant">Commandant</option>
                    <option value="chief_instructor">Chief Instructor</option>
                  </select>
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Expiry Date <span className="text-neutral-500 text-xs">(Optional)</span>
                </label>
                <ModernDatePicker
                  value={form.expiry_date}
                  onChange={(date) => updateForm('expiry_date', date)}
                  placeholder="Select expiry date"
                  minDate={new Date().toISOString().split('T')[0]}
                />
                {errors.expiry_date && <p className="text-red-600 text-sm mt-1">{errors.expiry_date}</p>}
              </div>

              {/* Is Active */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => updateForm('is_active', e.target.checked)}
                    className="w-4 h-4 border-neutral-300 rounded focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-neutral-700">Active</span>
                  <span className="text-xs text-neutral-500">(Inactive notices won't be visible)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-6 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-medium hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <LucideIcons.Trash2 size={20} className="text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-black">Delete Notice</h2>
            </div>
            <p className="text-sm text-neutral-600 mb-2">Are you sure you want to delete this notice?</p>
            <p className="text-sm font-medium text-black mb-6 bg-neutral-50 px-3 py-2 rounded border">
              "{deleteTarget.title}"
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-5 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-medium hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
