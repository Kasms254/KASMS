import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'

const STATUS_ORDER = [
  'instructor_draft', 'instructor_submitted',
  'oic_draft', 'oic_submitted',
  'ci_draft', 'ci_submitted',
  'commandant_draft', 'approved',
]

const STEP_GROUPS = [
  { label: 'Instructor',       draft: 'instructor_draft',  done: 'instructor_submitted' },
  { label: 'OIC',              draft: 'oic_draft',         done: 'oic_submitted' },
  { label: 'Chief Instructor', draft: 'ci_draft',          done: 'ci_submitted' },
  { label: 'Commandant',       draft: 'commandant_draft',  done: 'approved' },
]

const STAGE_LABEL = {
  instructor:       'Instructor',
  oic:              'Officer in Charge',
  chief_instructor: 'Chief Instructor',
  commandant:       'Commandant',
}

function initials(first = '', last = '') {
  return `${(first[0] || '')}${(last[0] || '')}`.toUpperCase() || '?'
}

function StageProgress({ currentStatus }) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  return (
    <div className="flex items-start w-full">
      {STEP_GROUPS.map((step, i) => {
        const draftIdx = STATUS_ORDER.indexOf(step.draft)
        const isActive = currentIdx === draftIdx
        const isDone   = currentIdx > draftIdx
        const isFinal  = step.done === 'approved' && currentStatus === 'approved'

        return (
          <React.Fragment key={step.label}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
                isFinal || isDone
                  ? 'bg-green-500 border-green-500 text-white'
                  : isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-neutral-300 text-neutral-400'
              }`}>
                {isFinal || isDone
                  ? <LucideIcons.CheckCircle className="w-4 h-4" />
                  : i + 1}
              </div>
              <span className={`text-xs mt-1.5 text-center font-medium whitespace-nowrap ${
                isActive ? 'text-indigo-600' :
                isDone   ? 'text-green-600' : 'text-neutral-400'
              }`}>{step.label}</span>
            </div>
            {i < STEP_GROUPS.length - 1 && (
              <div className={`flex-1 h-0.5 mt-[17px] mx-2 ${
                currentIdx > draftIdx ? 'bg-green-400' : 'bg-neutral-200'
              }`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function RemarkCard({ remark }) {
  function fmt(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }
  return (
    <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <LucideIcons.Shield className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-black">
            {STAGE_LABEL[remark.stage] || remark.stage}
          </span>
          {remark.is_submitted && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
              <LucideIcons.CheckCircle className="w-3 h-3" /> Submitted
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-400 sm:flex-shrink-0">{fmt(remark.updated_at)}</span>
      </div>
      <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed pl-9">{remark.content}</p>
      {remark.author && (
        <p className="text-xs text-neutral-400 mt-2 pl-9">
          — {remark.author.rank ? `${remark.author.rank} ` : ''}{remark.author.first_name} {remark.author.last_name}
          {remark.author.svc_number ? ` (${remark.author.svc_number})` : ''}
        </p>
      )}
    </div>
  )
}

export default function CourseReportDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [report, setReport]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('remarks')
  const [remarkContent, setRemarkContent] = useState('')
  const [saving, setSaving]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [auditLog, setAuditLog]   = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  const canViewAudit = ['admin', 'superadmin', 'commandant', 'chief_instructor'].includes(user?.role)
  const myStageKey = {
    instructor: 'instructor', oic: 'oic',
    chief_instructor: 'chief_instructor', commandant: 'commandant',
  }[user?.role]

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getCourseReportDetail(id)
      setReport(data)
      if (myStageKey && data.can_edit) {
        const existing = (data.visible_remarks || []).find(r => r.stage === myStageKey && !r.is_submitted)
        if (existing) setRemarkContent(existing.content || '')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [id, myStageKey, toast])

  useEffect(() => { loadReport() }, [loadReport])

  async function loadAuditLog() {
    setAuditLoading(true)
    try {
      const data = await api.getCourseReportAuditLog(id)
      setAuditLog(data.results ?? data ?? [])
    } catch (err) {
      toast.error(err.message || 'Failed to load audit log')
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'audit' && canViewAudit) loadAuditLog()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveDraft() {
    if (remarkContent.trim().length < 10) { toast.error('Remark must be at least 10 characters'); return }
    setSaving(true)
    try {
      await api.saveCourseReportRemark(id, remarkContent)
      toast.success('Draft saved')
      loadReport()
    } catch (err) {
      toast.error(err.message || 'Failed to save remark')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (remarkContent.trim().length < 10) { toast.error('Remark must be at least 10 characters'); return }
    setSubmitting(true)
    try {
      await api.saveCourseReportRemark(id, remarkContent)
      const res = await api.submitCourseReport(id)
      toast.success(res.detail || 'Report submitted successfully')
      loadReport()
    } catch (err) {
      toast.error(err.message || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAdvance() {
    setAdvancing(true)
    try {
      const res = await api.advanceCourseReport(id)
      toast.success(res.detail || 'Report advanced successfully')
      loadReport()
    } catch (err) {
      toast.error(err.message || 'Failed to advance report')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await api.downloadCourseReport(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `course_report_${report?.student?.svc_number || id}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch (err) {
      toast.error(err.message || 'Failed to download report')
    } finally {
      setDownloading(false)
    }
  }

  function goBack() {
    const role = user?.role
    if (role === 'commandant' || role === 'chief_instructor') navigate('/commandant/course-reports')
    else if (role === 'oic') navigate('/oic/course-reports')
    else navigate('/list/course-reports')
  }

  function fmt(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LucideIcons.RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <LucideIcons.AlertCircle className="w-10 h-10 text-neutral-300" />
        <p className="font-medium text-black">Report not found</p>
        <button onClick={goBack} className="text-sm text-indigo-600 hover:underline">Go back</button>
      </div>
    )
  }

  const { student, class_name, course_name, status, visible_remarks = [],
          can_edit, can_submit, can_advance, can_download } = report

  const submittedRemarks = visible_remarks.filter(r => r.is_submitted)
  const draftRemark = visible_remarks.find(r => r.stage === myStageKey && !r.is_submitted)

  const statusColor = status === 'approved' ? 'bg-green-100 text-green-800' :
    status?.endsWith('_submitted') ? 'bg-blue-100 text-blue-800' :
    status === 'commandant_draft'  ? 'bg-purple-100 text-purple-800' :
    status === 'ci_draft'          ? 'bg-orange-100 text-orange-800' :
    status === 'oic_draft'         ? 'bg-yellow-100 text-yellow-800' :
    'bg-gray-100 text-gray-700'

  const tabs = [
    { key: 'remarks', label: 'Remarks', icon: 'MessageSquare' },
    ...(canViewAudit ? [{ key: 'audit', label: 'Audit Log', icon: 'Clock' }] : []),
  ]

  return (
    <div className="w-full px-3 sm:px-4 md:px-6 space-y-4">

      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition"
          >
            <LucideIcons.ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">Course Report</h2>
            <p className="text-xs sm:text-sm text-neutral-500">{class_name} · {course_name}</p>
          </div>
        </div>
        {can_download && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
          >
            <LucideIcons.Download className="w-4 h-4" />
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
        )}
      </header>

      {/* ── Student profile card ── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 border-b border-neutral-100">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl flex-shrink-0">
            {initials(student?.first_name, student?.last_name)}
          </div>
          {/* Name block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-semibold text-black">
                {student?.first_name} {student?.last_name}
              </h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                {(status || '').replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">
              {student?.rank && <span className="font-medium text-neutral-700">{student.rank}</span>}
              {student?.rank && student?.svc_number && <span className="mx-1.5 text-neutral-300">·</span>}
              {student?.svc_number && <span className="font-mono">{student.svc_number}</span>}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-neutral-100">
          {[
            { label: 'Class',   value: class_name || '—' },
            { label: 'Course',  value: course_name || '—' },
            { label: 'Updated', value: fmt(report.updated_at) },
            { label: 'Created', value: fmt(report.created_at) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white px-4 py-3">
              <p className="text-[11px] text-neutral-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-sm font-medium text-black truncate">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Workflow progress ── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">Workflow Progress</p>
        <StageProgress currentStatus={status} />
      </div>

      {/* ── Tabs + content ── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-neutral-200 bg-neutral-50">
          {tabs.map(tab => {
            const Icon = LucideIcons[tab.icon]
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Remarks tab */}
        {activeTab === 'remarks' && (
          <div className="p-5 space-y-4">

            {submittedRemarks.length > 0 ? (
              submittedRemarks.map(remark => <RemarkCard key={remark.id} remark={remark} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <LucideIcons.MessageSquare className="w-10 h-10 mb-2 text-neutral-200" />
                <p className="text-sm font-medium text-neutral-500">No remarks submitted yet</p>
                <p className="text-xs text-neutral-400 mt-0.5">Remarks will appear here once each stage submits.</p>
              </div>
            )}

            {/* Write area */}
            {can_edit && (
              <div className="border border-indigo-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                  <LucideIcons.PenLine className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-indigo-900">
                    Your Remark — {STAGE_LABEL[myStageKey] || myStageKey}
                  </span>
                  {draftRemark && (
                    <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                      Draft saved
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <textarea
                    value={remarkContent}
                    onChange={e => setRemarkContent(e.target.value)}
                    rows={7}
                    placeholder="Write your assessment here… (minimum 10 characters)"
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y bg-white"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-neutral-400">{remarkContent.length} / 10 000 characters</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveDraft}
                        disabled={saving || remarkContent.trim().length < 10}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-black bg-white hover:bg-neutral-50 disabled:opacity-50 transition"
                      >
                        <LucideIcons.Save className="w-4 h-4" />
                        {saving ? 'Saving…' : 'Save Draft'}
                      </button>
                      {can_submit && (
                        <button
                          onClick={handleSubmit}
                          disabled={submitting || remarkContent.trim().length < 10}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                          <LucideIcons.Send className="w-4 h-4" />
                          {submitting ? 'Submitting…' : status === 'commandant_draft' ? 'Submit & Approve' : 'Submit'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advance (reviewer roles, no remark to write) */}
            {can_advance && !can_edit && (
              <div className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <LucideIcons.ArrowRight className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black">Ready to advance</p>
                    <p className="text-xs text-neutral-500 mt-0.5">The previous stage has been submitted. Advance this report to your stage.</p>
                  </div>
                </div>
                <button
                  onClick={handleAdvance}
                  disabled={advancing}
                  className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  <LucideIcons.ChevronRight className="w-4 h-4" />
                  {advancing ? 'Advancing…' : 'Advance'}
                </button>
              </div>
            )}

            {/* Approved state */}
            {status === 'approved' && (
              <div className="border border-green-200 rounded-xl p-4 bg-green-50 flex items-start gap-3">
                <LucideIcons.CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-black">Report fully approved</p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    {can_download
                      ? 'Use the Download PDF button at the top to get the report.'
                      : 'PDF will be available once generated by the system.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit log tab */}
        {activeTab === 'audit' && (
          <div className="p-5">
            {auditLoading ? (
              <div className="flex items-center justify-center py-12">
                <LucideIcons.RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : auditLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <LucideIcons.Clock className="w-10 h-10 mb-2 text-neutral-200" />
                <p className="text-sm">No audit entries yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {auditLog.map((entry, i) => (
                  <div key={entry.id || i} className="flex items-start gap-3 py-3">
                    <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <LucideIcons.Clock className="w-3.5 h-3.5 text-neutral-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-sm font-medium text-black capitalize">
                          {(entry.action || '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-neutral-400 whitespace-nowrap">{fmt(entry.created_at)}</span>
                      </div>
                      {entry.performed_by_name && (
                        <p className="text-xs text-neutral-500 mt-0.5">by {entry.performed_by_name}</p>
                      )}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <p className="text-xs text-neutral-400 mt-0.5 font-mono truncate">
                          {JSON.stringify(entry.metadata)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
