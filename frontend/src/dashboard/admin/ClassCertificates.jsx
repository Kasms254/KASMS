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
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const loadCompletionStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getClassCompletionStatus(classId)
      setCompletionData(data)
    } catch (err) {
      setError(extractError(err, 'Failed to load completion status'))
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => { loadCompletionStatus() }, [loadCompletionStatus])

  useEffect(() => {
    let mounted = true
    api.getCertificateTemplates().then((res) => {
      if (mounted && res?.results) setTemplates(res.results)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  function extractError(err, fallback) {
    const data = err?.data || err?.response?.data
    if (data?.error) return data.error
    if (data?.detail) return data.detail
    if (data?.non_field_errors) return Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : data.non_field_errors
    if (err?.message) return err.message
    return fallback
  }

  async function handleBulkIssue() {
    setIssuingAll(true)
    setIssueReport(null)
    try {
      const report = await api.issueCertificates(classId, selectedTemplateId)
      setIssueReport(report)
      if (report.issued_count > 0) {
        reportSuccess(`${report.issued_count} certificate(s) issued successfully`)
      }
      if (report.skipped_count > 0 && report.issued_count === 0 && report.failed_count === 0) {
        reportError('All students already have certificates issued')
      } else if (report.failed_count > 0) {
        reportError(`${report.failed_count} certificate(s) failed to issue`)
      }
      await loadCompletionStatus()
    } catch (err) {
      reportError(extractError(err, 'Failed to issue certificates'))
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
      reportError(extractError(err, `Failed to issue certificate for ${studentName}`))
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
      reportError(extractError(err, 'Failed to close class'))
      setConfirmClose(false)
    } finally {
      setClosing(false)
    }
  }

  const classInfo = completionData?.class || {}
  const students = completionData?.students || []
  const totalStudents = completionData?.total_students || 0
  const academicallyComplete = completionData?.academically_complete || 0

  // Search & pagination
  const filtered = students.filter((st) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      (st.student_name && st.student_name.toLowerCase().includes(term)) ||
      (st.svc_number && String(st.svc_number).toLowerCase().includes(term))
    )
  })
  const totalCount = filtered.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedStudents = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [searchTerm])

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition" title="Go back">
            <LucideIcons.ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">
              Certificates — {classInfo.name || `Class ${classId}`}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500">Check completion status and issue certificates</p>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={selectedTemplateId || ''}
              onChange={(e) => setSelectedTemplateId(e.target.value || null)}
              className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Default template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
              ))}
            </select>
            <button
              onClick={handleBulkIssue}
              disabled={issuingAll || academicallyComplete === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm whitespace-nowrap"
            >
              {issuingAll ? <LucideIcons.Loader2 className="w-4 h-4 animate-spin" /> : <LucideIcons.Award className="w-4 h-4" />}
              {issuingAll ? 'Issuing...' : 'Issue All Certificates'}
            </button>
          </div>
        )}
      </header>

      {/* Class Status Banner */}
      {!loading && !error && (
        <div className={`rounded-xl p-4 mb-4 border ${classInfo.is_closed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2">
              {classInfo.is_closed ? (
                <LucideIcons.CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <LucideIcons.AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              )}
              <div>
                <span className={`text-sm font-medium ${classInfo.is_closed ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {classInfo.is_closed ? 'Class is closed' : 'Class is still open'}
                </span>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {classInfo.is_closed
                    ? 'All certificates have been issued and the class is finalized.'
                    : 'Issue certificates to all eligible students, then close the class to finalize.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <span className="text-neutral-600">Total: <strong className="text-black">{totalStudents}</strong></span>
              <span className="text-emerald-600">Complete: <strong>{academicallyComplete}</strong></span>
              <span className="text-amber-600">Pending: <strong>{totalStudents - academicallyComplete}</strong></span>
              {!classInfo.is_closed && (
                <button
                  onClick={() => setConfirmClose(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-600 text-xs text-white hover:bg-amber-700 transition whitespace-nowrap"
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
        <div className="rounded-xl border border-neutral-200 bg-white p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-black">Issue Report</h3>
            <button onClick={() => setIssueReport(null)} className="p-1 rounded-md hover:bg-neutral-100 transition">
              <LucideIcons.X className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              <LucideIcons.CheckCircle2 className="w-3 h-3 inline mr-1" />Issued: {issueReport.issued_count}
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-700 font-medium">
              <LucideIcons.SkipForward className="w-3 h-3 inline mr-1" />Skipped: {issueReport.skipped_count}
            </span>
            {issueReport.failed_count > 0 && (
              <span className="text-xs px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium">
                <LucideIcons.XCircle className="w-3 h-3 inline mr-1" />Failed: {issueReport.failed_count}
              </span>
            )}
          </div>

          {issueReport.issued?.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-emerald-700 mb-1.5">Successfully issued:</div>
              <div className="flex flex-wrap gap-1.5">
                {issueReport.issued.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">{r.student} — {r.certificate_number}</span>
                ))}
              </div>
            </div>
          )}
          {issueReport.skipped?.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-neutral-600 mb-1.5">Skipped (already issued):</div>
              <div className="flex flex-wrap gap-1.5">
                {issueReport.skipped.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-neutral-50 text-neutral-600 rounded-md border border-neutral-200">{r.student}</span>
                ))}
              </div>
            </div>
          )}
          {issueReport.failed?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-700 mb-1.5">Failed:</div>
              <div className="flex flex-wrap gap-1.5">
                {issueReport.failed.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded-md border border-red-200">{r.student}: {r.reason}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Bar (only when data loaded and students exist) */}
      {!loading && !error && students.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by student name or service number..."
                className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap">
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200">
          <EmptyState icon="AlertCircle" title="Error loading completion status" description={error} variant="minimal" />
        </div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Loader2" title="Loading completion status..." variant="minimal" />
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Users" title="No students enrolled" description="No students are enrolled in this class yet." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Search" title="No students match" description={`No students match "${searchTerm}". Try adjusting your search.`} />
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedStudents.map((st) => (
            <div key={st.enrollment_id || st.student_id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              {/* Student Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border-b border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${st.is_academically_complete ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    {st.is_academically_complete ? <LucideIcons.Check className="w-5 h-5" /> : <LucideIcons.Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-medium text-black text-sm">{st.student_name || '—'}</div>
                    <div className="text-xs text-neutral-500">{st.svc_number || '—'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-neutral-600">
                    {st.completed_subjects}/{st.total_subjects} subjects
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.is_academically_complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {st.is_academically_complete ? 'Complete' : 'Pending'}
                  </span>

                  {st.is_academically_complete && (
                    <button
                      onClick={() => handleSingleIssue(st.enrollment_id, st.student_name)}
                      disabled={issuingSingle === st.enrollment_id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 text-xs text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {issuingSingle === st.enrollment_id ? (
                        <LucideIcons.Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <LucideIcons.Award className="w-3 h-3" />
                      )}
                      {issuingSingle === st.enrollment_id ? 'Issuing...' : 'Issue'}
                    </button>
                  )}
                </div>
              </div>

              {/* Subjects Breakdown */}
              {st.subjects?.length > 0 && (
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {st.subjects.map((subj) => (
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
                            <span className="font-medium text-black">
                              {subj.result.percentage != null ? `${subj.result.percentage}%` : `${subj.result.marks}/${subj.result.total}`}
                              {subj.result.grade && <span className="ml-1 text-neutral-500">({subj.result.grade})</span>}
                            </span>
                          ) : subj.reason === 'no_final_exam' ? (
                            <span className="text-neutral-400">No final exam</span>
                          ) : (
                            <span className="text-amber-600">Not graded</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalCount > 0 && totalPages > 1 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> students
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>
              <span className="px-3 py-1.5 text-sm text-black">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Close Class Modal */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmClose(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <LucideIcons.Lock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-black">Close Class</h4>
                  <p className="text-sm text-neutral-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-neutral-600 mb-2">
                Are you sure you want to close <strong className="text-black">{classInfo.name}</strong>?
              </p>
              <div className="text-xs text-neutral-500 bg-neutral-50 rounded-lg p-3 mb-4 space-y-1">
                <p>All eligible students must have certificates issued before the class can be closed.</p>
                <p>Currently <strong className="text-black">{academicallyComplete}</strong> of <strong className="text-black">{totalStudents}</strong> students are academically complete.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmClose(false)} className="px-4 py-2 rounded-lg text-sm border border-neutral-200 text-neutral-700 hover:bg-neutral-100 transition">Cancel</button>
                <button onClick={handleCloseClass} disabled={closing} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {closing ? <LucideIcons.Loader2 className="w-4 h-4 animate-spin" /> : <LucideIcons.Lock className="w-4 h-4" />}
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
