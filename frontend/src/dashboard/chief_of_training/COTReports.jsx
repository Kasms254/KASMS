import React, { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText, Search, Download, Eye, ChevronLeft, ChevronRight, Loader } from 'lucide-react'
import { getCOTReports, downloadCOTReportPdf } from '../../lib/api'
import EmptyState from '../../components/EmptyState'

const STATUS_BADGE = {
  submitted: 'bg-fill-blue-100 text-mark-blue-800',
  reviewed: 'bg-fill-green-100 text-mark-green-800',
  archived: 'bg-surface-3 text-fg-muted',
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function COTReports() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (statusFilter) params.set('status', statusFilter)
  params.set('page', page)

  const { data, isPending, error } = useQuery({
    queryKey: ['cot-reports', search, statusFilter, page],
    queryFn: () => getCOTReports(params.toString()),
    staleTime: 2 * 60 * 1000,
    keepPreviousData: true,
  })

  const reports = Array.isArray(data) ? data : (data?.results ?? [])
  const total = data?.count ?? reports.length
  const hasNext = !!(data?.next)
  const hasPrev = !!(data?.previous)

  function handleSearch(e) {
    setSearch(e.target.value)
    setPage(1)
  }

  if (isPending && page === 1) return (
    <div className="flex items-center justify-center py-20">
      <Loader className="animate-spin text-mark-blue-600" size={28} />
    </div>
  )

  if (error) return (
    <div className="p-6 text-mark-red-600">Failed to load reports: {error.message}</div>
  )

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-fg">All School Reports</h2>
        <p className="text-sm text-fg-soft mt-1">
          {total} report{total !== 1 ? 's' : ''} across all schools
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search by school, commandant, title…"
            className="w-full pl-9 pr-4 py-2 border border-line-strong rounded-lg text-sm text-fg placeholder-fg-faint bg-surface focus:outline-none focus:ring-2 focus:ring-[#7B1A1A]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-line-strong rounded-lg px-3 py-2 text-sm text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-[#7B1A1A]"
        >
          <option value="">All Statuses</option>
          <option value="submitted">Submitted</option>
          <option value="reviewed">Reviewed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} className="text-fg-faint" />}
          title="No reports found"
          description={search || statusFilter ? 'Try adjusting your filters.' : 'No school reports have been submitted yet.'}
        />
      ) : (
        <>
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="relative bg-surface border border-line rounded-xl p-5 shadow-sm hover:shadow-md hover:border-line-strong transition"
              >
                {/* Overlay link makes the whole card clickable without nesting
                    the action buttons inside an anchor. */}
                <Link
                  to={`/cot/reports/${report.id}`}
                  className="absolute inset-0 rounded-xl"
                  aria-label={`View report: ${report.title}`}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[report.status] || 'bg-surface-2'}`}>
                        {report.status?.charAt(0).toUpperCase() + report.status?.slice(1)}
                      </span>
                      <span className="text-xs text-fg-faint">{formatDate(report.report_date)}</span>
                    </div>
                    <h3 className="font-semibold text-fg truncate">{report.title}</h3>
                    <p className="text-sm text-fg-muted mt-0.5">
                      <span className="font-medium">{report.school_name}</span>
                      <span className="text-fg-faint ml-1">({report.school_code})</span>
                    </p>
                    <p className="text-xs text-fg-soft mt-0.5">
                      Commandant: {[report.commandant_rank_display, report.commandant_name].filter(Boolean).join(' ') || '—'}
                    </p>
                    <p className="text-xs text-fg-faint mt-0.5">
                      Period: {formatDate(report.reporting_period_start)} — {formatDate(report.reporting_period_end)}
                    </p>
                    {report.submitted_at && (
                      <p className="text-xs text-mark-blue-600 mt-0.5">Submitted: {formatDate(report.submitted_at)}</p>
                    )}
                  </div>

                  <div className="relative z-10 flex items-center gap-1 shrink-0">
                    <Link
                      to={`/cot/reports/${report.id}`}
                      className="p-2 text-fg-soft hover:text-mark-blue-700 hover:bg-fill-blue-50 rounded-lg transition"
                      title="View"
                    >
                      <Eye size={16} />
                    </Link>
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        try {
                          const blob = await downloadCOTReportPdf(report.id)
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `report_${report.id}.pdf`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch { /* silently ignore */ }
                      }}
                      className="p-2 text-fg-soft hover:text-mark-purple-700 hover:bg-fill-purple-50 rounded-lg transition"
                      title="Download PDF"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {(hasNext || hasPrev) && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={!hasPrev || isPending}
                className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-canvas disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-sm text-fg-soft">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext || isPending}
                className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-canvas disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
