import React, { useEffect, useState, useCallback } from 'react'
import { getDepartmentMemberships, addDepartmentMembership, updateDepartmentMembership, deleteDepartmentMembership, getDepartments, getAllInstructors } from '../../lib/api'
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

export default function DepartmentMembers() {
  const [loading, setLoading] = useState(false)
  const [memberships, setMemberships] = useState([])
  const [departments, setDepartments] = useState([])
  const [instructors, setInstructors] = useState([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newMember, setNewMember] = useState({ department: '', user: '', role: 'member' })
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [editForm, setEditForm] = useState({ role: 'member' })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(20)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [filterDept, setFilterDept] = useState('')
  const [filterRole, setFilterRole] = useState('')
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

  // Load departments and instructors for dropdowns
  useEffect(() => {
    getDepartments().then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => {})
    getAllInstructors().then(d => setInstructors(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}`
      if (filterDept) params += `&department=${filterDept}`
      if (filterRole) params += `&role=${filterRole}`
      if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
      const data = await getDepartmentMemberships(params)
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
      setMemberships(list)
    } catch (err) {
      reportError(err?.message || 'Failed to load department memberships')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, filterDept, filterRole, search, reportError])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    setErrors({})
    const errs = {}
    if (!newMember.department) errs.department = 'Please select a department'
    if (!newMember.user) errs.user = 'Please select an instructor'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setIsSaving(true)
    try {
      await addDepartmentMembership(newMember)
      reportSuccess('Member Added to Department')
      setNewMember({ department: '', user: '', role: 'member' })
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
        if (fieldErrors.non_field_errors) { reportError(fieldErrors.non_field_errors); return }
        if (fieldErrors.detail) { reportError(fieldErrors.detail); return }
        if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return }
      }
      reportError(err?.message || 'Failed to add member')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!editingMember) return
    setIsSaving(true)
    try {
      await updateDepartmentMembership(editingMember.id, { role: editForm.role })
      reportSuccess('Membership Updated')
      setEditModalOpen(false)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to update membership')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await deleteDepartmentMembership(confirmDelete.id)
      reportSuccess('Member Removed from Department')
      setConfirmDelete(null)
      setEditModalOpen(false)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to remove member')
    } finally {
      setIsDeleting(false)
    }
  }

  const roleBadge = (role) => {
    if (role === 'hod') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">HOD</span>
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Member</span>
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Department Members</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Assign instructors to departments and manage HOD roles.</p>
        </div>
        <button
          onClick={() => { setErrors({}); setNewMember({ department: '', user: '', role: 'member' }); setAddModalOpen(true) }}
          className="whitespace-nowrap bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition"
        >
          Add Member
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(sanitizeInput(e.target.value)); setCurrentPage(1) }}
          className="w-40 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <select
          value={filterDept}
          onChange={(e) => { setFilterDept(e.target.value); setCurrentPage(1) }}
          className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filterRole}
          onChange={(e) => { setFilterRole(e.target.value); setCurrentPage(1) }}
          className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All Roles</option>
          <option value="hod">HOD</option>
          <option value="member">Member</option>
        </select>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} memberships
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
                  <h4 className="text-lg text-black font-medium">Add Department Member</h4>
                  <p className="text-sm text-neutral-500">Assign an instructor to a department</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setAddModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <form onSubmit={handleAdd}>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Department *</label>
                    <select
                      value={newMember.department}
                      onChange={(e) => setNewMember({ ...newMember, department: e.target.value })}
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.department ? 'border-rose-500' : 'border-neutral-200'}`}
                    >
                      <option value="">Select Department</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                    </select>
                    {errors.department && <div className="text-xs text-rose-600 mt-1">{errors.department}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Instructor *</label>
                    <select
                      value={newMember.user}
                      onChange={(e) => setNewMember({ ...newMember, user: e.target.value })}
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.user ? 'border-rose-500' : 'border-neutral-200'}`}
                    >
                      <option value="">Select Instructor</option>
                      {instructors.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.first_name} {u.last_name} {u.svc_number ? `(${u.svc_number})` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.user && <div className="text-xs text-rose-600 mt-1">{errors.user}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Role</label>
                    <select
                      value={newMember.role}
                      onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                      className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="member">Member</option>
                      <option value="hod">Head of Department (HOD)</option>
                    </select>
                    {errors.role && <div className="text-xs text-rose-600 mt-1">{errors.role}</div>}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {isSaving ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit Membership</h4>
                  <p className="text-sm text-neutral-500">{editingMember.user_name} in {editingMember.department_name}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <form onSubmit={handleEdit}>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="member">Member</option>
                    <option value="hod">Head of Department (HOD)</option>
                  </select>
                </div>
                <div className="flex justify-between gap-2 mt-4">
                  <button type="button" onClick={() => setConfirmDelete(editingMember)} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Remove</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
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
                  <h4 className="text-lg font-medium text-black">Remove Member</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDelete(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">Are you sure you want to remove <strong>{confirmDelete.user_name}</strong> from <strong>{confirmDelete.department_name}</strong>?</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {isDeleting ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left bg-neutral-50">
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Instructor</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">SVC Number</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Department</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Role</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Assigned</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</td></tr>
            ) : memberships.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-400">No memberships found</td></tr>
            ) : memberships.map((m) => (
              <tr key={m.id} className="border-t last:border-b hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700">{m.user_name || 'Unknown'}</td>
                <td className="px-4 py-3 text-sm text-neutral-500">{m.user_svc_number || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{m.department_name || 'Unknown'}</td>
                <td className="px-4 py-3">{roleBadge(m.role)}</td>
                <td className="px-4 py-3 text-sm text-neutral-500">{m.assigned_at ? new Date(m.assigned_at).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      setEditingMember(m)
                      setEditForm({ role: m.role || 'member' })
                      setEditModalOpen(true)
                    }}
                    className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : memberships.length === 0 ? (
          <div className="text-sm text-neutral-400">No memberships found</div>
        ) : memberships.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm text-black">{m.user_name || 'Unknown'}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{m.user_svc_number || ''}</div>
                <div className="text-xs text-neutral-500 mt-1">{m.department_name}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {roleBadge(m.role)}
                <button
                  onClick={() => {
                    setEditingMember(m)
                    setEditForm({ role: m.role || 'member' })
                    setEditModalOpen(true)
                  }}
                  className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
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
