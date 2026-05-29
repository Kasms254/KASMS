import React, { useState, useEffect, useCallback } from 'react'
import * as Icons from 'lucide-react'
import {
  getOICAssignments,
  createOICAssignment,
  updateOICAssignment,
  deleteOICAssignment,
  bulkAssignOIC,
  getOICUsers,
  getAllClasses,
} from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = { oic: '', class_obj: '', notes: '' }

export default function OICAssignments() {
  const toast = useToast()

  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 12

  // Lookup data
  const [oicUsers, setOicUsers] = useState([])
  const [classes, setClasses] = useState([])
  const [loadingLookups, setLoadingLookups] = useState(true)

  // Modals
  const [assignModal, setAssignModal] = useState(false)  // single assignment
  const [bulkModal, setBulkModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)      // null = create
  const [deactivateTarget, setDeactivateTarget] = useState(null)

  // Form
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Bulk form
  const [bulkOic, setBulkOic] = useState('')
  const [bulkClassIds, setBulkClassIds] = useState([])
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  const showSuccess = useCallback((msg) => {
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }, [toast])

  // Load OIC users + classes once
  useEffect(() => {
    Promise.all([
      getOICUsers('role=oic&page_size=200&is_active=true').catch(() => ({ results: [] })),
      getAllClasses('is_active=true').catch(() => []),
    ]).then(([usersData, classesData]) => {
      const users = Array.isArray(usersData) ? usersData : usersData?.results ?? []
      setOicUsers(users)
      setClasses(Array.isArray(classesData) ? classesData : classesData?.results ?? [])
    }).finally(() => setLoadingLookups(false))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}&is_active=${filterActive}`
      if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
      const data = await getOICAssignments(params)
      const list = Array.isArray(data) ? data : data?.results ?? []
      setAssignments(list)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      } else {
        setTotalCount(list.length)
        setTotalPages(1)
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }, [currentPage, search, filterActive, reportError])

  useEffect(() => { load() }, [load])

  // ── Single assignment ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setAssignModal(true)
  }

  const openEdit = (a) => {
    setEditTarget(a)
    setForm({ oic: a.oic || '', class_obj: a.class_obj || '', notes: a.notes || '' })
    setFormErrors({})
    setAssignModal(true)
  }

  const validateForm = () => {
    const errors = {}
    if (!form.oic) errors.oic = 'Please select an OIC user.'
    if (!form.class_obj) errors.class_obj = 'Please select a class.'
    return errors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = validateForm()
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setSubmitting(true)
    try {
      const payload = { oic: form.oic, class_obj: form.class_obj, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) }
      if (editTarget) {
        await updateOICAssignment(editTarget.id, payload)
        showSuccess('Assignment updated.')
      } else {
        await createOICAssignment(payload)
        showSuccess('OIC assigned to class successfully.')
      }
      setAssignModal(false)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to save assignment')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Deactivate ──────────────────────────────────────────────────────────────
  const [deactivating, setDeactivating] = useState(false)
  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await deleteOICAssignment(deactivateTarget.id)
      showSuccess('Assignment deactivated.')
      setDeactivateTarget(null)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to deactivate assignment')
    } finally {
      setDeactivating(false)
    }
  }

  // ── Bulk assign ─────────────────────────────────────────────────────────────
  const handleBulkSubmit = async (e) => {
    e.preventDefault()
    if (!bulkOic) { reportError('Please select an OIC user.'); return }
    if (bulkClassIds.length === 0) { reportError('Please select at least one class.'); return }
    setBulkSubmitting(true)
    try {
      const res = await bulkAssignOIC(bulkOic, bulkClassIds)
      const created = res?.created_class_ids?.length ?? 0
      const skipped = res?.skipped_class_ids?.length ?? 0
      showSuccess(`${created} class${created !== 1 ? 'es' : ''} assigned.${skipped > 0 ? ` ${skipped} skipped (already assigned).` : ''}`)
      setBulkModal(false)
      setBulkOic('')
      setBulkClassIds([])
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to bulk assign')
    } finally {
      setBulkSubmitting(false)
    }
  }

  const toggleBulkClass = (id) => {
    setBulkClassIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-black">OIC Assignments</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Assign Officers in Charge to classes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
            className="w-40 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <label className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-black cursor-pointer">
            <input
              type="checkbox"
              checked={!filterActive}
              onChange={(e) => { setFilterActive(!e.target.checked); setCurrentPage(1) }}
              className="rounded"
            />
            Show inactive
          </label>
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 text-white text-xs sm:text-sm hover:bg-emerald-700 transition"
          >
            <Icons.ListPlus className="w-4 h-4" />
            Bulk Assign
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-indigo-600 text-white text-xs sm:text-sm hover:bg-indigo-700 transition"
          >
            <Icons.Plus className="w-4 h-4" />
            Assign OIC
          </button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} assignments
        </div>
      )}

      {/* Assignment grid */}
      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="Loader2" title="Loading assignments..." variant="minimal" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState
            icon="UserCheck"
            title="No assignments found"
            description="Assign an OIC to a class using the button above."
            variant="minimal"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assignments.map((a) => (
            <div key={a.id} className={`relative bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${a.is_active ? 'border-neutral-200' : 'border-neutral-100 opacity-60'}`}>
              {/* Accent stripe */}
              <div className={`absolute top-0 left-0 h-1 w-12 md:w-16 rounded-tl-xl ${a.is_active ? 'bg-indigo-600' : 'bg-neutral-400'}`} />

              <div className="flex items-start justify-between gap-2 mt-1">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-black truncate">{a.oic_name || a.oic_svc_number || '—'}</p>
                  {a.oic_rank && <p className="text-xs text-neutral-500">{a.oic_rank}</p>}
                  {a.oic_svc_number && <p className="text-xs text-neutral-400">{a.oic_svc_number}</p>}
                </div>
                <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-neutral-100">
                <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <Icons.Layers className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="truncate font-medium">{a.class_name || '—'}</span>
                </div>
                {a.course_name && (
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1">
                    <Icons.BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{a.course_name}</span>
                  </div>
                )}
                {a.department_name && (
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1">
                    <Icons.Building className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{a.department_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1">
                  <Icons.Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{formatDate(a.assigned_at)}</span>
                </div>
                {a.notes && (
                  <p className="mt-2 text-xs text-neutral-500 italic line-clamp-2">{a.notes}</p>
                )}
              </div>

              {a.is_active && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openEdit(a)}
                    className="flex-1 px-2 py-1.5 rounded-md bg-indigo-50 text-indigo-600 text-xs hover:bg-indigo-100 transition font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeactivateTarget(a)}
                    className="flex-1 px-2 py-1.5 rounded-md bg-red-50 text-red-600 text-xs hover:bg-red-100 transition font-medium"
                  >
                    Deactivate
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition">First</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition">Next</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition">Last</button>
          </div>
        </div>
      )}

      {/* ── Single Assign / Edit Modal ─────────────────────────────────────── */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAssignModal(false)} />
          <div className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-5 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-base font-semibold text-black">
                  {editTarget ? 'Edit Assignment' : 'Assign OIC to Class'}
                </h4>
                <button onClick={() => setAssignModal(false)} className="text-neutral-400 hover:text-black transition">
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              {loadingLookups ? (
                <div className="py-8 text-center text-sm text-neutral-500">Loading...</div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* OIC selector */}
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">OIC User *</label>
                    {oicUsers.length === 0 ? (
                      <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
                        No OIC users found. Create a user with the <strong>Officer in Charge</strong> role first.
                      </div>
                    ) : (
                      <select
                        value={form.oic}
                        onChange={(e) => setForm(f => ({ ...f, oic: e.target.value }))}
                        disabled={!!editTarget}
                        className={`w-full p-2 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black ${
                          formErrors.oic ? 'border-rose-500' : 'border-neutral-200'
                        } ${editTarget ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                      >
                        <option value="">Select an OIC user</option>
                        {oicUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || `${u.first_name} ${u.last_name}`.trim() || u.username} — {u.svc_number}{u.rank ? ` (${u.rank})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {formErrors.oic && <p className="text-xs text-rose-600 mt-1">{formErrors.oic}</p>}
                  </div>

                  {/* Class selector */}
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class *</label>
                    <select
                      value={form.class_obj}
                      onChange={(e) => setForm(f => ({ ...f, class_obj: e.target.value }))}
                      disabled={!!editTarget}
                      className={`w-full p-2 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black ${
                        formErrors.class_obj ? 'border-rose-500' : 'border-neutral-200'
                      } ${editTarget ? 'bg-neutral-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="">Select a class</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.class_code ? ` (${c.class_code})` : ''}{c.course_name ? ` — ${c.course_name}` : ''}
                        </option>
                      ))}
                    </select>
                    {formErrors.class_obj && <p className="text-xs text-rose-600 mt-1">{formErrors.class_obj}</p>}
                    {editTarget && (
                      <p className="text-xs text-neutral-400 mt-1">OIC and class cannot be changed. Create a new assignment instead.</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Notes <span className="text-neutral-400">(optional)</span></label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any notes about this assignment..."
                      rows={3}
                      className="w-full p-2 rounded-md text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setAssignModal(false)}
                      className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting || oicUsers.length === 0}
                      className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition">
                      {submitting ? 'Saving...' : editTarget ? 'Save Changes' : 'Assign OIC'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Assign Modal ──────────────────────────────────────────────── */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setBulkModal(false)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/5 flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-5 border-b border-neutral-100">
                <div>
                  <h4 className="text-base font-semibold text-black">Bulk Assign OIC</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Assign one OIC to multiple classes at once.</p>
                </div>
                <button onClick={() => setBulkModal(false)} className="text-neutral-400 hover:text-black transition">
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              {loadingLookups ? (
                <div className="p-8 text-center text-sm text-neutral-500">Loading...</div>
              ) : (
                <form onSubmit={handleBulkSubmit} className="flex flex-col flex-1 overflow-hidden">
                  <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* OIC selector */}
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">OIC User *</label>
                      {oicUsers.length === 0 ? (
                        <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700">
                          No OIC users found. Create a user with the <strong>Officer in Charge</strong> role first.
                        </div>
                      ) : (
                        <select
                          value={bulkOic}
                          onChange={(e) => setBulkOic(e.target.value)}
                          className="w-full p-2 rounded-md text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black"
                        >
                          <option value="">Select an OIC user</option>
                          {oicUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.full_name || `${u.first_name} ${u.last_name}`.trim() || u.username} — {u.svc_number}{u.rank ? ` (${u.rank})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Class checkboxes */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-neutral-600">Classes * <span className="text-neutral-400">({bulkClassIds.length} selected)</span></label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setBulkClassIds(classes.map(c => c.id))}
                            className="text-xs text-indigo-600 hover:underline">Select all</button>
                          <button type="button" onClick={() => setBulkClassIds([])}
                            className="text-xs text-neutral-500 hover:underline">Clear</button>
                        </div>
                      </div>
                      <div className="border border-neutral-200 rounded-lg overflow-y-auto max-h-60 divide-y divide-neutral-100">
                        {classes.length === 0 ? (
                          <div className="p-4 text-sm text-neutral-400 text-center">No active classes available</div>
                        ) : (
                          classes.map(c => (
                            <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={bulkClassIds.includes(c.id)}
                                onChange={() => toggleBulkClass(c.id)}
                                className="rounded"
                              />
                              <div className="min-w-0">
                                <span className="text-sm text-black font-medium truncate block">
                                  {c.name}{c.class_code ? ` (${c.class_code})` : ''}
                                </span>
                                {c.course_name && (
                                  <span className="text-xs text-neutral-400">{c.course_name}</span>
                                )}
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 p-5 border-t border-neutral-100">
                    <button type="button" onClick={() => setBulkModal(false)}
                      className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">
                      Cancel
                    </button>
                    <button type="submit" disabled={bulkSubmitting || !bulkOic || bulkClassIds.length === 0 || oicUsers.length === 0}
                      className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 transition">
                      {bulkSubmitting ? 'Assigning...' : `Assign to ${bulkClassIds.length} class${bulkClassIds.length !== 1 ? 'es' : ''}`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirmation ────────────────────────────────────────── */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeactivateTarget(null)} />
          <div className="relative z-10 w-full max-w-sm">
            <div className="bg-white rounded-xl p-5 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Icons.UserMinus className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-black">Deactivate Assignment?</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {deactivateTarget.oic_name} → {deactivateTarget.class_name}
                  </p>
                </div>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                The OIC will lose access to this class. This can be re-activated later.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeactivateTarget(null)}
                  className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">
                  Cancel
                </button>
                <button onClick={handleDeactivate} disabled={deactivating}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50 transition">
                  {deactivating ? 'Deactivating...' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
