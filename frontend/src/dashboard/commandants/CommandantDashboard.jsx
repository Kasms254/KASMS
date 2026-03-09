import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Card from '../../components/Card'
import UserCard from '../../components/UserCard'
import Calendar from '../../components/Calendar'
import EmptyState from '../../components/EmptyState'
import * as Icons from 'lucide-react'
import { getCommandantOverview, getCommandantNotices } from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'

export default function CommandantDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [calendarEvents, setCalendarEvents] = useState({})
  const [recentItems, setRecentItems] = useState([])
  const [recentLoading, setRecentLoading] = useState(true)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  // Load main overview data
  useEffect(() => {
    ;(async () => {
      try {
        const res = await getCommandantOverview()
        setData(res)
      } catch (err) {
        setError(err?.message || 'Failed to load dashboard')
        reportError(err?.message || 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    })()
  }, [reportError])

  // Load notices and map to calendar events
  useEffect(() => {
    let mounted = true

    const pad = (n) => String(n).padStart(2, '0')
    const toISO = (d) => {
      try {
        const dt = new Date(d)
        if (Number.isNaN(dt.getTime())) return null
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
      } catch { return null }
    }

    async function loadNotices() {
      try {
        const resp = await getCommandantNotices().catch(() => [])
        const notices = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.results) ? resp.results : [])
        const ev = {}
        notices.forEach((n) => {
          const date = n?.expiry_date || n?.expiry || n?.created_at || n?.created
          const iso = date ? toISO(date) : null
          if (!iso) return
          ev[iso] = ev[iso] || []
          ev[iso].push({
            kind: 'notice',
            title: n.title || 'Notice',
            noticeId: n.id,
            priority: n.priority || null,
            expiry_date: n.expiry_date || null,
          })
        })

        // Also build recent items from notices
        const nItems = notices.map((n) => ({
          kind: 'notice',
          id: n.id,
          title: n.title || 'Notice',
          date: n.created_at || n.created || n.start_date || null,
          meta: n,
        }))

        if (mounted) {
          setCalendarEvents(ev)
          setRecentItems((prev) => {
            const merged = [...nItems, ...prev.filter((i) => i.kind !== 'notice')]
            const normalized = merged
              .map((i) => ({ ...i, _date: i.date ? new Date(i.date) : null }))
              .filter((i) => i._date && !Number.isNaN(i._date.getTime()))
            normalized.sort((a, b) => b._date - a._date)
            return normalized.slice(0, 8)
          })
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setRecentLoading(false)
      }
    }

    loadNotices()
    return () => { mounted = false }
  }, [])

  const roleLabel = user?.role === 'chief_instructor' ? 'Chief Instructor' : 'Commandant'

  return (
    <div>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">{roleLabel} Dashboard</h2>
        <p className="text-sm text-gray-500">
          {data?.school?.name ? `${data.school.name} — Overview` : 'Overview of School Operations'}
        </p>
      </header>

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="Loader2" title="Loading dashboard..." variant="minimal" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <EmptyState icon="AlertCircle" title="Failed to load dashboard" description={error} variant="minimal" />
        </div>
      ) : (
        <>
          {/* Pending remark banner */}
          {data?.pending_actions?.reports_awaiting_your_remarks > 0 && (
            <Link
              to="/commandant/exam-reports"
              className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 no-underline hover:bg-amber-100 transition"
            >
              <Icons.AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                {data.pending_actions.reports_awaiting_your_remarks} exam{' '}
                {data.pending_actions.reports_awaiting_your_remarks === 1 ? 'report' : 'reports'} awaiting your remark
              </span>
              <span className="ml-auto text-xs text-amber-700 underline">Review now →</span>
            </Link>
          )}

          {/* Top stat cards — row 1 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Link to="/commandant/users/students" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <UserCard type="students" count={data?.counts?.total_students} />
            </Link>
            <Link to="/commandant/users/instructors" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <UserCard type="instructors" count={data?.counts?.total_instructors} />
            </Link>
            <Link to="/commandant/departments" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Departments" value={data?.counts?.departments} icon="Building" accent="bg-emerald-500" colored />
            </Link>
            <Link to="/commandant/classes" className="block focus:outline-none focus:ring-pink-200 focus:ring-2 rounded-lg">
              <Card title="Active Classes" value={data?.counts?.active_classes} icon="Layers" accent="bg-pink-500" colored />
            </Link>
          </section>

          {/* Stat cards — row 2 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Link to="/commandant/exam-reports" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Exam Reports" value={data?.counts?.exam_reports} icon="FileBarChart" accent="bg-amber-500" colored />
            </Link>
            <Link to="/commandant/certificates" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Certificates Issued" value={data?.counts?.certificates_issued} icon="Award" accent="bg-emerald-500" colored />
            </Link>
            <Card title="Total Enrollments" value={data?.counts?.total_enrollments} icon="ClipboardList" accent="bg-indigo-500" colored />
            <Link to="/commandant/courses" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Courses" value={data?.counts?.courses} icon="BookOpen" accent="bg-neutral-400" colored />
            </Link>
          </section>

          {/* Calendar + Latest Activity */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 items-stretch">
            <div>
              <Calendar events={calendarEvents} />
            </div>

            <div className="bg-white text-neutral-800 rounded-xl p-4 border border-neutral-200 h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium mb-3">Latest Activity</h3>
              </div>

              {recentLoading && <div className="text-sm text-neutral-500">Loading…</div>}

              {!recentLoading && (!recentItems || recentItems.length === 0) && (
                <div className="text-sm text-neutral-500">No Recent Activity</div>
              )}

              {!recentLoading && recentItems && recentItems.length > 0 && (
                <ul className="relative">
                  {/* vertical timeline line */}
                  <div className="absolute left-6 top-6 bottom-4 w-px bg-neutral-200" aria-hidden="true" />

                  {recentItems.slice(0, 5).map((it, idx) => {
                    const deltaS = it._date ? Math.floor((Date.now() - it._date.getTime()) / 1000) : null
                    const absS = deltaS == null ? null : Math.abs(deltaS)
                    const fmt = (s) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`)
                    const rel = deltaS == null ? '' : (deltaS >= 0 ? `${fmt(absS)} ago` : `in ${fmt(absS)}`)
                    const IconComp = it.kind === 'notice' ? Icons.Megaphone : it.kind === 'exam' ? Icons.Clipboard : Icons.User
                    const iconBg = it.kind === 'notice' ? 'bg-amber-500' : it.kind === 'exam' ? 'bg-sky-500' : 'bg-indigo-500'
                    return (
                      <li key={`${it.kind}-${it.id}-${idx}`} className="relative pl-14 pb-6">
                        <div className="absolute left-0 top-0 w-12 flex items-start justify-center">
                          <div className={`w-8 h-8 rounded-full ${iconBg} shadow-sm flex items-center justify-center`}>
                            {React.createElement(IconComp, { className: 'w-4 h-4 text-white' })}
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-20 text-sm text-neutral-500 mt-0.5">{rel}</div>
                          <div className="flex-1">
                            <div className="text-neutral-800 text-sm font-medium leading-tight">{it.title}</div>
                            <div className="mt-2 text-xs text-neutral-400">
                              {it.kind === 'notice' ? (it.meta?.priority ? `Priority: ${it.meta.priority}` : 'Notice') : it.kind}
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              <Link to="/commandant/notices" className="mt-1 block text-xs text-indigo-600 hover:underline">
                View all notices →
              </Link>
            </div>
          </section>

          {/* Attendance + Exam Performance */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-base font-semibold text-black mb-4">Attendance — Last 30 Days</h3>
              <dl className="space-y-3">
                {[
                  { label: 'Total Sessions', value: data?.attendance_summary?.total_sessions },
                  { label: 'Completed Sessions', value: data?.attendance_summary?.completed_sessions },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <dt className="text-sm text-neutral-500">{label}</dt>
                    <dd className="text-sm font-semibold text-black">{value ?? '—'}</dd>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  <dt className="text-sm text-neutral-500">Attendance Rate</dt>
                  <dd className="text-sm font-semibold text-black">
                    {data?.attendance_summary?.overall_attendance_rate != null
                      ? `${data.attendance_summary.overall_attendance_rate}%`
                      : '—'}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 w-full bg-neutral-100 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data?.attendance_summary?.overall_attendance_rate || 0, 100)}%` }}
                />
              </div>
              <Link to="/commandant/attendance" className="mt-3 block text-xs text-indigo-600 hover:underline">
                View attendance →
              </Link>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-base font-semibold text-black mb-4">Exam Performance</h3>
              <dl className="space-y-3">
                {[
                  { label: 'Total Results', value: data?.exam_performance?.total_results },
                  {
                    label: 'Average Score',
                    value: data?.exam_performance?.average_performance != null
                      ? `${data.exam_performance.average_performance}%`
                      : '—',
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <dt className="text-sm text-neutral-500">{label}</dt>
                    <dd className="text-sm font-semibold text-black">{value ?? '—'}</dd>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  <dt className="text-sm text-neutral-500">Pass Rate</dt>
                  <dd className={`text-sm font-semibold ${(data?.exam_performance?.pass_rate || 0) >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                    {data?.exam_performance?.pass_rate != null ? `${data.exam_performance.pass_rate}%` : '—'}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 w-full bg-neutral-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(data?.exam_performance?.pass_rate || 0, 100)}%` }}
                />
              </div>
              <Link to="/commandant/exam-reports" className="mt-3 block text-xs text-indigo-600 hover:underline">
                View exam reports →
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
