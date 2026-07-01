import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Download, Users, BookOpen, Award, TrendingUp,
  CheckCircle, Clock, Loader, Calendar, User, School,
} from 'lucide-react'
import { getCOTReportDetail, downloadCOTReportPdf } from '../../lib/api'

const MAROON = '#7B1A1A'
const MAROON_LIGHT = '#f9f0f0'

const STATUS_CONFIG = {
  submitted: { label: 'Submitted', cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
  reviewed:  { label: 'Reviewed',  cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
  archived:  { label: 'Archived',  cls: 'bg-gray-100 text-gray-600 border border-gray-300' },
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}


function StatCard({ label, value, icon: Icon, maroon }) {
  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-3"
      style={maroon
        ? { backgroundColor: MAROON_LIGHT, borderColor: '#e8c5c5' }
        : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
      }
    >
      {Icon && (
        <Icon size={20} className="shrink-0" style={{ color: maroon ? MAROON : '#64748b' }} />
      )}
      <div>
        <div className="text-2xl font-bold text-gray-900">{value ?? 0}</div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function NarrativeSection({ title, content }) {
  if (!content?.trim()) return null
  return (
    <div className="mb-5">
      <div
        className="text-xs font-bold uppercase tracking-widest mb-2 px-1"
        style={{ color: MAROON }}
      >
        {title}
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  )
}

export default function COTReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: report, isPending, error } = useQuery({
    queryKey: ['cot-report', id],
    queryFn: () => getCOTReportDetail(id),
    staleTime: 2 * 60 * 1000,
  })

  const handleDownload = async () => {
    try {
      const blob = await downloadCOTReportPdf(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report_${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silently ignore */ }
  }

  if (isPending) return (
    <div className="flex items-center justify-center py-20">
      <Loader className="animate-spin" size={28} style={{ color: MAROON }} />
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
      Failed to load report: {error.message}
    </div>
  )

  const stats = report?.statistics || {}
  const students = stats.students || {}
  const courses = stats.courses || {}
  const instructors = stats.instructors || {}
  const performance = stats.performance || {}
  const ratio = instructors.ratio || {}
  const avgPct = performance.school_average_percentage || 0
  const barWidth = Math.min(parseFloat(avgPct), 100)
  const statusCfg = STATUS_CONFIG[report.status] || { label: report.status, cls: 'bg-gray-100 text-gray-600 border border-gray-300' }
  const commandantDisplay = [report.commandant_rank_display, report.commandant_name].filter(Boolean).join(' ')

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Top bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/cot/reports')}
            className="mt-1 p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{report.title}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-medium text-gray-700">{report.school_name}</span>
              {report.school_code && <span className="text-gray-400"> ({report.school_code})</span>}
              <span className="mx-1.5 text-gray-300">·</span>
              {formatDate(report.reporting_period_start)} — {formatDate(report.reporting_period_end)}
            </p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white rounded-lg shrink-0 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: MAROON }}
        >
          <Download size={14} /> Download PDF
        </button>
      </div>

      {/* Report meta — clearly visible fields */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div
          className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-white"
          style={{ backgroundColor: MAROON }}
        >
          Report Information
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y divide-gray-100">
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <School size={13} className="text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">School</span>
            </div>
            <p className="text-sm font-bold text-gray-900">{report.school_name || '—'}</p>
            {report.school_code && (
              <p className="text-xs text-gray-500 mt-0.5">{report.school_code}</p>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <User size={13} className="text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Commandant</span>
            </div>
            <p className="text-sm font-bold text-gray-900">{commandantDisplay || '—'}</p>
            {report.commandant_svc_number && (
              <p className="text-xs text-gray-500 mt-0.5">Svc No: {report.commandant_svc_number}</p>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar size={13} className="text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Report Date</span>
            </div>
            <p className="text-sm font-bold text-gray-900">{formatDate(report.report_date)}</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle size={13} className="text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Submitted</span>
            </div>
            <p className="text-sm font-bold" style={{ color: MAROON }}>{formatDate(report.submitted_at)}</p>
            {report.submitted_by_name && (
              <p className="text-xs text-gray-500 mt-0.5">by {report.submitted_by_name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} style={{ color: MAROON }} />
            <h3 className="font-bold text-gray-900">School Statistics</h3>
          </div>
          <span className="text-xs text-gray-400 italic">Snapshotted at submission time</span>
        </div>

        <div className="p-5 space-y-5">
          {/* Student & Instructor counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Students"      value={students.total ?? 0}      icon={Users}      maroon />
            <StatCard label="Active Students"     value={students.active ?? 0}     icon={Users} />
            <StatCard label="Total Instructors"   value={instructors.total ?? 0}   icon={Users}      maroon />
            <StatCard label="Active Instructors"  value={instructors.active ?? 0}  icon={Users} />
          </div>

          {/* Course counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Courses"   value={courses.total ?? 0}     icon={BookOpen}     maroon />
            <StatCard label="Running"         value={courses.running ?? 0}   icon={Clock} />
            <StatCard label="Completed"       value={courses.completed ?? 0} icon={CheckCircle}  maroon />
            <StatCard label="Upcoming"        value={courses.upcoming ?? 0}  icon={BookOpen} />
          </div>

          {/* Ratio */}
          <div
            className="rounded-xl p-4 border-l-4"
            style={{ backgroundColor: MAROON_LIGHT, borderLeftColor: MAROON }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: MAROON }}>
              Instructor : Student Ratio
            </p>
            <p className="text-xl font-bold text-gray-900">{ratio.ratio_text || 'N/A'}</p>
            <p className="text-xs text-gray-600 mt-1">
              {instructors.active ?? 0} active instructors · {students.active ?? 0} active students
            </p>
          </div>

          {/* Performance bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-800">School Average Performance</p>
              <span className="text-lg font-bold" style={{ color: MAROON }}>
                {avgPct.toFixed ? avgPct.toFixed(1) : avgPct}%
              </span>
            </div>
            <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full" style={{ width: `${barWidth}%`, backgroundColor: MAROON }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Based on submitted examination results for the reporting period
            </p>
          </div>

          {/* Students per course */}
          {(students.per_course ?? []).length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">Students by Course (during period)</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
                <table className="w-full">
                  <thead style={{ backgroundColor: MAROON }}>
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider">Course</th>
                      <th className="text-left px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider">Code</th>
                      <th className="text-right px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.per_course.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{c.course_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{c.course_code}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">{c.student_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Commandant narrative */}
      {(report.observations || report.challenges || report.achievements || report.recommendations || report.overall_remarks) && (
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <Award size={16} style={{ color: MAROON }} />
            <h3 className="font-bold text-gray-900">Commandant's Narrative</h3>
          </div>
          <div className="p-5">
            <NarrativeSection title="Observations"    content={report.observations} />
            <NarrativeSection title="Challenges"      content={report.challenges} />
            <NarrativeSection title="Achievements"    content={report.achievements} />
            <NarrativeSection title="Recommendations" content={report.recommendations} />
            <NarrativeSection title="Overall Remarks" content={report.overall_remarks} />
          </div>
        </section>
      )}

    </div>
  )
}
