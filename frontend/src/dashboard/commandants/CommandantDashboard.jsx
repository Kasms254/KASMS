import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import * as LucideIcons from 'lucide-react'
import { getCommandantOverview } from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'

export default function CommandantDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

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

  const roleLabel = user?.role === 'chief_instructor' ? 'Chief Instructor' : 'Commandant'

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">{roleLabel} Dashboard</h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            {data?.school?.name ? `${data.school.name} — overview` : 'Overview of school operations'}
          </p>
        </div>
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
        <section className="grid gap-4 sm:gap-6">

          {/* Pending remark banner */}
          {data?.pending_actions?.reports_awaiting_your_remarks > 0 && (
            <Link
              to="/commandant/exam-reports"
              className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 no-underline hover:bg-amber-100 transition"
            >
              <LucideIcons.AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                {data.pending_actions.reports_awaiting_your_remarks} exam{' '}
                {data.pending_actions.reports_awaiting_your_remarks === 1 ? 'report' : 'reports'} awaiting your remark
              </span>
              <span className="ml-auto text-xs text-amber-700 underline">Review now →</span>
            </Link>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/commandant/users" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl">
              <Card title="Students" value={data?.counts?.total_students} icon="Users" accent="bg-indigo-600" colored />
            </Link>
            <Link to="/commandant/users" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl">
              <Card title="Instructors" value={data?.counts?.total_instructors} icon="GraduationCap" accent="bg-sky-500" colored />
            </Link>
            <Link to="/commandant/departments" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl">
              <Card title="Departments" value={data?.counts?.departments} icon="Building" accent="bg-emerald-500" colored />
            </Link>
            <Link to="/commandant/classes" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl">
              <Card title="Active Classes" value={data?.counts?.active_classes} icon="Layers" accent="bg-pink-500" colored />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/commandant/exam-reports" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl">
              <Card title="Exam Reports" value={data?.counts?.exam_reports} icon="FileBarChart" accent="bg-amber-500" colored />
            </Link>
            <Link to="/commandant/certificates" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl">
              <Card title="Certificates Issued" value={data?.counts?.certificates_issued} icon="Award" accent="bg-emerald-500" colored />
            </Link>
            <Card title="Total Enrollments" value={data?.counts?.total_enrollments} icon="ClipboardList" accent="bg-indigo-500" colored />
            <Card title="Courses" value={data?.counts?.courses} icon="BookOpen" accent="bg-neutral-400" colored />
          </div>

          {/* Attendance + Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  { label: 'Average Score', value: data?.exam_performance?.average_performance != null ? `${data.exam_performance.average_performance}%` : '—' },
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
          </div>

        </section>
      )}
    </div>
  )
}
