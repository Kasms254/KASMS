import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { getCommandantUsers, getCommandantUsersSummary } from '../../lib/api'
import useToast from '../../hooks/useToast'

function initials(name = '') {
  return name.split(' ').map((s) => s[0] || '').slice(0, 2).join('').toUpperCase()
}

const ROLE_META = {
  student: {
    label: 'Students',
    icon: 'GraduationCap',
    accent: 'bg-indigo-100 text-indigo-700',
    cardAccent: 'bg-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  instructor: {
    label: 'Instructors',
    icon: 'BookOpen',
    accent: 'bg-sky-100 text-sky-700',
    cardAccent: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-700',
  },
  commandant: {
    label: 'Commandants',
    icon: 'Shield',
    accent: 'bg-purple-100 text-purple-700',
    cardAccent: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700',
  },
  chief_instructor: {
    label: 'Chief Instructors',
    icon: 'Star',
    accent: 'bg-emerald-100 text-emerald-700',
    cardAccent: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  admin: {
    label: 'Admins',
    icon: 'Settings',
    accent: 'bg-amber-100 text-amber-700',
    cardAccent: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
}

export default function CommandantUsers({ initialRole = '' }) {
  const toast = useToast()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState(initialRole || '')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const PAGE_SIZE = 20

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getCommandantUsersSummary()
        setSummary(data)
      } catch { /* ignore */ }
    })()
  }, [])

  // If route path includes 'students' or 'instructors' and no initialRole provided,
  // set the roleFilter accordingly so dedicated pages work even if props are not passed.
  useEffect(() => {
    if (initialRole) return
    const path = location.pathname || ''
    if (path.endsWith('/students') && roleFilter !== 'student') setRoleFilter('student')
    else if (path.endsWith('/instructors') && roleFilter !== 'instructor') setRoleFilter('instructor')
  }, [location.pathname, initialRole, roleFilter])

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        let params = `page=${page}&page_size=${PAGE_SIZE}`
        if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
        if (roleFilter) params += `&role=${roleFilter}`
        const data = await getCommandantUsers(params)
        const list = Array.isArray(data) ? data : data?.results ?? []
        setUsers(list)
        if (data?.count !== undefined) setTotalPages(Math.ceil(data.count / PAGE_SIZE))
      } catch (err) {
        reportError(err?.message || 'Failed to load users')
      } finally {
        setLoading(false)
      }
    })()
  }, [search, roleFilter, page, reportError])

  function selectRole(role) {
    setRoleFilter((prev) => (prev === role ? '' : role))
    setPage(1)
  }

  const byRole = summary?.by_role || {}
  const roleEntries = Object.entries(byRole).filter(([, count]) => count > 0)

  const headerTitle = roleFilter ? (ROLE_META[roleFilter]?.label || roleFilter) : 'Users'

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">{headerTitle}</h2>
          <p className="text-xs sm:text-sm text-neutral-500">All active members of this school</p>
        </div>
        {roleFilter && (
          <button
            onClick={() => { setRoleFilter(''); setPage(1) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition"
          >
            <LucideIcons.X className="w-3.5 h-3.5" />
            Clear filter
          </button>
        )}
      </header>

      <section className="grid gap-4 sm:gap-6">
        {/* Role cards — clickable to filter */}
        {summary && roleEntries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Total card */}
            <button
              onClick={() => { setRoleFilter(''); setPage(1) }}
              className={`relative text-left rounded-xl border shadow-sm p-4 transition hover:shadow-md ${
                roleFilter === ''
                  ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total</span>
                <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                  <LucideIcons.Users className="w-4 h-4" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-black">{summary.total ?? 0}</p>
              <p className="text-xs text-neutral-500 mt-0.5">Members</p>
            </button>

            {roleEntries.map(([role, count]) => {
              const meta = ROLE_META[role] || { label: role, icon: 'User', accent: 'bg-neutral-100 text-neutral-600', badge: 'bg-neutral-100 text-neutral-600' }
              const Icon = LucideIcons[meta.icon] || LucideIcons.User
              const isActive = roleFilter === role
              return (
                <button
                  key={role}
                  onClick={() => selectRole(role)}
                  className={`relative text-left rounded-xl border shadow-sm p-4 transition hover:shadow-md ${
                    isActive
                      ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider truncate pr-1">
                      {meta.label}
                    </span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.accent}`}>
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                  </div>
                  <p className="text-2xl font-semibold text-black">{count}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {isActive ? 'Showing ↓' : 'Click to filter'}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="relative">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={roleFilter ? `Search ${ROLE_META[roleFilter]?.label || roleFilter}...` : 'Search by name or service number...'}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        {/* Active filter banner */}
        {roleFilter && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium ${ROLE_META[roleFilter]?.badge || 'bg-neutral-100 text-neutral-700'} border-current/20`}>
            <LucideIcons.Filter className="w-4 h-4" />
            Showing {ROLE_META[roleFilter]?.label || roleFilter} only
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <EmptyState icon="Loader2" title="Loading users..." variant="minimal" />
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200">
            <EmptyState
              icon="Users"
              title="No users found"
              description={
                search
                  ? `No ${ROLE_META[roleFilter]?.label || 'users'} match "${search}".`
                  : roleFilter
                  ? `No ${ROLE_META[roleFilter]?.label || 'users'} found.`
                  : 'No users available.'
              }
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Mobile card view */}
            <div className="lg:hidden p-4 space-y-3">
              {users.map((u) => {
                const fullName = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
                const meta = ROLE_META[u.role] || { badge: 'bg-neutral-100 text-neutral-600', label: u.role }
                return (
                  <div key={u.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${meta.accent || 'bg-indigo-100 text-indigo-700'}`}>
                        {initials(fullName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-black truncate">{fullName}</p>
                        <p className="text-xs text-neutral-500">{u.svc_number || '—'}</p>
                      </div>
                      <span className={`ml-auto text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0 ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 space-y-1">
                      <p>Rank: <span className="text-black capitalize">{u.rank ? u.rank.replace(/_/g, ' ') : '—'}</span></p>
                      <p>Unit: <span className="text-black">{u.unit || '—'}</span></p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Svc No.</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                    {!roleFilter && <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>}
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {users.map((u) => {
                    const fullName = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
                    const meta = ROLE_META[u.role] || { badge: 'bg-neutral-100 text-neutral-600', label: u.role, accent: 'bg-indigo-100 text-indigo-700' }
                    return (
                      <tr key={u.id} className="hover:bg-neutral-50 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0 ${meta.accent}`}>
                              {initials(fullName)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-black">{fullName}</p>
                              <p className="text-xs text-neutral-500">{u.email || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{u.svc_number || '—'}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700 capitalize">{u.rank ? u.rank.replace(/_/g, ' ') : '—'}</td>
                        {!roleFilter && (
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm text-neutral-700">{u.unit || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                <p className="text-xs text-neutral-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-40 transition">Previous</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
