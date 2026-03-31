import { useState, useEffect, useCallback } from 'react'
import * as Icons from 'lucide-react'
import {
  getOICRemarks,
  addOICRemark,
  updateOICRemark,
  deleteOICRemark,
  getOICClasses,
  getOICClassSubjects,
} from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = { class_obj: '', subject: '', remark: '' }

export default function OICRemarks() {
  const toast = useToast()
  const [remarks, setRemarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10

  // Filter
  const [filterType, setFilterType] = useState('') // 'class' | 'subject' | ''

  // Modals
  const [formModal, setFormModal] = useState(false)
  const [editRemark, setEditRemark] = useState(null) // null = create, object = edit
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Class / subject dropdowns
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  // Load classes for dropdown
  useEffect(() => {
    getOICClasses('page_size=100')
      .then(d => setClasses(Array.isArray(d) ? d : d?.results || []))
      .catch(() => {})
  }, [])

  // Load subjects when class changes in form
  useEffect(() => {
    if (!form.class_obj) { setSubjects([]); return }
    setLoadingSubjects(true)
    getOICClassSubjects(form.class_obj)
      .then(d => setSubjects(d?.subjects || []))
      .catch(() => setSubjects([]))
      .finally(() => setLoadingSubjects(false))
  }, [form.class_obj])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}`
      if (filterType) params += `&remark_type=${filterType}`
      const data = await getOICRemarks(params)
      const list = Array.isArray(data) ? data : data?.results ?? []
      setRemarks(list)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      } else {
        setTotalCount(list.length)
        setTotalPages(1)
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load remarks')
    } finally {
      setLoading(false)
    }
  }, [currentPage, filterType, reportError])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditRemark(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setFormModal(true)
  }

  const openEdit = (r) => {
    setEditRemark(r)
    setForm({
      class_obj: r.class_obj || '',
      subject: r.subject || '',
      remark: r.remark || '',
    })
    setFormErrors({})
    setFormModal(true)
  }

  const validateForm = () => {
    const errors = {}
    if (!form.class_obj) errors.class_obj = 'Please select a class.'
    if (!form.remark.trim() || form.remark.trim().length < 10) errors.remark = 'Remark must be at least 10 characters.'
    if (form.remark.trim().length > 5000) errors.remark = 'Remark must be 5000 characters or fewer.'
    return errors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = validateForm()
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    setSubmitting(true)
    try {
      const payload = {
        class_obj: form.class_obj,
        remark: form.remark.trim(),
        ...(form.subject ? { subject: form.subject } : {}),
      }
      if (editRemark) {
        await updateOICRemark(editRemark.id, payload)
        if (toast?.success) toast.success('Remark updated.')
        else if (toast?.showToast) toast.showToast('Remark updated.', { type: 'success' })
      } else {
        await addOICRemark(payload)
        if (toast?.success) toast.success('Remark added.')
        else if (toast?.showToast) toast.showToast('Remark added.', { type: 'success' })
      }
      setFormModal(false)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to save remark')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOICRemark(deleteTarget.id)
      if (toast?.success) toast.success('Remark deleted.')
      else if (toast?.showToast) toast.showToast('Remark deleted.', { type: 'success' })
      setDeleteTarget(null)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to delete remark')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-black">My Remarks</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Manage your class and subject remarks.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1) }}
            className="p-2 text-sm rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black"
          >
            <option value="">All Types</option>
            <option value="class">Class</option>
            <option value="subject">Subject</option>
          </select>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
          >
            <Icons.Plus className="w-4 h-4" />
            Add Remark
          </button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          {totalCount} remark{totalCount !== 1 ? 's' : ''}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="Loader2" title="Loading remarks..." variant="minimal" />
        </div>
      ) : remarks.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="MessageSquare" title="No remarks yet" description="Add your first remark by clicking 'Add Remark'." variant="minimal" />
        </div>
      ) : (
        <div className="space-y-3">
          {remarks.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-black truncate">{r.class_name || '—'}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      r.remark_type === 'subject' ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {r.remark_type_display || r.remark_type || 'Class'}
                    </span>
                    {r.subject_name && (
                      <span className="text-xs text-neutral-500">· {r.subject_name}</span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-700 mt-1 leading-relaxed">{r.remark}</p>
                  <p className="text-xs text-neutral-400 mt-2">{formatDate(r.created_at)}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(r)}
                    className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-indigo-600 transition"
                    title="Edit"
                  >
                    <Icons.Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(r)}
                    className="p-1.5 rounded-md text-neutral-500 hover:bg-red-50 hover:text-red-600 transition"
                    title="Delete"
                  >
                    <Icons.Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Page <span className="font-semibold text-black">{currentPage}</span> of{' '}
              <span className="font-semibold text-black">{totalPages}</span>
              {' '}· <span className="font-semibold text-black">{totalCount}</span> total
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>
              {(() => {
                const pages = []
                const maxVisible = 5
                let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                let end = Math.min(totalPages, start + maxVisible - 1)
                if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                if (start > 1) {
                  pages.push(<button key={1} onClick={() => setCurrentPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                  if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                }
                for (let i = start; i <= end; i++) {
                  pages.push(
                    <button key={i} onClick={() => setCurrentPage(i)}
                      className={`px-3 py-1.5 text-sm rounded-lg transition ${currentPage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>
                      {i}
                    </button>
                  )
                }
                if (end < totalPages) {
                  if (end < totalPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                  pages.push(<button key={totalPages} onClick={() => setCurrentPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalPages}</button>)
                }
                return pages
              })()}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {formModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setFormModal(false)} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-5 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-base font-semibold text-black">
                  {editRemark ? 'Edit Remark' : 'Add Remark'}
                </h4>
                <button onClick={() => setFormModal(false)} className="text-neutral-400 hover:text-black transition">
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Class *</label>
                  <select
                    value={form.class_obj}
                    onChange={(e) => setForm(f => ({ ...f, class_obj: e.target.value, subject: '' }))}
                    disabled={!!editRemark}
                    className={`w-full p-2 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black ${
                      formErrors.class_obj ? 'border-rose-500' : 'border-neutral-200'
                    } ${editRemark ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="">Select a class</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.class_code ? `(${c.class_code})` : ''}</option>
                    ))}
                  </select>
                  {formErrors.class_obj && <p className="text-xs text-rose-600 mt-1">{formErrors.class_obj}</p>}
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">
                    Subject <span className="text-neutral-400">(optional — leave blank for class-level remark)</span>
                  </label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                    disabled={!form.class_obj || loadingSubjects}
                    className="w-full p-2 rounded-md text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black disabled:bg-neutral-50 disabled:cursor-not-allowed"
                  >
                    <option value="">No subject (class-level)</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.subject_code ? `(${s.subject_code})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Remark *</label>
                  <textarea
                    value={form.remark}
                    onChange={(e) => setForm(f => ({ ...f, remark: e.target.value }))}
                    placeholder="Write your remark (min. 10 characters)..."
                    rows={5}
                    className={`w-full p-2 rounded-md text-sm text-black border focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none ${
                      formErrors.remark ? 'border-rose-500' : 'border-neutral-200'
                    }`}
                  />
                  <div className="flex items-center justify-between mt-0.5">
                    {formErrors.remark ? (
                      <p className="text-xs text-rose-600">{formErrors.remark}</p>
                    ) : (
                      <span className="text-xs text-neutral-400">{form.remark.length}/5000</span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFormModal(false)}
                    className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {submitting ? 'Saving...' : editRemark ? 'Save Changes' : 'Add Remark'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 w-full max-w-sm">
            <div className="bg-white rounded-xl p-5 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Icons.Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h4 className="text-base font-semibold text-black">Delete Remark?</h4>
              </div>
              <p className="text-sm text-neutral-600 mb-4">This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
