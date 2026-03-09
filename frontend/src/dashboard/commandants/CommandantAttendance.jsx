import { useEffect, useState, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { getCommandantAttendance, getCommandantAttendanceClassSummary } from '../../lib/api'
import useToast from '../../hooks/useToast'

const STATUS_BADGE = {
  completed: 'bg-green-100 text-green-700',
  ongoing: 'bg-sky-100 text-sky-700',
  scheduled: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function CommandantAttendance() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [classSummary, setClassSummary] = useState([])
  const [view, setView] = useState('sessions')
  const [search, setSearch] = useState('')
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
        const data = await getCommandantAttendanceClassSummary()
        const list = Array.isArray(data) ? data : data?.results ?? data?.classes ?? []
        setClassSummary(list)
      } catch { /* ignore */ }
    })()
  }, [])

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        let params = `page=${page}&page_size=${PAGE_SIZE}`
        if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
        const data = await getCommandantAttendance(params)
        const list = Array.isArray(data) ? data : data?.results ?? []
        setSessions(list)
        if (data?.count !== undefined) setTotalPages(Math.ceil(data.count / PAGE_SIZE))
      } catch (err) {
        reportError(err?.message || 'Failed to load attendance')
      } finally {
        setLoading(false)
      }
    })()
  }, [search, page, reportError])

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Attendance</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Attendance sessions and class summaries</p>
        </div>
        {/* View toggle */}
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
          {['sessions', 'by class'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition ${
                view === v ? 'bg-white shadow-sm text-black' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:gap-6">
        {view === 'sessions' ? (
          <>
            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
              <div className="relative">
                <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-6">
                <EmptyState icon="Loader2" title="Loading sessions..." variant="minimal" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="bg-white rounded-xl border border-neutral-200">
                <EmptyState icon="UserCheck" title="No attendance sessions found" description="No sessions match your search." />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {/* Mobile */}
                <div className="lg:hidden p-4 space-y-3">
                  {sessions.map((s) => (
                    <div key={s.id} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-black">{s.title || s.name || `Session #${String(s.id).slice(0, 8)}`}</p>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold capitalize ml-2 flex-shrink-0 ${STATUS_BADGE[s.status] || 'bg-neutral-100 text-neutral-600'}`}>
                          {s.status || '—'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">Class: {s.class_name || s.class_obj?.name || '—'}</p>
                      <p className="text-xs text-neutral-400 mt-1">{formatDate(s.scheduled_start)}</p>
                    </div>
                  ))}
                </div>

                {/* Desktop */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-neutral-50">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Session</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Scheduled</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 bg-white">
                      {sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-neutral-50 transition">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 flex-shrink-0">
                                <LucideIcons.UserCheck className="w-4 h-4" strokeWidth={1.5} />
                              </div>
                              <span className="text-sm font-medium text-black">{s.title || s.name || `Session #${String(s.id).slice(0, 8)}`}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700">{s.class_name || s.class_obj?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(s.scheduled_start)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_BADGE[s.status] || 'bg-neutral-100 text-neutral-600'}`}>
                              {s.status || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

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
          </>
        ) : (
          /* By Class view */
          classSummary.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200">
              <EmptyState icon="TrendingUp" title="No class attendance data" description="Attendance summaries will appear here once sessions are recorded." />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {classSummary.map((cls) => {
                const rate = cls.attendance_rate ?? (
                  cls.present_count != null && cls.total_count
                    ? Math.round((cls.present_count / cls.total_count) * 100)
                    : null
                )
                return (
                  <div key={cls.class_id || cls.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 flex-shrink-0">
                        <LucideIcons.TrendingUp className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <p className="text-sm font-medium text-black truncate">{cls.class_name || cls.name}</p>
                    </div>
                    <dl className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <dt className="text-neutral-500">Sessions</dt>
                        <dd className="font-medium text-black">{cls.total_sessions ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between text-sm">
                        <dt className="text-neutral-500">Completed</dt>
                        <dd className="font-medium text-black">{cls.completed_sessions ?? '—'}</dd>
                      </div>
                      {rate != null && (
                        <div className="flex justify-between text-sm">
                          <dt className="text-neutral-500">Attendance Rate</dt>
                          <dd className={`font-semibold ${rate >= 75 ? 'text-green-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {rate}%
                          </dd>
                        </div>
                      )}
                    </dl>
                    {rate != null && (
                      <div className="mt-3 w-full bg-neutral-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${rate >= 75 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(rate, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </section>
    </div>
  )
}
