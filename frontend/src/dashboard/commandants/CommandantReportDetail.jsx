import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Send, Download, Edit, Loader, Users, BookOpen,
  Award, TrendingUp, CheckCircle, Clock,
} from 'lucide-react'
import {
  getCommandantReportDetail,
  submitCommandantReport,
  downloadCommandantReportPdf,
} from '../../lib/api'

const STATUS_BADGE = {
  draft: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
  submitted: 'bg-blue-100 text-blue-700 border border-blue-300',
  reviewed: 'bg-green-100 text-green-700 border border-green-300',
  archived: 'bg-gray-100 text-gray-600 border border-gray-300',
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatCard({ label, value, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colors[color]}`}>
      {Icon && <Icon size={22} className="shrink-0" />}
      <div>
        <div className="text-2xl font-bold text-gray-900">{value ?? '—'}</div>
        <div className="text-xs font-medium uppercase tracking-wide text-gray-900">{label}</div>
      </div>
    </div>
  )
}

function NarrativeSection({ title, content, className = '' }) {
  if (!content?.trim()) return null
  return (
    <div className={className}>
      <h4 className="text-sm font-semibold text-gray-900 mb-1">{title}</h4>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-900 whitespace-pre-wrap">
        {content}
      </div>
    </div>
  )
}

export default function CommandantReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const { data: report, isPending, error } = useQuery({
    queryKey: ['commandant-report', id],
    queryFn: () => getCommandantReportDetail(id),
    staleTime: 60 * 1000,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitCommandantReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commandant-reports'] })
      queryClient.invalidateQueries({ queryKey: ['commandant-report', id] })
      setConfirmSubmit(false)
    },
    onError: (err) => {
      setSubmitError(err?.message || 'Failed to submit report.')
    },
  })

  if (isPending) return (
    <div className="flex items-center justify-center py-20">
      <Loader className="animate-spin text-blue-600" size={28} />
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-600">Failed to load report: {error.message}</div>
  )

  const stats = report?.statistics || {}
  const students = stats.students || {}
  const courses = stats.courses || {}
  const instructors = stats.instructors || {}
  const performance = stats.performance || {}
  const ratio = instructors.ratio || {}

  const isDraft = report.status === 'draft'
  const avgPct = performance.school_average_percentage || 0
  const barWidth = Math.min(parseFloat(avgPct), 100)

  const commandantName = [report.commandant_rank_display, report.commandant_name].filter(Boolean).join(' ')
  const commandantDisplay = commandantName && report.commandant_svc_number
    ? `${commandantName} (${report.commandant_svc_number})`
    : commandantName

  return (
    <div className="w-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/commandant/reports')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-900">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">{report.title}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[report.status]}`}>
                {report.status?.charAt(0).toUpperCase() + report.status?.slice(1)}
              </span>
            </div>
            <p className="text-sm text-gray-900">
              Period: {formatDate(report.reporting_period_start)} — {formatDate(report.reporting_period_end)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {isDraft && (
            <Link
              to={`/commandant/reports/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900"
            >
              <Edit size={14} /> Edit
            </Link>
          )}
          <button
            onClick={async () => {
              try {
                const blob = await downloadCommandantReportPdf(id)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `report_${id}.pdf`
                a.click()
                URL.revokeObjectURL(url)
              } catch { /* silently ignore */ }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900"
          >
            <Download size={14} /> PDF
          </button>
          {isDraft && (
            <button
              onClick={() => setConfirmSubmit(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800"
            >
              <Send size={14} /> Submit Report
            </button>
          )}
        </div>
      </div>

      {/* Info block */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-900">
        <div><span className="block font-semibold">School</span><span className="font-medium">{report.school_name} ({report.school_code})</span></div>
        <div><span className="block font-semibold">Commandant</span><span className="font-medium">{commandantDisplay || '—'}</span></div>
        <div><span className="block font-semibold">Report Date</span><span className="font-medium">{formatDate(report.report_date)}</span></div>
        {report.submitted_at && <div><span className="block font-semibold">Submitted</span><span className="font-medium">{formatDate(report.submitted_at)}</span></div>}
      </div>

      {/* Statistics */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b">
          <TrendingUp size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">School Statistics</h3>
          {isDraft && <span className="ml-auto text-xs text-gray-900 italic">Computed live — will be frozen on submission</span>}
        </div>

        {/* Student, instructor & course counts — one row of 8 once there's room */}
        <div className="grid grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8 gap-3 mb-4">
          <StatCard label="Total Students" value={students.total ?? 0} icon={Users} color="blue" />
          <StatCard label="Active Students" value={students.active ?? 0} icon={Users} color="green" />
          <StatCard label="Total Instructors" value={instructors.total ?? 0} icon={Users} color="purple" />
          <StatCard label="Active Instructors" value={instructors.active ?? 0} icon={Users} color="yellow" />
          <StatCard label="Total Courses" value={courses.total ?? 0} icon={BookOpen} color="blue" />
          <StatCard label="Running" value={courses.running ?? 0} icon={Clock} color="green" />
          <StatCard label="Completed" value={courses.completed ?? 0} icon={CheckCircle} color="purple" />
          <StatCard label="Upcoming" value={courses.upcoming ?? 0} icon={BookOpen} color="yellow" />
        </div>

        <div className="grid gap-3 mb-4 lg:grid-cols-2">
          {/* Ratio */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-900 mb-1">Instructor : Student Ratio</p>
            <p className="text-xl font-bold text-gray-900">{ratio.ratio_text || 'N/A'}</p>
            <p className="text-xs text-gray-900 mt-1">
              {instructors.active ?? 0} active instructors · {students.active ?? 0} active students
            </p>
          </div>

          {/* Performance */}
          <div className="border border-gray-200 bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-900">School Average Performance</p>
              <span className="text-lg font-bold text-gray-900">{avgPct.toFixed(1)}%</span>
            </div>
            <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <p className="text-xs text-gray-900 mt-1">Based on submitted exam results within the reporting period.</p>
          </div>
        </div>

        {/* Students per course */}
        {(students.per_course ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">Students by Course</p>
            <div className="border border-gray-200 rounded-lg overflow-x-auto text-sm text-gray-900">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-900 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Course</th>
                    <th className="text-left px-4 py-2">Code</th>
                    <th className="text-right px-4 py-2">Students</th>
                  </tr>
                </thead>
                <tbody>
                  {students.per_course.map((c, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">{c.course_name}</td>
                      <td className="px-4 py-2">{c.course_code}</td>
                      <td className="px-4 py-2 text-right font-medium">{c.student_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Narrative */}
      {(report.observations || report.challenges || report.achievements || report.recommendations || report.overall_remarks) && (
        <section className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b">
            <Award size={18} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900">Commandant's Narrative</h3>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <NarrativeSection title="Observations" content={report.observations} />
            <NarrativeSection title="Challenges" content={report.challenges} />
            <NarrativeSection title="Achievements" content={report.achievements} />
            <NarrativeSection title="Recommendations" content={report.recommendations} />
            <NarrativeSection title="Overall Remarks" content={report.overall_remarks} className="xl:col-span-2" />
          </div>
        </section>
      )}

      {/* Audit log */}
      {(report.audit_logs ?? []).length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-3 pb-2 border-b">Audit Trail</h3>
          <ul className="space-y-2">
            {report.audit_logs.map((log, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-900">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <div>
                  <span className="font-medium capitalize">{log.action}</span>
                  {log.performed_by && <span> by {log.performed_by}</span>}
                  {log.notes && <span> — {log.notes}</span>}
                  <span className="block text-xs">{formatDate(log.timestamp)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Submit confirmation modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="font-semibold text-gray-900 mb-2 text-lg">Submit Report?</h3>
            <p className="text-sm text-gray-900 mb-2">
              Once submitted, this report will be locked and made available to the Chief of Training.
              You will not be able to edit it afterwards.
            </p>
            <p className="text-sm text-gray-900 mb-4">
              School statistics will be computed and frozen at the time of submission.
            </p>
            {submitError && <p className="text-sm text-red-600 mb-3">{submitError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setConfirmSubmit(false); setSubmitError(null) }}
                className="px-4 py-2 text-sm text-gray-900 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {submitMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
