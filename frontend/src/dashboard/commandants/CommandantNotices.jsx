import { useEffect, useState, useMemo, useCallback } from 'react'
import { getCommandantNotices } from '../../lib/api'
import useToast from '../../hooks/useToast'

const PRIORITY_CLASSES = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-indigo-100 text-indigo-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-rose-100 text-rose-700',
  normal: 'bg-neutral-100 text-neutral-600',
}

export default function CommandantNotices() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [notices, setNotices] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 10

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  const hasActiveFilters = useMemo(() => (
    searchTerm.trim() !== '' || filterPriority !== '' || filterStatus !== ''
  ), [searchTerm, filterPriority, filterStatus])

  function clearFilters() {
    setSearchTerm('')
    setFilterPriority('')
    setFilterStatus('')
    setCurrentPage(1)
  }

  const isExpired = (notice) => {
    if (!notice.expiry_date) return false
    const now = new Date()
    const expiryDate = new Date(notice.expiry_date)
    expiryDate.setHours(23, 59, 59, 999)
    return now > expiryDate
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: currentPage, page_size: itemsPerPage })
        if (searchTerm.trim()) params.append('search', searchTerm.trim())
        if (filterPriority) params.append('priority', filterPriority)
        if (filterStatus) params.append('is_active', filterStatus)
        const res = await getCommandantNotices(params.toString())
        if (!mounted) return
        if (res && typeof res === 'object') {
          const list = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
          setNotices(list)
          setTotalCount(res.count || list.length)
          setTotalPages(Math.ceil((res.count || list.length) / itemsPerPage))
        } else {
          setNotices([])
          setTotalCount(0)
          setTotalPages(1)
        }
      } catch (err) {
        reportError(err?.message || 'Failed to load notices')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [currentPage, itemsPerPage, searchTerm, filterPriority, filterStatus, reportError])

  const filteredNotices = useMemo(() => {
    let filtered = [...notices]
    if (filterStatus === 'true') {
      filtered = filtered.filter(n => n.is_active && !isExpired(n))
    } else if (filterStatus === 'false') {
      filtered = filtered.filter(n => !n.is_active || isExpired(n))
    }
    return filtered
  }, [notices, filterStatus])

  return (
    <div className="text-black w-full">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Notices</h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">School-wide announcements and notices</p>
        </div>
      </header>

      {/* Search and Filter Section */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-5 mb-4 sm:mb-6">
        <div className="space-y-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by title or content..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => { setFilterPriority(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-neutral-600">
              Showing {filteredNotices.length} of {totalCount} notices
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="bg-white rounded-xl shadow p-5">
          <div className="space-y-3">
            {loading && <div className="p-6 text-center text-neutral-500">Loading…</div>}
            {!loading && filteredNotices.length === 0 && notices.length === 0 && (
              <div className="p-6 text-center text-neutral-500">No notices yet</div>
            )}
            {!loading && filteredNotices.length === 0 && notices.length > 0 && (
              <div className="p-6 text-center text-neutral-500">No notices match your filters</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredNotices.map((n) => {
                const expired = isExpired(n)
                const effectivelyActive = n.is_active && !expired
                return (
                  <article key={n.id} className={`p-4 border rounded-lg flex flex-col justify-between ${expired ? 'bg-gray-50 opacity-75' : ''}`}>
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-black">{n.title}</h4>
                          <div className="text-xs text-neutral-500 mt-1">
                            <span className={`inline-flex items-center text-xs px-2 py-1 rounded ${PRIORITY_CLASSES[n.priority] || 'bg-neutral-100 text-neutral-700'}`}>
                              {n.priority_display || n.priority}
                            </span>
                            <span className="mx-2">•</span>
                            <span>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                          </div>
                        </div>
                        <div className="text-right flex flex-col gap-1">
                          <div className={`inline-block text-xs px-2 py-1 rounded ${effectivelyActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {effectivelyActive ? 'Active' : 'Inactive'}
                          </div>
                          {expired && (
                            <div className="inline-block text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                              Expired
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-neutral-700">{n.content}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs text-neutral-500">
                        <span className={expired ? 'text-red-600 font-medium' : ''}>
                          Expiry: {n.expiry_date ? new Date(n.expiry_date).toLocaleDateString() : '—'}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-neutral-200">
                <div className="text-sm text-neutral-600">
                  Showing page {currentPage} of {totalPages} ({totalCount} total notices)
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
                  <div className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium">{currentPage}</div>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 rounded-md bg-white border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
