import { useState, useEffect, useCallback, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { getOICAttendance, getOICAttendanceRecords } from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const map = {
    present: 'bg-emerald-100 text-emerald-700',
    late: 'bg-amber-100 text-amber-700',
    absent: 'bg-red-100 text-red-700',
    excused: 'bg-sky-100 text-sky-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status?.toLowerCase()] || 'bg-neutral-100 text-neutral-600'}`}>
      {status || '—'}
    </span>
  )
}

function Pagination({ page, totalPages, totalCount, label, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-neutral-600">
          Page <span className="font-semibold text-black">{page}</span> of{' '}
          <span className="font-semibold text-black">{totalPages}</span>
          {totalCount != null && <> · <span className="font-semibold text-black">{totalCount}</span> {label}</>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onChange(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
            <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
          </button>
          {(() => {
            const pages = []
            const maxVisible = 5
            let start = Math.max(1, page - Math.floor(maxVisible / 2))
            let end = Math.min(totalPages, start + maxVisible - 1)
            if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
            if (start > 1) {
              pages.push(<button key={1} onClick={() => onChange(() => 1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
              if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
            }
            for (let i = start; i <= end; i++) {
              const n = i
              pages.push(
                <button key={n} onClick={() => onChange(() => n)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${page === n ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>
                  {n}
                </button>
              )
            }
            if (end < totalPages) {
              if (end < totalPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
              pages.push(<button key={totalPages} onClick={() => onChange(() => totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalPages}</button>)
            }
            return pages
          })()}
          <button onClick={() => onChange(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
            <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OICAttendance() {
  const toast = useToast()

  // Session list
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 10

  // Detail view
  const [selectedSession, setSelectedSession] = useState(null)
  const [records, setRecords] = useState(null)
  const [recordsLoading, setRecordsLoading] = useState(false)

  // Records pagination + search
  const [recordsPage, setRecordsPage] = useState(1)
  const [recordSearch, setRecordSearch] = useState('')
  const recordsPageSize = 10

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}`
      if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
      const data = await getOICAttendance(params)
      const list = Array.isArray(data) ? data : data?.results ?? []
      setSessions(list)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      } else {
        setTotalCount(list.length)
        setTotalPages(1)
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load attendance sessions')
    } finally {
      setLoading(false)
    }
  }, [currentPage, search, reportError])

  useEffect(() => { load() }, [load])

  const openSession = useCallback(async (session) => {
    setSelectedSession(session)
    setRecords(null)
    setRecordsLoading(true)
    setRecordsPage(1)
    setRecordSearch('')
    try {
      const data = await getOICAttendanceRecords(session.id)
      setRecords(data)
    } catch (err) {
      reportError(err?.message || 'Failed to load session records')
    } finally {
      setRecordsLoading(false)
    }
  }, [reportError])

  // Filtered + paginated records
  const allRecords = records?.records || []
  const filteredRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase()
    if (!q) return allRecords
    return allRecords.filter(r =>
      r.student_name?.toLowerCase().includes(q) ||
      r.svc_number?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
    )
  }, [allRecords, recordSearch])
  const totalRecords = filteredRecords.length
  const totalRecordPages = Math.max(1, Math.ceil(totalRecords / recordsPageSize))
  const safeRecordsPage = Math.min(recordsPage, totalRecordPages)
  const pageRecords = filteredRecords.slice((safeRecordsPage - 1) * recordsPageSize, safeRecordsPage * recordsPageSize)

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (selectedSession) {
    return (
      <div>
        {/* Back + header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => { setSelectedSession(null); setRecords(null) }}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <Icons.ChevronLeft className="w-4 h-4" /> Back to sessions
          </button>
        </div>

        {recordsLoading ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <EmptyState icon="Loader2" title="Loading records..." variant="minimal" />
          </div>
        ) : !records ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <EmptyState icon="AlertCircle" title="Failed to load session records" variant="minimal" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Session info card */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-black">
                    {records.session_title || selectedSession.title || 'Session'}
                  </h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    {records.class_name || selectedSession.class_name || '—'}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                    <Icons.Calendar className="w-3 h-3" />
                    {formatDate(selectedSession.scheduled_start)}
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium self-start capitalize ${
                  selectedSession.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                  selectedSession.status === 'active' ? 'bg-sky-100 text-sky-700' :
                  'bg-neutral-100 text-neutral-600'
                }`}>
                  {selectedSession.status || 'N/A'}
                </span>
              </div>

              {records.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Total', value: records.summary.total, color: 'text-black' },
                    { label: 'Present', value: records.summary.present, color: 'text-emerald-600' },
                    { label: 'Late', value: records.summary.late, color: 'text-amber-500' },
                    { label: 'Absent', value: records.summary.absent, color: 'text-red-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-neutral-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-neutral-500">{label}</div>
                      <div className={`text-lg font-semibold mt-0.5 ${color}`}>{value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <div className="relative flex-1">
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    value={recordSearch}
                    onChange={e => { setRecordSearch(e.target.value); setRecordsPage(1) }}
                    placeholder="Search by name, service number or status..."
                    className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                {recordSearch && (
                  <button
                    onClick={() => { setRecordSearch(''); setRecordsPage(1) }}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Records table */}
            {filteredRecords.length === 0 ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-6">
                <EmptyState icon="UserCheck" title="No records found"
                  description={recordSearch ? `No match for "${recordSearch}"` : 'No attendance records for this session.'}
                  variant="minimal" />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100">
                  <span className="text-sm font-medium text-black">Attendance Records</span>
                </div>

                {/* Mobile cards */}
                <div className="lg:hidden p-4 space-y-3">
                  {pageRecords.map((r, i) => (
                    <div key={r.student_id || i} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                          {(r.student_name || '?').split(' ').map(s => s[0] || '').slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-neutral-700">{r.svc_number || '—'}</div>
                          <div className="font-medium text-sm text-black truncate">{r.student_name || '—'}</div>
                        </div>
                        <div className="ml-auto"><StatusBadge status={r.status} /></div>
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center gap-1 mt-1">
                        <Icons.Clock className="w-3 h-3" />
                        {formatDate(r.marked_at)}
                        {r.marking_method && <span className="ml-2 capitalize text-neutral-500">{r.marking_method}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-neutral-50">
                      <tr className="text-left">
                        {['#', 'Svc Number', 'Name', 'Status', 'Method', 'Marked At'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 bg-white">
                      {pageRecords.map((r, i) => (
                        <tr key={r.student_id || i} className="hover:bg-neutral-50 transition">
                          <td className="px-4 py-3 text-sm text-neutral-400">{(safeRecordsPage - 1) * recordsPageSize + i + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-neutral-700 whitespace-nowrap">{r.svc_number || '—'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-black">{r.student_name || '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-3 text-sm text-neutral-500 capitalize">{r.marking_method || '—'}</td>
                          <td className="px-4 py-3 text-sm text-neutral-400">{formatDate(r.marked_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Pagination
              page={safeRecordsPage}
              totalPages={totalRecordPages}
              totalCount={totalRecords}
              label="records"
              onChange={setRecordsPage}
            />
          </div>
        )}
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">Attendance Sessions</h2>
          <p className="text-sm text-neutral-500 mt-1">View attendance sessions for your assigned classes.</p>
        </div>
        <div className="relative">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            className="pl-9 pr-3 py-2 text-sm text-black rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-56"
          />
        </div>
      </header>

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="Loader2" title="Loading sessions..." variant="minimal" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="UserCheck" title="No sessions found" variant="minimal" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  {['#', 'Title', 'Class', 'Date', 'Type', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {sessions.map((s, i) => (
                  <tr
                    key={s.id}
                    onClick={() => openSession(s)}
                    className="hover:bg-indigo-50 cursor-pointer transition group"
                  >
                    <td className="px-4 py-3 text-sm text-neutral-400">{(currentPage - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-black group-hover:text-indigo-600 transition">
                        {s.title || s.session_title || 'Session'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{s.class_name || s.class_obj_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500 whitespace-nowrap">{formatDate(s.scheduled_start)}</td>
                    <td className="px-4 py-3">
                      {s.session_type && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded capitalize">{s.session_type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'active' ? 'bg-sky-100 text-sky-700' :
                        'bg-neutral-100 text-neutral-600'
                      }`}>
                        {s.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition">
                        View <Icons.ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50">
              <p className="text-xs text-neutral-400">Click any row to view attendance records</p>
            </div>
          </div>

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            label="sessions"
            onChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  )
}
