import React, { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Eye, Trash2, Send, BarChart2, Download } from 'lucide-react'
import { getCommandantReports, deleteCommandantReport, downloadCommandantReportPdf } from '../../lib/api'
import EmptyState from '../../components/EmptyState'

const STATUS_BADGE = {
  draft: 'bg-fill-yellow-100 text-mark-yellow-800',
  submitted: 'bg-fill-blue-100 text-mark-blue-800',
  reviewed: 'bg-fill-green-100 text-mark-green-800',
  archived: 'bg-surface-3 text-fg-muted',
}

const STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  archived: 'Archived',
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CommandantReports() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const params = filter ? `status=${filter}` : ''
  const { data, isPending, error } = useQuery({
    queryKey: ['commandant-reports', filter],
    queryFn: () => getCommandantReports(params),
    staleTime: 2 * 60 * 1000,
  })

  const reports = Array.isArray(data) ? data : (data?.results ?? [])

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCommandantReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commandant-reports'] })
      setDeleteTarget(null)
    },
  })

  if (isPending) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edge-blue-600"></div>
    </div>
  )
  if (error) return (
    <div className="p-6 text-mark-red-600">Failed to load reports: {error.message}</div>
  )

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-fg">School Reports</h2>
          <p className="text-sm text-fg-soft mt-1">Create and manage your official school reports</p>
        </div>
        <Link
          to="/commandant/reports/new"
          className="flex items-center gap-2 bg-fill-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-fill-blue-800 transition"
        >
          <Plus size={16} /> New Report
        </Link>
      </header>

      {/* Status filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[['', 'All'], ['draft', 'Drafts'], ['submitted', 'Submitted'], ['reviewed', 'Reviewed'], ['archived', 'Archived']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === val
                ? 'bg-fill-blue-700 text-white border-edge-blue-700'
                : 'bg-surface text-fg-muted border-line-strong hover:border-edge-blue-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} className="text-fg-faint" />}
          title="No reports found"
          description={filter ? `No ${filter} reports.` : 'Create your first school report to get started.'}
          action={
            <Link to="/commandant/reports/new" className="flex items-center gap-2 bg-fill-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-fill-blue-800">
              <Plus size={16} /> Create Report
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="relative bg-surface border border-line rounded-xl p-5 shadow-sm hover:shadow-md hover:border-line-strong transition"
            >
              {/* Overlay link makes the whole card clickable without nesting
                  the action buttons inside an anchor. */}
              <Link
                to={`/commandant/reports/${report.id}`}
                className="absolute inset-0 rounded-xl"
                aria-label={`View report: ${report.title || 'Untitled'}`}
              />
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[report.status] || 'bg-surface-2 text-fg-muted'}`}>
                      {STATUS_LABEL[report.status] || report.status}
                    </span>
                    <span className="text-xs text-fg-faint">{formatDate(report.report_date)}</span>
                  </div>
                  <h3 className="font-semibold text-fg truncate">{report.title || '(Untitled)'}</h3>
                  <p className="text-sm text-fg-soft mt-0.5">
                    Period: {formatDate(report.reporting_period_start)} — {formatDate(report.reporting_period_end)}
                  </p>
                  {report.submitted_at && (
                    <p className="text-xs text-mark-green-600 mt-0.5">Submitted: {formatDate(report.submitted_at)}</p>
                  )}
                </div>

                <div className="relative z-10 flex items-center gap-1 shrink-0">
                  <Link
                    to={`/commandant/reports/${report.id}`}
                    className="p-2 text-fg-soft hover:text-mark-blue-700 hover:bg-fill-blue-50 rounded-lg transition"
                    title="View"
                  >
                    <Eye size={16} />
                  </Link>

                  {report.status === 'draft' && (
                    <Link
                      to={`/commandant/reports/${report.id}/edit`}
                      className="p-2 text-fg-soft hover:text-mark-yellow-700 hover:bg-fill-yellow-50 rounded-lg transition"
                      title="Edit"
                    >
                      <FileText size={16} />
                    </Link>
                  )}

                  <button
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      try {
                        const blob = await downloadCommandantReportPdf(report.id)
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

                  {report.status === 'draft' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDeleteTarget(report)
                      }}
                      className="p-2 text-fg-soft hover:text-mark-red-600 hover:bg-fill-red-50 rounded-lg transition"
                      title="Delete draft"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-fg mb-2">Delete Draft Report?</h3>
            <p className="text-sm text-fg-muted mb-4">
              "{deleteTarget.title || 'Untitled'}" will be permanently deleted.
              This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-fg-muted border rounded-lg hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-fill-red-600 text-white rounded-lg hover:bg-fill-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
