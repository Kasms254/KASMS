import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import Card from '../../components/Card'
import useToast from '../../hooks/useToast'
import {
  getCertificatesPaginated,
  deleteCertificate,
  revokeCertificate,
  downloadCertificatePdf,
  getCertificateStats,
  bulkCreateCertificates,
  getAllClasses,
  getCertificateTemplatesPaginated,
} from '../../lib/api'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'issued', label: 'Issued' },
  { value: 'pending', label: 'Pending' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'expired', label: 'Expired' },
]

const STATUS_BADGE = {
  issued: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  revoked: 'bg-red-100 text-red-700',
  expired: 'bg-neutral-100 text-neutral-600',
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Certificates() {
  const navigate = useNavigate()
  const toast = useToast()
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])
  const reportSuccess = useCallback((msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }, [toast])

  // List state
  const [loading, setLoading] = useState(false)
  const [certificates, setCertificates] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize, setPageSize] = useState(15)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Stats
  const [stats, setStats] = useState(null)

  // Revoke modal
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revoking, setRevoking] = useState(false)

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Bulk issue modal
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkForm, setBulkForm] = useState({ class_id: '', template_id: '', issue_date: '' })
  const [bulkClasses, setBulkClasses] = useState([])
  const [bulkTemplates, setBulkTemplates] = useState([])
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  // Download tracking
  const [downloading, setDownloading] = useState(null)

  // Load certificates
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', currentPage)
      params.append('page_size', pageSize)
      if (searchTerm.trim()) params.append('search', searchTerm.trim())
      if (statusFilter !== 'all') params.append('status', statusFilter)
      const data = await getCertificatesPaginated(params.toString())
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      setCertificates(list)
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load certificates')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, searchTerm, statusFilter, reportError])

  useEffect(() => { load() }, [load])

  // Load stats on mount
  useEffect(() => {
    getCertificateStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  // Download handler
  async function handleDownload(cert) {
    setDownloading(cert.id)
    try {
      const blob = await downloadCertificatePdf(cert.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate_${cert.certificate_number || cert.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      reportSuccess('Certificate downloaded')
    } catch (err) {
      reportError(err?.message || 'Failed to download certificate')
    } finally {
      setDownloading(null)
    }
  }

  // Revoke handler
  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await revokeCertificate(revokeTarget.id, revokeReason)
      reportSuccess('Certificate revoked')
      setRevokeTarget(null)
      setRevokeReason('')
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to revoke certificate')
    } finally {
      setRevoking(false)
    }
  }

  // Delete handler
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCertificate(deleteTarget.id)
      reportSuccess('Certificate deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to delete certificate')
    } finally {
      setDeleting(false)
    }
  }

  // Bulk issue
  async function openBulkModal() {
    setBulkModalOpen(true)
    setBulkForm({ class_id: '', template_id: '', issue_date: '' })
    setBulkResult(null)
    try {
      const [cls, tpl] = await Promise.all([
        getAllClasses().catch(() => []),
        getCertificateTemplatesPaginated('is_active=true&page_size=100').catch(() => ({ results: [] })),
      ])
      setBulkClasses(Array.isArray(cls) ? cls : cls?.results || [])
      setBulkTemplates(Array.isArray(tpl) ? tpl : tpl?.results || [])
    } catch { /* ignore */ }
  }

  async function handleBulkIssue(e) {
    e.preventDefault()
    if (!bulkForm.class_id) return reportError('Please select a class')
    setBulkSubmitting(true)
    setBulkResult(null)
    try {
      const payload = { class_id: bulkForm.class_id }
      if (bulkForm.template_id) payload.template_id = bulkForm.template_id
      if (bulkForm.issue_date) payload.issue_date = bulkForm.issue_date
      const result = await bulkCreateCertificates(payload)
      setBulkResult(result)
      reportSuccess(result?.message || 'Bulk issue complete')
      load()
      getCertificateStats().then(setStats).catch(() => {})
    } catch (err) {
      reportError(err?.message || 'Bulk issue failed')
    } finally {
      setBulkSubmitting(false)
    }
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificates</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage issued certificates — search, download, revoke, or bulk issue.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={openBulkModal}
            className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm whitespace-nowrap"
          >
            Bulk Issue
          </button>
          <button
            onClick={() => navigate('/add/certificate')}
            className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm whitespace-nowrap"
          >
            Issue Certificate
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
          <Card title="Total" value={stats.total_certificates ?? 0} icon="Award" accent="bg-indigo-500" colored={true} />
          <Card title="Issued" value={stats.issued_count ?? 0} icon="CheckCircle" accent="bg-emerald-500" colored={true} />
          <Card title="Revoked" value={stats.revoked_count ?? 0} icon="XCircle" accent="bg-pink-500" colored={true} />
          <Card title="This Month" value={stats.certificates_this_month ?? 0} icon="Calendar" accent="bg-sky-500" colored={true} />
        </div>
      )}

      <section className="grid gap-4 sm:gap-6">
        {/* Search & Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="relative flex-1">
                <input
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Search by certificate #, student, course..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-56">
                <select
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
                >
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setCurrentPage(1); load() }}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm hover:bg-indigo-700 transition whitespace-nowrap shadow-sm"
              >
                Apply Filters
              </button>
              {(searchTerm || statusFilter !== 'all') && (
                <button
                  onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCurrentPage(1) }}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {(searchTerm || statusFilter !== 'all') && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
                <span className="text-xs text-neutral-600">Active filters:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                    Search: "{searchTerm}"
                    <button
                      onClick={() => { setSearchTerm(''); setCurrentPage(1) }}
                      className="hover:bg-indigo-100 rounded-full p-0.5"
                    >
                      <LucideIcons.X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                    Status: {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || statusFilter}
                    <button
                      onClick={() => { setStatusFilter('all'); setCurrentPage(1) }}
                      className="hover:bg-indigo-100 rounded-full p-0.5"
                    >
                      <LucideIcons.X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Table / Content */}
        {loading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200">
            <div className="text-sm text-neutral-500 text-center py-4">Loading certificates...</div>
          </div>
        ) : certificates.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
           
            <h3 className="text-lg font-medium text-neutral-700">No Certificates Found</h3>
            <p className="text-sm text-neutral-500 mt-1">
              {searchTerm || statusFilter !== 'all'
                ? 'No certificates match your filters. Try adjusting your search terms.'
                : 'Get started by issuing your first certificate.'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={() => navigate('/add/certificate')}
                className="mt-4 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
              >
                Issue Certificate
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Mobile Card View */}
            <div className="lg:hidden p-4 space-y-3">
              {certificates.map((cert) => (
                <div key={cert.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm sm:text-base text-black truncate">{cert.student_name}</div>
                      <div className="text-xs text-neutral-500 font-mono mt-0.5">{cert.certificate_number}</div>
                    </div>
                    <span className={`inline-flex px-2 py-1 text-[10px] sm:text-xs font-semibold rounded-full flex-shrink-0 ${STATUS_BADGE[cert.status] || 'bg-neutral-100 text-neutral-600'}`}>
                      {cert.status_display || cert.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm mb-3">
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Course:</span>
                      <span className="text-black truncate">{cert.course_name}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Class:</span>
                      <span className="text-black truncate">{cert.class_name}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Grade:</span>
                      <span className="text-black">{cert.final_grade || '-'}{cert.final_percentage ? ` (${cert.final_percentage}%)` : ''}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Issued:</span>
                      <span className="text-black">{formatDate(cert.issue_date)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-200">
                    <button
                      onClick={() => handleDownload(cert)}
                      disabled={downloading === cert.id}
                      className="flex-1 min-w-[80px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-md bg-indigo-600 text-xs sm:text-sm text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      {downloading === cert.id ? 'Downloading...' : 'Download'}
                    </button>
                    {cert.status === 'issued' && (
                      <button
                        onClick={() => { setRevokeTarget(cert); setRevokeReason('') }}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-md bg-amber-600 text-xs sm:text-sm text-white hover:bg-amber-700 transition whitespace-nowrap"
                      >
                        Revoke
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(cert)}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-md bg-red-600 text-xs sm:text-sm text-white hover:bg-red-700 transition whitespace-nowrap"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Certificate #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Course</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Grade</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Issue Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {certificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3 text-sm text-neutral-700 font-mono whitespace-nowrap">{cert.certificate_number}</td>
                      <td className="px-4 py-3 text-sm font-medium text-black">{cert.student_name}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{cert.course_name}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{cert.class_name}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{cert.final_grade || '-'}{cert.final_percentage ? ` (${cert.final_percentage}%)` : ''}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{formatDate(cert.issue_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[cert.status] || 'bg-neutral-100 text-neutral-600'}`}>
                          {cert.status_display || cert.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownload(cert)}
                            disabled={downloading === cert.id}
                            className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap"
                          >
                            {downloading === cert.id ? 'Downloading...' : 'Download'}
                          </button>
                          {cert.status === 'issued' && (
                            <button
                              onClick={() => { setRevokeTarget(cert); setRevokeReason('') }}
                              className="px-3 py-1.5 rounded-md bg-amber-600 text-xs text-white hover:bg-amber-700 transition whitespace-nowrap"
                            >
                              Revoke
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(cert)}
                            className="px-3 py-1.5 rounded-md bg-red-600 text-xs text-white hover:bg-red-700 transition whitespace-nowrap"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Pagination */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Results info */}
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((currentPage - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> certificates
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const pages = []
                  const maxVisible = 5
                  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                  let endPage = Math.min(totalPages, startPage + maxVisible - 1)

                  if (endPage - startPage < maxVisible - 1) {
                    startPage = Math.max(1, endPage - maxVisible + 1)
                  }

                  if (startPage > 1) {
                    pages.push(
                      <button key={1} onClick={() => setCurrentPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        1
                      </button>
                    )
                    if (startPage > 2) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition ${
                          currentPage === i
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }
                    pages.push(
                      <button key={totalPages} onClick={() => setCurrentPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page size selector */}
              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-neutral-600 hidden sm:inline">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRevokeTarget(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <LucideIcons.AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <h4 className="text-lg font-medium text-black">Revoke Certificate</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setRevokeTarget(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-neutral-600 mb-3">
                Revoke certificate <strong>{revokeTarget.certificate_number}</strong> for <strong>{revokeTarget.student_name}</strong>?
              </p>
              <label className="text-sm text-neutral-600 mb-1 block">Reason (optional)</label>
              <textarea
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                rows={3}
                placeholder="Reason for revocation..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setRevokeTarget(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {revoking ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <LucideIcons.AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <h4 className="text-lg font-medium text-black">Delete Certificate</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setDeleteTarget(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Are you sure you want to delete certificate <strong>{deleteTarget.certificate_number}</strong>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Issue Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setBulkModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Bulk Issue Certificates</h4>
                  <p className="text-sm text-neutral-500">Issue certificates for all completed enrollments in a class</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setBulkModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleBulkIssue}>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Class *</label>
                    <select
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={bulkForm.class_id}
                      onChange={(e) => setBulkForm({ ...bulkForm, class_id: e.target.value })}
                      required
                    >
                      <option value="">Select a class</option>
                      {bulkClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} {c.course_name ? `(${c.course_name})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Template (optional)</label>
                    <select
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={bulkForm.template_id}
                      onChange={(e) => setBulkForm({ ...bulkForm, template_id: e.target.value })}
                    >
                      <option value="">Use default template</option>
                      {bulkTemplates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Issue Date (optional)</label>
                    <input
                      type="date"
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={bulkForm.issue_date}
                      onChange={(e) => setBulkForm({ ...bulkForm, issue_date: e.target.value })}
                    />
                  </div>
                </div>

                {bulkResult && (
                  <div className="mt-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-sm">
                    <div className="text-black font-medium">{bulkResult.message || `Created ${bulkResult.total_created} certificates`}</div>
                    {bulkResult.total_errors > 0 && (
                      <div className="text-red-600 mt-1">{bulkResult.total_errors} errors occurred</div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setBulkModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Close</button>
                  <button
                    type="submit"
                    disabled={bulkSubmitting}
                    className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {bulkSubmitting ? 'Issuing...' : 'Issue Certificates'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
