import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as LucideIcons from 'lucide-react'
import { createPortal } from 'react-dom'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

const PAGE_SIZE = 10

const LEADERSHIP_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'commandant', label: 'Commandant (CO)' },
  { value: 'chief_instructor', label: 'Chief Instructor (CI)' },
  { value: 'oic', label: 'Officer in Charge (OIC)' },
]

const EDITABLE_ROLE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'admin', label: 'Admin' },
  { value: 'commandant', label: 'Commandant (CO)' },
  { value: 'chief_instructor', label: 'Chief Instructor (CI)' },
  { value: 'oic', label: 'Officer in Charge (OIC)' },
]

const ROLE_LABEL = EDITABLE_ROLE_OPTIONS.reduce((acc, role) => {
  acc[role.value] = role.label
  return acc
}, {})

const RANK_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'lieutenant_general', label: 'Lieutenant General' },
  { value: 'major_general', label: 'Major General' },
  { value: 'brigadier', label: 'Brigadier' },
  { value: 'colonel', label: 'Colonel' },
  { value: 'lieutenant_colonel', label: 'Lieutenant Colonel' },
  { value: 'major', label: 'Major' },
  { value: 'captain', label: 'Captain' },
  { value: 'lieutenant', label: 'Lieutenant' },
  { value: 'warrant_officer_i', label: 'Warrant Officer I' },
  { value: 'warrant_officer_ii', label: 'Warrant Officer II' },
  { value: 'senior_sergeant', label: 'Senior Sergeant' },
  { value: 'sergeant', label: 'Sergeant' },
  { value: 'corporal', label: 'Corporal' },
  { value: 'lance_corporal', label: 'Lance Corporal' },
  { value: 'private', label: 'Private' },
]

const RANK_LABEL_TO_VALUE = {}
for (const r of RANK_OPTIONS) {
  RANK_LABEL_TO_VALUE[r.label.toLowerCase()] = r.value
  RANK_LABEL_TO_VALUE[r.value] = r.value
}

function normalizeRank(raw) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  return RANK_LABEL_TO_VALUE[key] || ''
}

