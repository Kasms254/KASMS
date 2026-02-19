import React, { useEffect, useState, useCallback } from 'react'
import Card from '../../components/Card'
import { getDepartmentsPaginated, addDepartment, updateDepartment, deleteDepartment } from '../../lib/api'
import useToast from '../../hooks/useToast'

function sanitizeInput(value, trimSpaces = false) {
  if (typeof value !== 'string') return value
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
  const cleaned = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(controlChars, '')
  return trimSpaces ? cleaned.trim() : cleaned
}

export default function Departments() {
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newDept, setNewDept] = useState({ name: '', code: '', description: '' })
  const [editingDept, setEditingDept] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', code: '', description: '', is_active: true })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(12)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [search, setSearch] = useState('')

  const toast = useToast()
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])
  const reportSuccess = useCallback((msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}`
      if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
      const data = await getDepartmentsPaginated(params)
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
      setDepartments(list)
    } catch (err) {
      reportError(err?.message || 'Failed to load departments')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, search, reportError])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    setErrors({})
    const errs = {}
    if (!newDept.name.trim()) errs.name = 'Department name is required'
    if (!newDept.code.trim()) errs.code = 'Department code is required'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setIsSaving(true)
    try {
      await addDepartment({ name: newDept.name.trim(), code: newDept.code.trim(), description: newDept.description.trim() })
      reportSuccess('Department Created')
      setNewDept({ name: '', code: '', description: '' })
      setAddModalOpen(false)
      load()
    } catch (err) {
      if (err?.data && typeof err.data === 'object') {
        const d = err.data
        const fieldErrors = {}
        Object.keys(d).forEach((k) => {
          if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' ')
          else if (typeof d[k] === 'string') fieldErrors[k] = d[k]
        })
        if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return }
      }
      reportError(err?.message || 'Failed to create department')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!editingDept) return
    setErrors({})
    const errs = {}
    if (!editForm.name.trim()) errs.name = 'Department name is required'
    if (!editForm.code.trim()) errs.code = 'Department code is required'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setIsSaving(true)
    try {
      await updateDepartment(editingDept.id, {
        name: editForm.name.trim(),
        code: editForm.code.trim(),
        description: editForm.description.trim(),
        is_active: editForm.is_active,
      })
      reportSuccess('Department Updated')
      setEditModalOpen(false)
      load()
    } catch (err) {
      if (err?.data && typeof err.data === 'object') {
        const d = err.data
        const fieldErrors = {}
        Object.keys(d).forEach((k) => {
          if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' ')
          else if (typeof d[k] === 'string') fieldErrors[k] = d[k]
        })
        if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return }
      }
      reportError(err?.message || 'Failed to update department')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await deleteDepartment(confirmDelete.id)
      reportSuccess('Department Deleted')
      setConfirmDelete(null)
      setEditModalOpen(false)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to delete department')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Departments</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Manage departments — Create, edit, and organize school departments.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(sanitizeInput(e.target.value)); setCurrentPage(1) }}
            className="w-40 sm:w-48 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={() => { setErrors({}); setNewDept({ name: '', code: '', description: '' }); setAddModalOpen(true) }}
            className="whitespace-nowrap bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition"
          >
            Add Department
          </button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} departments
        </div>
      )}

      {/* Add Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Create Department</h4>
                  <p className="text-sm text-neutral-500">Add a new department to the school</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setAddModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <form onSubmit={handleAdd}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Department Name *</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.name ? 'border-rose-500' : 'border-neutral-200'}`}
                      placeholder="e.g. Computer Science"
                      value={newDept.name}
                      maxLength={150}
                      onChange={(e) => setNewDept({ ...newDept, name: sanitizeInput(e.target.value).slice(0, 150) })}
                    />
                    {errors.name && <div className="text-xs text-rose-600 mt-1">{errors.name}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Department Code *</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.code ? 'border-rose-500' : 'border-neutral-200'}`}
                      placeholder="e.g. CS"
                      value={newDept.code}
                      maxLength={20}
                      onChange={(e) => setNewDept({ ...newDept, code: sanitizeInput(e.target.value).slice(0, 20) })}
                    />
                    {errors.code && <div className="text-xs text-rose-600 mt-1">{errors.code}</div>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Description</label>
                    <textarea
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.description ? 'border-rose-500' : 'border-neutral-200'}`}
                      placeholder="Brief description of the department"
                      value={newDept.description}
                      rows={3}
                      maxLength={500}
                      onChange={(e) => setNewDept({ ...newDept, description: sanitizeInput(e.target.value).slice(0, 500) })}
                    />
                    {errors.description && <div className="text-xs text-rose-600 mt-1">{errors.description}</div>}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {isSaving ? 'Creating...' : 'Create Department'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit Department</h4>
                  <p className="text-sm text-neutral-500">Update department information</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <form onSubmit={handleEdit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Department Name *</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.name ? 'border-rose-500' : 'border-neutral-200'}`}
                      value={editForm.name}
                      maxLength={150}
                      onChange={(e) => setEditForm({ ...editForm, name: sanitizeInput(e.target.value).slice(0, 150) })}
                    />
                    {errors.name && <div className="text-xs text-rose-600 mt-1">{errors.name}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Department Code *</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.code ? 'border-rose-500' : 'border-neutral-200'}`}
                      value={editForm.code}
                      maxLength={20}
                      onChange={(e) => setEditForm({ ...editForm, code: sanitizeInput(e.target.value).slice(0, 20) })}
                    />
                    {errors.code && <div className="text-xs text-rose-600 mt-1">{errors.code}</div>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Description</label>
                    <textarea
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.description ? 'border-rose-500' : 'border-neutral-200'}`}
                      value={editForm.description}
                      rows={3}
                      maxLength={500}
                      onChange={(e) => setEditForm({ ...editForm, description: sanitizeInput(e.target.value).slice(0, 500) })}
                    />
                    {errors.description && <div className="text-xs text-rose-600 mt-1">{errors.description}</div>}
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="dept-active"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      className="rounded border-neutral-300"
                    />
                    <label htmlFor="dept-active" className="text-sm text-neutral-600">Active</label>
                  </div>
                </div>
                <div className="flex justify-between gap-2 mt-4">
                  <button type="button" onClick={() => setConfirmDelete(editingDept)} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                    <span className="text-red-600 text-lg">!</span>
                  </div>
                  <h4 className="text-lg font-medium text-black">Delete Department</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDelete(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">Are you sure you want to delete <strong>{confirmDelete.name || confirmDelete.code}</strong>? This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="text-sm text-neutral-400">No Departments Found</div>
        ) : (
          departments.map((dept) => (
            <div key={dept.id}>
              <Card
                title={dept.code || dept.name || 'Untitled'}
                value={dept.name}
                badge={dept.is_active ? 'Active' : 'Inactive'}
                icon="Building"
                accent={dept.is_active ? 'bg-indigo-600' : 'bg-neutral-400'}
                colored={true}
              >
                <div className="space-y-1.5">
                  {dept.hod_name && (
                    <div className="text-xs text-neutral-500">
                      <span className="font-medium">HOD:</span> {dept.hod_name}
                      {dept.hod_svc_number && <span className="text-neutral-400 ml-1">({dept.hod_svc_number})</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span>{dept.course_count ?? 0} Courses</span>
                    <span>{dept.class_count ?? 0} Classes</span>
                  </div>
                  {dept.description && (
                    <div className="line-clamp-2 text-xs text-neutral-400" title={dept.description}>{dept.description}</div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingDept(dept)
                        setEditForm({
                          name: dept.name || '',
                          code: dept.code || '',
                          description: dept.description || '',
                          is_active: dept.is_active !== false,
                        })
                        setErrors({})
                        setEditModalOpen(true)
                      }}
                      className="px-2 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      )}
    </div>
  )
}
