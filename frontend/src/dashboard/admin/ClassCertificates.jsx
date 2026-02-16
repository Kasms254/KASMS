import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'

export default function ClassCertificates() {
  const { id: classId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const reportSuccess = (msg) => { toast?.success?.(msg) || toast?.showToast?.(msg, { type: 'success' }) }
  const reportError = (msg) => { toast?.error?.(msg) || toast?.showToast?.(msg, { type: 'error' }) }

  const [completionData, setCompletionData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [issuingAll, setIssuingAll] = useState(false)
  const [issuingSingle, setIssuingSingle] = useState(null)
  const [issueReport, setIssueReport] = useState(null)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)

  const loadCompletionStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getClassCompletionStatus(classId)
      setCompletionData(data)
    } catch (err) {
      setError(err?.message || 'Failed to load completion status')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => { loadCompletionStatus() }, [loadCompletionStatus])

  useEffect(() => {
    let mounted = true
    async function loadTemplates() {
      try {
        const res = await api.getCertificateTemplates()
        if (mounted && res && res.results) setTemplates(res.results)
      } catch (e) {
        // ignore; templates optional
      }
    }
    loadTemplates()
    return () => { mounted = false }
  }, [])

  async function handleBulkIssue() {
    setIssuingAll(true)
    setIssueReport(null)
    try {
      const report = await api.issueCertificates(classId)
      setIssueReport(report)
      if (report.issued_count > 0) {
        reportSuccess(`${report.issued_count} certificate(s) issued successfully`)
      }
      if (report.failed_count > 0) {
        reportError(`${report.failed_count} certificate(s) failed to issue`)
      }
      // Reload completion data to reflect changes
      await loadCompletionStatus()
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Failed to issue certificates'
      reportError(msg)
    } finally {
      setIssuingAll(false)
    }
  }

  async function handleSingleIssue(enrollmentId, studentName) {
    setIssuingSingle(enrollmentId)
    try {
      const result = await api.issueCertificateSingle(classId, enrollmentId, selectedTemplateId)
      reportSuccess(`Certificate issued for ${studentName}: ${result.certificate_number}`)
      await loadCompletionStatus()
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Failed to issue certificate'
      reportError(msg)
    } finally {
      setIssuingSingle(null)
    }
  }

  async function handleCloseClass() {
    setClosing(true)
    try {
      await api.closeClass(classId)
      reportSuccess('Class closed successfully')
      setConfirmClose(false)
      await loadCompletionStatus()
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Failed to close class'
      reportError(msg)
    } finally {
      setClosing(false)
    }
  }

  const classInfo = completionData?.class || {}
  const students = completionData?.students || []
  const totalStudents = completionData?.total_students || 0
  const academicallyComplete = completionData?.academically_complete || 0

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
            <LucideIcons.ArrowLeft className="w-5 h-5 text-neutral-600" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">
              Certificates — {classInfo.name || `Class ${classId}`}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500">Check completion status and issue certificates</p>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId || ''}
              onChange={(e) => setSelectedTemplateId(e.target.value || null)}
              className="px-3 py-2 rounded-md border border-neutral-200 bg-white text-sm"
            >
              <option value="">Use default template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkIssue}
              disabled={issuingAll || academicallyComplete === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
            >
              <LucideIcons.Award className="w-4 h-4" />
              {issuingAll ? 'Issuing...' : 'Issue All Certificates'}
            </button>
          </div>
        )}
      </header>

      {/* Class Status Banner */}
      {!loading && !error && (
        <div className={`rounded-xl p-4 mb-4 border ${classInfo.is_closed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              {classInfo.is_closed ? (
                <LucideIcons.CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <LucideIcons.AlertCircle className="w-5 h-5 text-amber-600" />
              )}
              <span className={`text-sm font-medium ${classInfo.is_closed ? 'text-emerald-700' : 'text-amber-700'}`}>
                {classInfo.is_closed ? 'Class is closed — certificates can be issued' : 'Class is still open — certificates may still be issued; close the class when ready (closing requires all eligible students to have certificates)'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-neutral-600">Total: <strong className="text-black">{totalStudents}</strong></span>
              <span className="text-emerald-600">Complete: <strong>{academicallyComplete}</strong></span>
              <span className="text-amber-600">Pending: <strong>{totalStudents - academicallyComplete}</strong></span>
              {!classInfo.is_closed && (
                <button
                  onClick={() => setConfirmClose(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-600 text-xs text-white hover:bg-amber-700 transition"
                >
                  <LucideIcons.Lock className="w-3 h-3" />
                  Close Class
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issue Report */}
      {issueReport && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-black">Issue Report</h3>
            <button onClick={() => setIssueReport(null)} className="p-1 rounded hover:bg-neutral-100 transition">
              <LucideIcons.X className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700">Issued: {issueReport.issued_count}</span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-700">Skipped: {issueReport.skipped_count}</span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-red-100 text-red-700">Failed: {issueReport.failed_count}</span>
          </div>

          {issueReport.issued?.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-medium text-emerald-700 mb-1">Issued:</div>
              <div className="flex flex-wrap gap-1">
                {issueReport.issued.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded">{r.student} — {r.certificate_number}</span>
                ))}
              </div>
            </div>
          )}
          {issueReport.failed?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-700 mb-1">Failed:</div>
              <div className="flex flex-wrap gap-1">
                {issueReport.failed.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded">{r.student}: {r.reason}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200">
          <EmptyState icon="AlertCircle" title="Error" description={error} variant="minimal" />
        </div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Loader2" title="Loading completion status..." variant="minimal" />
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Users" title="No students" description="No students are enrolled in this class." />
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((st) => (
            <div key={st.enrollment_id || st.student_id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              {/* Student Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${st.is_academically_complete ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    {st.is_academically_complete ? <LucideIcons.Check className="w-5 h-5" /> : <LucideIcons.Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-medium text-black text-sm">{st.student_name || '—'}</div>
                    <div className="text-xs text-neutral-500">{st.svc_number || '—'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-600">
                    {st.completed_subjects}/{st.total_subjects} subjects complete
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.is_academically_complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {st.is_academically_complete ? 'Complete' : 'Pending'}
                  </span>

                    {st.is_academically_complete && (
                    <button
                      onClick={() => handleSingleIssue(st.enrollment_id, st.student_name)}
                      disabled={issuingSingle === st.enrollment_id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 text-xs text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      <LucideIcons.Award className="w-3 h-3" />
                      {issuingSingle === st.enrollment_id ? 'Issuing...' : 'Issue'}
                    </button>
                  )}
                </div>
              </div>

              {/* Subjects Breakdown */}
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(st.subjects || []).map((subj) => (
                    <div key={subj.subject_id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${subj.is_complete ? 'bg-emerald-50 border-emerald-200' : 'bg-neutral-50 border-neutral-200'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {subj.is_complete ? (
                          <LucideIcons.CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <LucideIcons.Circle className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                        )}
                        <span className="truncate text-black">{subj.subject_name}</span>
                      </div>
                      <div className="flex-shrink-0">
                        {subj.result ? (
                          <span className="font-medium text-black">{subj.result.percentage != null ? `${subj.result.percentage}%` : `${subj.result.marks}/${subj.result.total}`}</span>
                        ) : subj.reason === 'no_final_exam' ? (
                          <span className="text-neutral-400">No exam</span>
                        ) : (
                          <span className="text-amber-600">Not graded</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Close Class Modal */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmClose(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <LucideIcons.Lock className="w-5 h-5 text-amber-600" />
                </div>
                <h4 className="text-lg font-semibold text-black">Close Class</h4>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Are you sure you want to close <strong>{classInfo.name}</strong>? Once closed, certificates can be issued to students who have completed all subjects. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmClose(false)} className="px-4 py-2 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                <button onClick={handleCloseClass} disabled={closing} className="px-4 py-2 rounded-lg text-sm bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {closing ? 'Closing...' : 'Close Class'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