function initials(name = '') {
  return name
    .split(' ')
    .map((part) => part[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminLeadershipUsers() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [page, setPage] = useState(1)

  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    svc_number: '',
    rank: '',
    unit: '',
    role: 'admin',
    is_active: true,
    class_obj: '',
  })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [enrollmentsList, setEnrollmentsList] = useState([])
  const [currentEnrollment, setCurrentEnrollment] = useState(null)

  const { data, isPending, error } = useQuery({
    queryKey: ['leadership-users', searchTerm],
    queryFn: async () => {
      const usersByRole = await Promise.all(
        LEADERSHIP_ROLES.map(async (role) => {
          const params = new URLSearchParams()
          params.set('role', role.value)
          params.set('page', '1')
          params.set('page_size', '500')
          if (searchTerm.trim()) params.set('search', searchTerm.trim())
          const resp = await api.getUsers(params.toString())
          return Array.isArray(resp) ? resp : (resp?.results || [])
        })
      )

      const merged = usersByRole.flat()
      const uniqueMap = new Map()
      for (const user of merged) {
        uniqueMap.set(user.id, user)
      }

      return Array.from(uniqueMap.values())
    },
    placeholderData: (prev) => prev,
  })

  // Classes list for the class dropdown in edit modal
  const { data: classesQueryData } = useQuery({
    queryKey: ['classes', 'active'],
    queryFn: () => api.getClassesPaginated('is_active=true&page_size=500'),
    staleTime: 10 * 60 * 1000,
  })
  const classesList = useMemo(() => {
    const raw = classesQueryData?.results ?? []
    return raw.map((cls) => ({ ...cls, id: cls.id != null ? String(cls.id) : cls.id }))
  }, [classesQueryData])

  const leadershipUsers = useMemo(() => {
    const list = Array.isArray(data) ? data : []
    const filtered = selectedRole === 'all' ? list : list.filter((u) => u.role === selectedRole)
    return filtered.sort((a, b) => {
      const nameA = (a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.svc_number || '').toLowerCase()
      const nameB = (b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.svc_number || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [data, selectedRole])

  const totalPages = Math.max(1, Math.ceil(leadershipUsers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedUsers = leadershipUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function openEdit(user) {
    setEditingUser(user)
    setEditError('')
    setEnrollmentsList([])
    setCurrentEnrollment(null)
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone_number: user.phone_number || '',
      svc_number: user.svc_number || '',
      rank: normalizeRank(user.rank || user.rank_display),
      unit: user.unit || '',
      role: user.role || 'admin',
      is_active: !!user.is_active,
      class_obj: '',
    })
    // Fetch enrollments in case this user was previously a student
    api.getUserEnrollments(user.id).then((d) => {
      const list = Array.isArray(d) ? d : (d?.results ?? d?.enrollments ?? [])
      setEnrollmentsList(list)
      const active = list.find((e) => e.is_active) || null
      setCurrentEnrollment(active)
      if (active?.class_obj) {
        const classId = typeof active.class_obj === 'object' ? active.class_obj.id : active.class_obj
        setEditForm((f) => ({ ...f, class_obj: classId != null ? String(classId) : '' }))
      }
    }).catch(() => {
      setEnrollmentsList([])
      setCurrentEnrollment(null)
    })
  }

  function closeEdit() {
    setEditingUser(null)
    setEditError('')
    setEnrollmentsList([])
    setCurrentEnrollment(null)
  }

  function handleEditChange(key, value) {
    let nextValue = value
    if (key === 'svc_number') nextValue = String(value).replace(/\D/g, '').slice(0, 7)
    if (key === 'phone_number') nextValue = String(value).replace(/\D/g, '')
    if (key === 'role' && value !== 'student') {
      setEditForm((form) => ({ ...form, [key]: nextValue, class_obj: '' }))
    } else {
      setEditForm((form) => ({ ...form, [key]: nextValue }))
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingUser) return

    setEditLoading(true)
    setEditError('')
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        svc_number: editForm.svc_number,
        rank: editForm.rank || undefined,
        unit: editForm.unit || '',
        role: editForm.role,
        is_active: editForm.is_active,
      }
      await api.partialUpdateUser(editingUser.id, payload)

      // Handle class enrollment when role is student
      if (editForm.role === 'student' && editForm.class_obj) {
        try {
          const selectedClassId = editForm.class_obj
          const currentClassId = currentEnrollment?.class_obj
            ? (typeof currentEnrollment.class_obj === 'object' ? currentEnrollment.class_obj.id : currentEnrollment.class_obj)
            : null

          if (String(selectedClassId) !== String(currentClassId)) {
            // Withdraw any other active enrollments first
            const activeOthers = enrollmentsList.filter((e) => {
              const cid = typeof e.class_obj === 'object' ? e.class_obj.id : e.class_obj
              return e.is_active && String(cid) !== String(selectedClassId)
            })
            for (const a of activeOthers) {
              try { await api.withdrawEnrollment(a.id) } catch { /* non-fatal */ }
            }

            const existing = enrollmentsList.find((e) => {
              const cid = typeof e.class_obj === 'object' ? e.class_obj.id : e.class_obj
              return String(cid) === String(selectedClassId)
            })
            if (existing) {
              if (!existing.is_active) await api.reactivateEnrollment(existing.id)
            } else {
              await api.addEnrollment({ student: editingUser.id, class_obj: selectedClassId })
            }
          }
        } catch (enrollErr) {
          // non-fatal: user role was updated, just enrollment failed
          if (toast?.error) toast.error('Role updated but enrollment failed: ' + (enrollErr?.message || ''))
          else if (toast?.showToast) toast.showToast('Role updated but enrollment failed', { type: 'error' })
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['leadership-users'] })
      closeEdit()
      if (toast?.success) toast.success('User updated successfully')
      else if (toast?.showToast) toast.showToast('User updated successfully', { type: 'success' })
    } catch (err) {
      const message = err?.data?.detail || err?.message || 'Failed to update user'
      setEditError(message)
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6 space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Leadership Users</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage Admin, CO, CI, and OIC accounts in one page.</p>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder="Search by name, service number, or email"
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value)
              setPage(1)
            }}
            className="w-full sm:w-64 px-3 py-2 border border-neutral-200 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">Admin & Leadership Roles</option>
            {LEADERSHIP_ROLES.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {isPending ? (
          <div className="p-6">
            <EmptyState icon="Loader2" title="Loading leadership users..." variant="minimal" />
          </div>
        ) : error ? (
          <div className="p-6">
            <EmptyState icon="AlertCircle" title="Failed to load users" description={String(error?.message || 'Unknown error')} />
          </div>
        ) : pagedUsers.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="Users" title="No leadership users found" description="Try changing the filter or search term." />
          </div>
        ) : (
          <>
            {/* Mobile / Tablet Card View */}
            <div className="lg:hidden p-4 space-y-3">
              {pagedUsers.map((user) => {
                const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()
                return (
                  <div key={user.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                          {initials(fullName || user.svc_number)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm sm:text-base text-black truncate">{fullName || '-'}</div>
                          <div className="text-xs text-neutral-600">{user.svc_number || '-'}</div>
                          <div className="text-xs text-neutral-500">{ROLE_LABEL[user.role] || user.role}</div>
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full flex-shrink-0 ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm mb-3">
                      <div className="flex justify-between gap-2"><span className="text-neutral-600 flex-shrink-0">Email:</span><span className="text-black truncate">{user.email || '-'}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-neutral-600 flex-shrink-0">Phone:</span><span className="text-black truncate">{user.phone_number || '-'}</span></div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-200">
                      <button onClick={() => openEdit(user)} className="flex-1 min-w-[70px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-md bg-indigo-600 text-xs sm:text-sm text-white hover:bg-indigo-700 transition">
                        Edit
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {pagedUsers.map((user) => {
                    const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()
                    return (
                      <tr key={user.id} className="hover:bg-neutral-50 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                              {initials(fullName || user.svc_number)}
                            </div>
                            <div className="text-sm font-medium text-black">{fullName || '-'}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{ROLE_LABEL[user.role] || user.role}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{user.svc_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{user.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{user.phone_number || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openEdit(user)} className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition">
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {leadershipUsers.length > PAGE_SIZE && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600 text-center sm:text-left">
              Showing <span className="font-semibold text-black">{(currentPage - 1) * PAGE_SIZE + 1}</span> to <span className="font-semibold text-black">{Math.min(currentPage * PAGE_SIZE, leadershipUsers.length)}</span> of <span className="font-semibold text-black">{leadershipUsers.length}</span> users
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>
              <span className="text-sm text-neutral-600 px-2">{currentPage}/{totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeEdit} />

          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl animate-in zoom-in-95 duration-200">
            <form onSubmit={submitEdit} className="transform bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg font-medium text-black">Edit leadership user</h4>
                  <p className="text-sm text-neutral-500">Update role and profile details.</p>
                </div>
                <button type="button" onClick={closeEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition" aria-label="Close">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>

              {editError && (
                <div className="flex items-start gap-2 p-3 mb-1 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  <LucideIcons.AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">First name</label>
                  <input value={editForm.first_name} onChange={(e) => handleEditChange('first_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Last name</label>
                  <input value={editForm.last_name} onChange={(e) => handleEditChange('last_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Service No</label>
                  <input value={editForm.svc_number} onChange={(e) => handleEditChange('svc_number', e.target.value)} maxLength={7} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Role</label>
                  <select value={editForm.role} onChange={(e) => handleEditChange('role', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm">
                    {EDITABLE_ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Email</label>
                  <input value={editForm.email} onChange={(e) => handleEditChange('email', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Phone</label>
                  <input value={editForm.phone_number} onChange={(e) => handleEditChange('phone_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Rank</label>
                  <select value={editForm.rank || ''} onChange={(e) => handleEditChange('rank', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm">
                    <option value="">Unassigned</option>
                    {RANK_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Unit</label>
                  <input value={editForm.unit || ''} onChange={(e) => handleEditChange('unit', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </div>

                {editForm.role === 'student' && (
                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">
                      Class <span className="text-neutral-400 font-normal">(assign the student to a class)</span>
                    </label>
                    <select
                      value={editForm.class_obj || ''}
                      onChange={(e) => handleEditChange('class_obj', e.target.value)}
                      className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm"
                    >
                      <option value="">— Select a class —</option>
                      {classesList.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || c.class_code || `Class ${c.id}`}</option>
                      ))}
                    </select>
                    {!editForm.class_obj && (
                      <p className="text-xs text-amber-600 mt-1">No class selected — student will be unassigned.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center mt-4 pt-4 border-t border-neutral-200">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={!!editForm.is_active} onChange={(e) => handleEditChange('is_active', e.target.checked)} />
                  <span className="text-sm text-neutral-700">Active</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                <div className="flex items-center gap-2">
                  {/* no left-side actions for leadership modal currently */}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {editLoading ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
