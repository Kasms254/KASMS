import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ClipboardList, FilePlus2, Search, ChevronLeft, ChevronRight, LayoutGrid, LayoutDashboard } from 'lucide-react'
import * as api from '../../../lib/api'
import useRequirementChoices from './useRequirementChoices'
import { ErrorBanner, PriorityBadge, Spinner, StatusBadge } from './RequirementFields'
import { labelFor } from './requirementsConfig'

const PAGE_SIZE = 20

export default function RequirementsList() {
  const navigate = useNavigate()
  const { choices } = useRequirementChoices()
  const [tab, setTab] = useState('queue')
  const [filters, setFilters] = useState({ assessed_role: '', status: '', reviewer_priority: '', dashboard_requested: false })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ query: null, results: [], count: 0, error: '' })

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (tab === 'mine') params.set('mine', 'true')
    if (filters.assessed_role) params.set('assessed_role', filters.assessed_role)
    if (filters.status) params.set('status', filters.status)
    if (filters.reviewer_priority) params.set('reviewer_priority', filters.reviewer_priority)
    if (filters.dashboard_requested) params.set('dashboard_requested', 'true')
    if (debouncedSearch) params.set('search', debouncedSearch)
    params.set('ordering', tab === 'queue' ? '-submitted_at' : '-updated_at')
    return params.toString()
  }, [tab, filters, debouncedSearch, page])

  useEffect(() => {
    let cancelled = false
    api.getRoleRequirements(query)
      .then((res) => { if (!cancelled) setResult({ query, results: res.results || [], count: res.count || 0, error: '' }) })
      .catch((err) => { if (!cancelled) setResult({ query, results: [], count: 0, error: err.message || 'Could not load requirements.' }) })
    return () => { cancelled = true }
  }, [query])

  const loading = result.query !== query
  const data = result
  const error = loading ? '' : result.error

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1) }
  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))
  const statusOptions = (choices?.statuses || []).filter((s) => tab === 'mine' || s.value !== 'draft')
  const selectClass = 'border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Role Requirements</h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            Structured requirements from HQ offices. Each request is reviewed before anything is built.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/superadmin/requirements/summary" className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" aria-hidden="true" /> Summary by office
          </Link>
          <Link to="/superadmin/requirements/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 text-sm shadow-sm">
            <FilePlus2 className="w-4 h-4" aria-hidden="true" /> New assessment
          </Link>
        </div>
      </header>

      <div role="tablist" aria-label="Requirement lists" className="flex gap-2">
        {[
          { key: 'queue', label: 'Review queue' },
          { key: 'mine', label: 'Recorded by me' },
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => { setTab(t.key); setPage(1); setFilters((f) => ({ ...f, status: '' })) }}
            className={`px-4 py-2 rounded-lg text-sm border ${tab === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search requirements"
            placeholder="Search problem, designation, unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <select aria-label="Office" value={filters.assessed_role} onChange={(e) => setFilter('assessed_role', e.target.value)} className={selectClass}>
          <option value="">All offices</option>
          {(choices?.assessed_roles || []).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Reviewer priority" value={filters.reviewer_priority} onChange={(e) => setFilter('reviewer_priority', e.target.value)} className={selectClass}>
          <option value="">Any priority</option>
          {(choices?.priorities || []).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-700 lg:col-span-5">
          <input
            type="checkbox"
            checked={filters.dashboard_requested}
            onChange={(e) => setFilter('dashboard_requested', e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-200"
          />
          Only requests where a dashboard or consolidated overview was requested
        </label>
      </div>

      <ErrorBanner message={error} />

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {loading ? <Spinner /> : data.results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500 text-sm">
            <ClipboardList className="w-10 h-10 mb-3 text-neutral-300" aria-hidden="true" />
            {tab === 'mine' ? 'You have not recorded any requirements yet.' : 'No submitted requirements match these filters.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {['Office', 'Problem', 'Status', 'Priority', 'Recorded by', 'Submitted'].map((h) => (
                      <th key={h} scope="col" className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.results.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/superadmin/requirements/${row.id}`)}
                      className="hover:bg-neutral-50 cursor-pointer"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-black whitespace-nowrap">
                        <Link to={`/superadmin/requirements/${row.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-indigo-700">
                          {row.assessed_role_label}
                        </Link>
                        {row.submission_type === 'revision' && <span className="ml-2 text-xs text-neutral-500">(revision)</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-700 max-w-md">
                        <span className="line-clamp-2">{row.problem_summary || <span className="italic text-neutral-400">No problem stated yet</span>}</span>
                        <span className="flex gap-2 mt-1">
                          {row.dashboard_requested && (
                            <span className="inline-flex items-center gap-1 text-xs text-purple-700"><LayoutDashboard className="w-3 h-3" aria-hidden="true" />Dashboard requested</span>
                          )}
                          {row.duplicate_of && <span className="text-xs text-amber-700">Linked duplicate</span>}
                        </span>
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={row.status} label={row.status_label} /></td>
                      <td className="py-3 px-4"><PriorityBadge priority={row.reviewer_priority} label={labelFor(choices?.priorities, row.reviewer_priority)} /></td>
                      <td className="py-3 px-4 text-sm text-neutral-700 whitespace-nowrap">{row.is_mine ? 'You' : row.created_by_name}</td>
                      <td className="py-3 px-4 text-sm text-neutral-500 whitespace-nowrap">
                        {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 text-sm text-neutral-600">
              <span>{data.count} total</span>
              <div className="flex items-center gap-2">
                <button aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 hover:bg-neutral-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {page} of {totalPages}</span>
                <button aria-label="Next page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 hover:bg-neutral-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
