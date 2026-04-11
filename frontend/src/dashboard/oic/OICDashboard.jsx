import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import * as Icons from 'lucide-react'
import { getOICOverview } from '../../lib/api'
import useToast from '../../hooks/useToast'

export default function OICDashboard() {
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
        const res = await getOICOverview()
        setData(res)
      } catch (err) {
        setError(err?.message || 'Failed to load dashboard')
        reportError(err?.message || 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    })()
  }, [reportError])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">OIC Dashboard</h2>
        <p className="text-sm text-gray-500">Overview of Assigned Classes</p>
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
          {/* Pending remarks banner */}
          {data?.pending_actions?.reports_awaiting_your_remarks > 0 && (
            <Link
              to="/oic/exam-reports"
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

          {/* Stat cards — row 1 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Link to="/oic/classes" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Assigned Classes" value={data?.counts?.assigned_classes} icon="Layers" accent="bg-indigo-600" colored />
            </Link>
            <Link to="/oic/classes" className="block focus:outline-none focus:ring-2 focus:ring-emerald-200 rounded-lg">
              <Card title="Active Classes" value={data?.counts?.active_classes} icon="CheckCircle" accent="bg-emerald-500" colored />
            </Link>
            <Card title="Total Enrollments" value={data?.counts?.total_enrollments} icon="ClipboardList" accent="bg-sky-500" colored />
            <Card title="Total Subjects" value={data?.counts?.total_subjects} icon="BookOpen" accent="bg-amber-500" colored />
          </section>

          {/* Stat cards — row 2 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Link to="/oic/remarks" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="My Remarks" value={data?.counts?.my_remarks} icon="MessageSquare" accent="bg-pink-500" colored />
            </Link>
            <Link to="/oic/exam-reports" className="block focus:outline-none focus:ring-2 focus:ring-amber-200 rounded-lg">
              <Card
                title="Pending Remarks"
                value={data?.pending_actions?.reports_awaiting_your_remarks ?? 0}
                icon="AlertCircle"
                accent="bg-amber-500"
                colored
              />
            </Link>
            <Link to="/oic/comparison" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Class Comparison" value="View" icon="BarChart2" accent="bg-neutral-400" colored />
            </Link>
            <Link to="/oic/attendance" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
              <Card title="Attendance Sessions" value="View" icon="UserCheck" accent="bg-emerald-500" colored />
            </Link>
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
              <Link to="/oic/attendance" className="mt-3 block text-xs text-indigo-600 hover:underline">
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
              <Link to="/oic/exam-reports" className="mt-3 block text-xs text-indigo-600 hover:underline">
                View exam reports →
              </Link>
            </div>
          </section>

        </>
      )}
    </div>
  )
}
