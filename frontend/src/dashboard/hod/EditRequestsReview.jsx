import { useEffect, useState, useCallback } from 'react'
import { getResultEditRequests, reviewResultEditRequest } from '../../lib/api'
import useToast from '../../hooks/useToast'

function sanitizeInput(value, trimSpaces = false) {
  if (typeof value !== 'string') return value
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
  const cleaned = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(controlChars, '')
  return trimSpaces ? cleaned.trim() : cleaned
}

export default function EditRequestsReview() {
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(20)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewingRequest, setReviewingRequest] = useState(null)
  const [reviewAction, setReviewAction] = useState('approve')
  const [reviewNote, setReviewNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}`
      if (filterStatus) params += `&status=${filterStatus}`
      const data = await getResultEditRequests(params)
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
      setRequests(list)
    } catch (err) {
      reportError(err?.message || 'Failed to load edit requests')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, filterStatus, reportError])

  useEffect(() => { load() }, [load])

  async function handleReview(e) {
    e.preventDefault()
    if (!reviewingRequest) return
    setIsSubmitting(true)
    try {
      await reviewResultEditRequest(reviewingRequest.id, {
        action: reviewAction,
        note: reviewNote.trim(),
      })
      reportSuccess(reviewAction === 'approve' ? 'Edit Request Approved' : 'Edit Request Rejected')
      setReviewModalOpen(false)
      setReviewingRequest(null)
      setReviewNote('')
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to review edit request')
    } finally {
      setIsSubmitting(false)
    }
  }

  function openReview(req, action) {
    setReviewingRequest(req)
    setReviewAction(action)
    setReviewNote('')
    setReviewModalOpen(true)
  }

  const statusBadge = (status) => {
    switch (status) {
      case 'pending': return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">Pending</span>
      case 'approved': return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Approved</span>
      case 'rejected': return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">Rejected</span>
      default: return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-neutral-100 text-neutral-600">{status}</span>
    }
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Result Edit Requests</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Review and approve or reject result edit requests from instructors.</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1) }}
          className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} requests
        </div>
      )}

      {/* Review Modal */}
      {reviewModalOpen && reviewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setReviewModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">
                    {reviewAction === 'approve' ? 'Approve' : 'Reject'} Edit Request
                  </h4>
                  <p className="text-sm text-neutral-500">From: {reviewingRequest.requested_by_name || 'Unknown'}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setReviewModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              {/* Request Details */}
              <div className="bg-neutral-50 rounded-lg p-3 mb-4 space-y-2">
                <div className="text-sm">
                  <span className="text-neutral-500">Reason:</span>
                  <span className="text-black ml-1">{reviewingRequest.reason}</span>
                </div>
                {reviewingRequest.proposed_marks !== null && reviewingRequest.proposed_marks !== undefined && (
                  <div className="text-sm">
                    <span className="text-neutral-500">Proposed Marks:</span>
                    <span className="text-black ml-1 font-medium">{reviewingRequest.proposed_marks}</span>
                  </div>
                )}
                {reviewingRequest.proposed_remarks && (
                  <div className="text-sm">
                    <span className="text-neutral-500">Proposed Remarks:</span>
                    <span className="text-black ml-1">{reviewingRequest.proposed_remarks}</span>
                  </div>
                )}
                {reviewingRequest.exam_result_detail && (
                  <div className="text-sm border-t border-neutral-200 pt-2 mt-2">
                    <span className="text-neutral-500">Current Marks:</span>
                    <span className="text-black ml-1 font-medium">{reviewingRequest.exam_result_detail.marks_obtained}</span>
                    <span className="text-neutral-400 ml-1">/ {reviewingRequest.exam_result_detail.exam_total_marks}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleReview}>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Note (optional)</label>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(sanitizeInput(e.target.value).slice(0, 500))}
                    placeholder={reviewAction === 'approve' ? 'Any notes for the instructor...' : 'Reason for rejection...'}
                    rows={3}
                    maxLength={500}
                    className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setReviewModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-4 py-2 rounded-md text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed transition ${
                      reviewAction === 'approve'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {isSubmitting
                      ? (reviewAction === 'approve' ? 'Approving...' : 'Rejecting...')
                      : (reviewAction === 'approve' ? 'Approve' : 'Reject')
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left bg-neutral-50">
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Requested By</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Index No.</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Exam</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Current Marks</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Proposed Marks</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Reason</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Date</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-neutral-400">No edit requests found</td></tr>
            ) : requests.map((req) => (
              <tr key={req.id} className="border-t last:border-b hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700">
                  <div>{req.requested_by_name || 'Unknown'}</div>
                  {req.requested_by_rank && <div className="text-xs text-neutral-500">{req.requested_by_rank}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700">{req.exam_result_detail?.index_number || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{req.exam_result_detail?.exam_title || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">
                  {req.exam_result_detail?.marks_obtained ?? '-'}
                  {req.exam_result_detail?.exam_total_marks && <span className="text-neutral-400">/{req.exam_result_detail.exam_total_marks}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700 font-medium">{req.proposed_marks ?? '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-600 max-w-[200px] truncate" title={req.reason}>{req.reason || '-'}</td>
                <td className="px-4 py-3">{statusBadge(req.status)}</td>
                <td className="px-4 py-3 text-sm text-neutral-500">{req.created_at ? new Date(req.created_at).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-3">
                  {req.status === 'pending' ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openReview(req, 'approve')}
                        className="px-2 py-1 rounded-md bg-green-600 text-white text-xs hover:bg-green-700 transition"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => openReview(req, 'reject')}
                        className="px-2 py-1 rounded-md bg-red-600 text-white text-xs hover:bg-red-700 transition"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400">Reviewed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-neutral-400">No edit requests found</div>
        ) : requests.map((req) => (
          <div key={req.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-medium text-sm text-black">{req.requested_by_name || 'Unknown'}{req.requested_by_rank && <span className="text-xs font-normal text-neutral-500 ml-1">({req.requested_by_rank})</span>}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {req.exam_result_detail?.exam_title || 'Exam'} - {req.exam_result_detail?.index_number || '-'}
                </div>
              </div>
              {statusBadge(req.status)}
            </div>
            <div className="text-xs text-neutral-600 mb-2">{req.reason}</div>
            <div className="flex items-center gap-4 text-xs text-neutral-500 mb-3">
              <span>Current: {req.exam_result_detail?.marks_obtained ?? '-'}</span>
              {req.proposed_marks !== null && req.proposed_marks !== undefined && (
                <span>Proposed: <span className="font-medium text-black">{req.proposed_marks}</span></span>
              )}
            </div>
            {req.status === 'pending' && (
              <div className="flex gap-2">
                <button onClick={() => openReview(req, 'approve')} className="flex-1 px-3 py-1.5 rounded-md bg-green-600 text-white text-xs hover:bg-green-700 transition">Approve</button>
                <button onClick={() => openReview(req, 'reject')} className="flex-1 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs hover:bg-red-700 transition">Reject</button>
              </div>
            )}
            {req.status !== 'pending' && req.review_note && (
              <div className="text-xs text-neutral-500 mt-1">
                <span className="font-medium">Review Note:</span> {req.review_note}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      )}
    </div>
  )
}
