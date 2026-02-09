import React, { useEffect, useState } from 'react'
import useToast from '../../hooks/useToast'
import ConfirmModal from '../../components/ConfirmModal'
import * as api from '../../lib/api'
import * as LucideIcons from 'lucide-react'

export default function TeachingAssignments() {
  const toast = useToast()
  const [assignments, setAssignments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [ordering, setOrdering] = useState('class')
  const [loadingAssignments, setLoadingAssignments] = useState(false)

  const [confirm, setConfirm] = useState({ open: false, id: null, label: '' })
  const [removing, setRemoving] = useState(false)

  // Fetch paginated subjects (assignments) based on filters
  async function fetchAssignments({ page: p = page, pageSize: ps = pageSize, search: searchParam = debouncedSearch, ordering: ord = ordering } = {}) {
    setLoadingAssignments(true)
    try {
      const orderMap = {
        class: 'class_obj__name',
        subject: 'name',
      }
      const params = new URLSearchParams()
      params.append('is_active', 'true')
  if (searchParam) params.append('search', searchParam)
      if (ord && orderMap[ord]) params.append('ordering', orderMap[ord])
      params.append('page', p)
      params.append('page_size', ps)

      const data = await api.getSubjectsPaginated(params.toString())
      // data expected { count, results: [...] }
      const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : [])
  // If a search query exists, apply a client-side filter that includes instructor svc_number
  const q = (searchParam || '').toString().trim().toLowerCase()
      const matchesQuery = (s) => {
        if (!q) return true
        const instr = s.instructor || {}
        const instrName = (s.instructor_name || (instr.first_name ? `${instr.first_name} ${instr.last_name || ''}` : '') || '').toString().toLowerCase()
  // Backend SubjectSerializer exposes `instructor_svc_number` (source='instructor.svc_number')
  // so prefer that, then fall back to other common keys.
  const instrSvc = (s.instructor_svc_number || s.instructor_svc || instr.svc_number || instr.svc || '').toString().toLowerCase()
        const instrRank = (s.instructor_rank || instr.rank || instr.rank_display || '').toString().toLowerCase()
        const subj = (s.name || s.title || '').toString().toLowerCase()
        const cls = (s.class_name || s.class_obj?.name || '').toString().toLowerCase()
        return instrName.includes(q) || instrSvc.includes(q) || subj.includes(q) || cls.includes(q) || instrRank.includes(q)
      }

      const filtered = q ? results.filter(matchesQuery) : results
      setAssignments(filtered.filter(s => s.instructor))
      setTotalCount(typeof data.count === 'number' ? data.count : filtered.length)
      setPage(p)
      setPageSize(ps)
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to load assignments', type: 'error' })
    } finally {
      setLoadingAssignments(false)
    }
  }

  useEffect(() => {
    // initial paginated load
    fetchAssignments({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // debounce search input to avoid firing on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // when debounced search or ordering changes, reload page 1
  useEffect(() => {
    fetchAssignments({ page: 1, search: debouncedSearch, ordering })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, ordering])

  // create-assignment helpers removed — this view shows existing assignments only

  function handleRemoveClick(assignment) {
    setConfirm({ open: true, id: assignment.id, label: assignment.name || assignment.title || 'this assignment' })
  }

  async function confirmRemove() {
    if (!confirm.id) return
    setRemoving(true)
    try {
      await api.removeInstructorFromSubject(confirm.id)
      toast?.push?.({ message: 'Assignment removed', type: 'success' })
  await fetchAssignments({ page })
      // refresh complete list; no per-class available-subjects to update in this read-only view
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to remove assignment', type: 'error' })
    } finally {
      setRemoving(false)
      setConfirm({ open: false, id: null, label: '' })
    }
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Teaching Assignments</h2>
          <p className="text-sm text-neutral-500">View and manage instructor assignments to subjects</p>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col gap-3">
          {/* Search input and ordering */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <input
                placeholder="Search subjects or instructors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="w-full sm:w-64">
              <select
                value={ordering}
                onChange={(e) => setOrdering(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="class">Sort by class</option>
                <option value="subject">Sort by subject</option>
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setPage(1)}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm hover:bg-indigo-700 transition whitespace-nowrap shadow-sm"
            >
              Apply Filters
            </button>
            <button
              onClick={() => {
                setSearchTerm('')
                setDebouncedSearch('')
                setPage(1)
              }}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear All
            </button>
          </div>

          {/* Filter summary badges */}
          {(searchTerm || ordering !== 'class') && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
              <span className="text-xs text-neutral-600">Active filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Search: "{searchTerm}"
                  <button onClick={() => { setSearchTerm(''); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {ordering !== 'class' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Sort: {ordering === 'subject' ? 'Subject' : 'Class'}
                  <button onClick={() => { setOrdering('class'); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {loadingAssignments ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading assignments...</div>
      ) : assignments.length === 0 ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No assignments yet</div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto max-w-full">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left bg-neutral-50">
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Service No</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Rank</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Instructor</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Class</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Subject</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-700">{a.instructor?.svc_number || a.instructor?.svc || a.instructor_svc_number || a.instructor_svc || (typeof a.instructor === 'string' ? a.instructor : '-')}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{a.instructor?.rank || a.instructor?.rank_display || a.instructor_rank || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-black">{
                      a.instructor_name || (a.instructor?.first_name ? `${a.instructor.first_name} ${a.instructor.last_name || ''}` : (a.instructor?.svc_number || a.instructor))
                    }</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full whitespace-nowrap">
                        {a.class_name || a.class_obj?.name || a.class_obj?.title || (a.class && (a.class.name || a.class)) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full whitespace-nowrap">
                        {a.name || a.title || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemoveClick(a)}
                        className="px-3 py-1.5 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 transition whitespace-nowrap"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet View */}
          <div className="hidden md:block lg:hidden bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="text-left bg-neutral-50">
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">Instructor</th>
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">Assignment</th>
                    <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-t last:border-b hover:bg-neutral-50">
                      <td className="px-3 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-black text-sm truncate">{
                            a.instructor_name || (a.instructor?.first_name ? `${a.instructor.first_name} ${a.instructor.last_name || ''}` : (a.instructor?.svc_number || a.instructor))
                          }</div>
                          <div className="text-xs text-neutral-500">{a.instructor?.svc_number || a.instructor?.svc || a.instructor_svc_number || a.instructor_svc || '-'}</div>
                          {(a.instructor?.rank || a.instructor?.rank_display || a.instructor_rank) && (
                            <div className="text-xs text-neutral-600">{a.instructor?.rank || a.instructor?.rank_display || a.instructor_rank}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full whitespace-nowrap">
                              {a.class_name || a.class_obj?.name || a.class_obj?.title || (a.class && (a.class.name || a.class)) || '-'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full whitespace-nowrap">
                              {a.name || a.title || '-'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => handleRemoveClick(a)}
                          className="w-full px-3 py-1.5 rounded-md bg-red-600 text-xs text-white hover:bg-red-700 transition whitespace-nowrap text-center"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {assignments.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                {/* Header with instructor name */}
                <div className="mb-4">
                  <div className="font-medium text-black text-lg">{
                    a.instructor_name || (a.instructor?.first_name ? `${a.instructor.first_name} ${a.instructor.last_name || ''}` : (a.instructor?.svc_number || a.instructor))
                  }</div>
                  <div className="text-sm text-neutral-500">{a.instructor?.svc_number || a.instructor?.svc || a.instructor_svc_number || a.instructor_svc || '-'}</div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  {(a.instructor?.rank || a.instructor?.rank_display || a.instructor_rank) && (
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Rank:</span>
                      <span className="text-sm text-neutral-700">{a.instructor?.rank || a.instructor?.rank_display || a.instructor_rank}</span>
                    </div>
                  )}

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Class:</span>
                    <span className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                      {a.class_name || a.class_obj?.name || a.class_obj?.title || (a.class && (a.class.name || a.class)) || '-'}
                    </span>
                  </div>

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Subject:</span>
                    <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full">
                      {a.name || a.title || '-'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-3 border-t border-neutral-100">
                  <button
                    onClick={() => handleRemoveClick(a)}
                    className="w-full px-3 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 transition"
                  >
                    Remove Assignment
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination Controls */}
      {!loadingAssignments && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Results info */}
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> assignments
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              {/* Previous button */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = Math.ceil(totalCount / pageSize)
                  const pages = []
                  const maxVisible = 5

                  if (totalPages <= maxVisible) {
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                            page === i
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }
                  } else {
                    // Always show first page
                    pages.push(
                      <button
                        key={1}
                        onClick={() => setPage(1)}
                        className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                          page === 1
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        1
                      </button>
                    )

                    // Show ellipsis if needed
                    if (page > 3) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }

                    // Show pages around current page
                    const start = Math.max(2, page - 1)
                    const end = Math.min(totalPages - 1, page + 1)
                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                            page === i
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }

                    // Show ellipsis if needed
                    if (page < totalPages - 2) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }

                    // Always show last page
                    pages.push(
                      <button
                        key={totalPages}
                        onClick={() => setPage(totalPages)}
                        className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                          page === totalPages
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              {/* Next button */}
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                disabled={page >= Math.ceil(totalCount / pageSize)}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page size selector */}
              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-neutral-600 hidden sm:inline">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="border border-neutral-200 rounded-lg px-2 py-1 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm.open}
        title="Remove assignment"
        message={`Remove ${confirm.label}?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={confirmRemove}
        onCancel={() => setConfirm({ open: false, id: null, label: '' })}
        loading={removing}
      />
    </div>
  )
}
