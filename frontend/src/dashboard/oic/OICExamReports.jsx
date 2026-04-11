import { useState, useEffect, useCallback } from 'react'
import * as Icons from 'lucide-react'
import {
  getOICExamReports,
  getOICExamReportDetail,
  addOICExamReportRemark,
  getOICPendingRemarks,
} from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function PctBadge({ value }) {
  const pct = parseFloat(value) || 0
  const color = pct >= 75 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {value != null ? `${pct}%` : '—'}
    </span>
  )
}

export default function OICExamReports() {
  const toast = useToast()

  const [tab, setTab] = useState('all')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10

  // Detail view (null = list view)
  const [selectedReport, setSelectedReport] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Remark modal
  const [remarkModal, setRemarkModal] = useState(false)
  const [remarkText, setRemarkText] = useState('')
  const [remarkSubmitting, setRemarkSubmitting] = useState(false)

  // Student results pagination
  const [resultsPage, setResultsPage] = useState(1)
  const resultsPageSize = 10

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
      const fn = tab === 'pending' ? getOICPendingRemarks : getOICExamReports
      const data = await fn(params)
      const list = Array.isArray(data) ? data : data?.results ?? []
      setReports(list)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      } else {
        setTotalCount(list.length)
        setTotalPages(1)
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [tab, currentPage, search, reportError])

  useEffect(() => { load() }, [load])

  const openDetail = useCallback(async (report) => {
    setSelectedReport(report)
    setDetail(null)
    setDetailLoading(true)
    setResultsPage(1)
    try {
      const data = await getOICExamReportDetail(report.id)
      setDetail(data)
    } catch (err) {
      reportError(err?.message || 'Failed to load report detail')
    } finally {
      setDetailLoading(false)
    }
  }, [reportError])

  const handleAddRemark = useCallback(async () => {
    if (!remarkText.trim() || remarkText.trim().length < 10) {
      reportError('Remark must be at least 10 characters.')
      return
    }
    setRemarkSubmitting(true)
    try {
      await addOICExamReportRemark(selectedReport.id, remarkText.trim())
      if (toast?.success) toast.success('Remark added successfully.')
      else if (toast?.showToast) toast.showToast('Remark added successfully.', { type: 'success' })
      setRemarkModal(false)
      setRemarkText('')
      openDetail(selectedReport)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to add remark')
    } finally {
      setRemarkSubmitting(false)
    }
  }, [remarkText, selectedReport, openDetail, load, reportError, toast])

  const myRemark = detail?.report?.oic_remark ||
    detail?.report?.remarks?.find(r => r.author_role === 'oic') ||
    (detail?.remarks || []).find(r => r.author_role === 'oic')

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (selectedReport) {
    const allStudents = detail?.students || []
    const totalResultStudents = allStudents.length
    const totalResultsPages = Math.max(1, Math.ceil(totalResultStudents / resultsPageSize))
    const safeResultsPage = Math.min(resultsPage, totalResultsPages)
    const pageStudents = allStudents.slice((safeResultsPage - 1) * resultsPageSize, safeResultsPage * resultsPageSize)

    return (
      <div>
        {/* Back + header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedReport(null); setDetail(null) }}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
            >
              <Icons.ChevronLeft className="w-4 h-4" /> Back to reports
            </button>
          </div>
          <button
            onClick={() => { setRemarkText(myRemark?.remark || ''); setRemarkModal(true) }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
          >
            <Icons.MessageSquare className="w-4 h-4" />
            {myRemark ? 'Edit Remark' : 'Add Remark'}
          </button>
        </div>

        {detailLoading ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <EmptyState icon="Loader2" title="Loading report..." variant="minimal" />
          </div>
        ) : !detail ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <EmptyState icon="AlertCircle" title="Failed to load report detail" variant="minimal" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Report header card */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-black">
                    {detail.report?.title || selectedReport.title || 'Exam Report'}
                  </h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    {detail.report?.class_name || selectedReport.class_name || '—'}
                    {' · '}
                    {detail.report?.subject_name || selectedReport.subject_name || '—'}
                  </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium self-start ${
                  myRemark ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {myRemark ? 'Remarked' : 'Pending Remark'}
                </span>
              </div>

              {/* Summary stats */}
              {detail.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Students', value: detail.summary.total_students },
                    { label: 'Average', value: detail.summary.average_percentage != null ? `${detail.summary.average_percentage}%` : '—' },
                    { label: 'Passed', value: detail.summary.pass_count },
                    { label: 'Failed', value: detail.summary.fail_count },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-neutral-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-neutral-500">{label}</div>
                      <div className="text-lg font-semibold text-black mt-0.5">{value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* OIC remark display */}
              {myRemark && (
                <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icons.MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium text-indigo-700">Your Remark</span>
                  </div>
                  <p className="text-sm text-indigo-800">{myRemark.remark}</p>
                </div>
              )}
            </div>

            {/* Student results */}
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100">
                  <span className="text-sm font-medium text-black">Student Results</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto">
                    <thead className="bg-neutral-50">
                      <tr className="text-left">
                        {['Pos', 'Svc Number', 'Rank', 'Name', 'Score', 'Result'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 bg-white">
                      {pageStudents.map((s) => {
                        const pct = s.percentage ?? (s.total_possible ? Math.round((s.total_marks / s.total_possible) * 100) : null)
                        const passed = pct != null ? pct >= 50 : null
                        return (
                          <tr key={s.student_id} className="hover:bg-neutral-50 transition">
                            <td className="px-4 py-3 text-sm text-neutral-400 font-medium">{s.position ?? '—'}</td>
                            <td className="px-4 py-3 text-sm font-medium text-neutral-700 whitespace-nowrap">{s.svc_number || '—'}</td>
                            <td className="px-4 py-3 text-sm text-neutral-700">{s.rank || '—'}</td>
                            <td className="px-4 py-3 text-sm font-medium text-black">{s.name || '—'}</td>
                            <td className="px-4 py-3"><PctBadge value={pct} /></td>
                            <td className="px-4 py-3">
                              {passed != null ? (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {passed ? 'Pass' : 'Fail'}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      {allStudents.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-400">No results</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalResultStudents > resultsPageSize && (
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-neutral-600">
                      Showing <span className="font-semibold text-black">{Math.min((safeResultsPage - 1) * resultsPageSize + 1, totalResultStudents)}</span> to{' '}
                      <span className="font-semibold text-black">{Math.min(safeResultsPage * resultsPageSize, totalResultStudents)}</span> of{' '}
                      <span className="font-semibold text-black">{totalResultStudents}</span> students
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setResultsPage(p => Math.max(1, p - 1))} disabled={safeResultsPage === 1}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                        <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                      </button>
                      {(() => {
                        const pages = []
                        const maxVisible = 5
                        let start = Math.max(1, safeResultsPage - Math.floor(maxVisible / 2))
                        let end = Math.min(totalResultsPages, start + maxVisible - 1)
                        if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                        if (start > 1) {
                          pages.push(<button key={1} onClick={() => setResultsPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                          if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                        }
                        for (let i = start; i <= end; i++) {
                          pages.push(<button key={i} onClick={() => setResultsPage(i)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition ${safeResultsPage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>{i}</button>)
                        }
                        if (end < totalResultsPages) {
                          if (end < totalResultsPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                          pages.push(<button key={totalResultsPages} onClick={() => setResultsPage(totalResultsPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalResultsPages}</button>)
                        }
                        return pages
                      })()}
                      <button onClick={() => setResultsPage(p => Math.min(totalResultsPages, p + 1))} disabled={safeResultsPage >= totalResultsPages}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                        <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Remark Modal */}
        {remarkModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRemarkModal(false)} />
            <div className="relative z-10 w-full max-w-lg">
              <div className="bg-white rounded-xl p-5 shadow-2xl ring-1 ring-black/5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-semibold text-black">
                    {myRemark ? 'Edit Your Remark' : 'Add Remark'}
                  </h4>
                  <button onClick={() => setRemarkModal(false)} className="text-neutral-400 hover:text-black transition">
                    <Icons.X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mb-3">
                  Report: <span className="font-medium text-black">{selectedReport?.title || 'Exam Report'}</span>
                </p>
                <textarea
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  placeholder="Write your remark (min. 10 characters)..."
                  rows={5}
                  className="w-full p-3 rounded-md text-sm text-black border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs ${remarkText.length < 10 ? 'text-red-500' : 'text-neutral-400'}`}>
                    {remarkText.length} / min 10 chars
                  </span>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setRemarkModal(false)}
                    className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">
                    Cancel
                  </button>
                  <button onClick={handleAddRemark}
                    disabled={remarkSubmitting || remarkText.trim().length < 10}
                    className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                    {remarkSubmitting ? 'Saving...' : myRemark ? 'Update Remark' : 'Submit Remark'}
                  </button>
                </div>
              </div>
            </div>
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
          <h2 className="text-2xl font-semibold text-black">Exam Reports</h2>
          <p className="text-sm text-neutral-500 mt-1">View exam reports and add your remarks.</p>
        </div>
        <div className="relative">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search reports..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
            className="pl-9 pr-3 py-2 text-sm text-black rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-56"
          />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {[
          { key: 'all', label: 'All Reports' },
          { key: 'pending', label: 'Pending Remarks' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setCurrentPage(1) }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500 hover:text-black'
            }`}
          >
            {t.label}
            {t.key === 'pending' && tab === 'pending' && totalCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{totalCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="Loader2" title="Loading reports..." variant="minimal" />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="FileBarChart" title="No reports found" variant="minimal" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  {['#', 'Title', 'Class', 'Subject', 'Date', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {reports.map((r, i) => {
                  const hasOICRemark = !!(r.oic_remark || r.has_oic_remark || r.oic_remark_count > 0)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openDetail(r)}
                      className="hover:bg-indigo-50 cursor-pointer transition group"
                    >
                      <td className="px-4 py-3 text-sm text-neutral-400">{(currentPage - 1) * pageSize + i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-black group-hover:text-indigo-600 transition">{r.title || 'Exam Report'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">{r.class_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-600">{r.subject_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-500 whitespace-nowrap">{formatDate(r.created_at || r.submitted_at)}</td>
                      <td className="px-4 py-3">
                        {hasOICRemark ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            <Icons.CheckCircle className="w-3 h-3" /> Remarked
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition">
                          View <Icons.ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50">
              <p className="text-xs text-neutral-400">Click any row to view the full report and add your remark</p>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-neutral-600">
                  Page <span className="font-semibold text-black">{currentPage}</span> of{' '}
                  <span className="font-semibold text-black">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                    <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                  </button>
                  {(() => {
                    const pages = []
                    const maxVisible = 5
                    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                    let end = Math.min(totalPages, start + maxVisible - 1)
                    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                    if (start > 1) {
                      pages.push(<button key={1} onClick={() => setCurrentPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                      if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                    }
                    for (let i = start; i <= end; i++) {
                      pages.push(<button key={i} onClick={() => setCurrentPage(i)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition ${currentPage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>{i}</button>)
                    }
                    if (end < totalPages) {
                      if (end < totalPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                      pages.push(<button key={totalPages} onClick={() => setCurrentPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalPages}</button>)
                    }
                    return pages
                  })()}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                    <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
