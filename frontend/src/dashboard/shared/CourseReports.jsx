import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, Search, RefreshCw, ChevronLeft, ChevronRight,
  Plus, CheckCircle, Clock, AlertCircle, Send, Users,
} from 'lucide-react'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'

const DEFAULT_PAGE_SIZE = 10

const STATUS_META = {
  instructor_draft:     { label: 'Instructor Draft',     color: 'bg-gray-100 text-gray-700' },
  instructor_submitted: { label: 'Instructor Submitted', color: 'bg-blue-100 text-blue-700' },
  oic_draft:            { label: 'OIC Draft',            color: 'bg-yellow-100 text-yellow-800' },
  oic_submitted:        { label: 'OIC Submitted',        color: 'bg-blue-100 text-blue-700' },
  ci_draft:             { label: 'CI Draft',             color: 'bg-orange-100 text-orange-800' },
  ci_submitted:         { label: 'CI Submitted',         color: 'bg-blue-100 text-blue-700' },
  commandant_draft:     { label: 'Commandant Draft',     color: 'bg-purple-100 text-purple-800' },
  approved:             { label: 'Approved',             color: 'bg-green-100 text-green-800' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

export default function CourseReports() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const isInstructor = user?.role === 'instructor'
  const canBulkAction = ['instructor', 'oic', 'chief_instructor', 'commandant'].includes(user?.role)

  const [reports, setReports] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [initiateClassId, setInitiateClassId] = useState('')
  const [showInitiateModal, setShowInitiateModal] = useState(false)
  const [initiateError, setInitiateError] = useState('')
  const searchTimeout = useRef(null)

  const totalPages = Math.ceil(totalCount / pageSize)

  const { data: classesResp } = useQuery({
    queryKey: ['classes', 'for-course-reports', user?.role],
    queryFn: () => {
      if (isInstructor) return api.getMyClasses()
      return api.getAllClasses('is_active=true')
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })
  const allClasses = Array.isArray(classesResp) ? classesResp : (classesResp?.results ?? [])
  // Instructors only see classes where they are the assigned class instructor,
  // not classes where they merely teach a subject (getMyClasses returns both).
  const classes = isInstructor
    ? allClasses.filter(c => c.instructor === user?.id)
    : allClasses

  const toastRef = useRef(toast)
  toastRef.current = toast

  const [refreshTick, setRefreshTick] = useState(0)
  function loadReports() { setRefreshTick(t => t + 1) }

  useEffect(() => {
    let cancelled = false
    async function fetchReports() {
      setLoading(true)
      try {
        const parts = [`page=${page}`, `page_size=${pageSize}`]
        if (selectedClass) parts.push(`class_id=${selectedClass}`)
        if (selectedStatus) parts.push(`status=${selectedStatus}`)
        if (search.trim()) parts.push(`search=${encodeURIComponent(search.trim())}`)
        const data = await api.getCourseReports(parts.join('&'))
        if (!cancelled) {
          setReports(data.results ?? data ?? [])
          setTotalCount(data.count ?? (data.results ?? data ?? []).length)
        }
      } catch (err) {
        if (!cancelled) toastRef.current.error(err.message || 'Failed to load course reports')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchReports()
    return () => { cancelled = true }
  }, [page, pageSize, selectedClass, selectedStatus, search, refreshTick])

  function handleSearchChange(e) {
    clearTimeout(searchTimeout.current)
    const val = e.target.value
    searchTimeout.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
  }

  async function handleInitiateReports() {
    if (!initiateClassId) { setInitiateError('Please select a class'); return }
    setBulkLoading(true)
    setInitiateError('')
    try {
      const res = await api.bulkCreateCourseReports(initiateClassId)
      toast.success(res.detail || 'Reports initiated successfully')
      setShowInitiateModal(false)
      setInitiateClassId('')
      setPage(1)
      loadReports()
    } catch (err) {
      setInitiateError(err.message || 'Failed to initiate reports')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkSubmit() {
    if (!selectedClass) { toast.error('Select a class first to bulk-submit'); return }
    setBulkLoading(true)
    try {
      const res = await api.bulkSubmitCourseReports(selectedClass)
      toast.success(res.detail || 'Reports submitted successfully')
      loadReports()
    } catch (err) {
      toast.error(err.message || 'Failed to bulk-submit reports')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkAdvance() {
    if (!selectedClass) { toast.error('Select a class first to bulk-advance'); return }
    setBulkLoading(true)
    try {
      const res = await api.bulkAdvanceCourseReports(selectedClass)
      toast.success(res.detail || 'Reports advanced successfully')
      loadReports()
    } catch (err) {
      toast.error(err.message || 'Failed to bulk-advance reports')
    } finally {
      setBulkLoading(false)
    }
  }

  function formatDate(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function getDetailPath(id) {
    const role = user?.role
    if (role === 'commandant' || role === 'chief_instructor') return `/commandant/course-reports/${id}`
    if (role === 'oic') return `/oic/course-reports/${id}`
    return `/list/course-reports/${id}`
  }

  const pendingCount = reports.filter(r => r.status !== 'approved').length
  const approvedCount = reports.filter(r => r.status === 'approved').length

  return (
    <div className="p-4 md:p-6 text-black space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-black">Course Reports</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            {totalCount} report{totalCount !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isInstructor && (
            <button
              onClick={() => setShowInitiateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" />
              Initiate Reports
            </button>
          )}
          {canBulkAction && isInstructor && (
            <button
              onClick={handleBulkSubmit}
              disabled={bulkLoading || !selectedClass}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-black hover:bg-neutral-50 disabled:opacity-50 transition"
            >
              <Send className="w-4 h-4" />
              Bulk Submit
            </button>
          )}
          {canBulkAction && !isInstructor && (
            <button
              onClick={handleBulkAdvance}
              disabled={bulkLoading || !selectedClass}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-black hover:bg-neutral-50 disabled:opacity-50 transition"
            >
              <Send className="w-4 h-4" />
              Bulk Advance
            </button>
          )}
          <button
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-black hover:bg-neutral-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: totalCount,    icon: FileText,    color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Pending',  value: pendingCount,  icon: Clock,       color: 'text-yellow-600 bg-yellow-50' },
          { label: 'Approved', value: approvedCount, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
          { label: 'Classes',  value: classes.length,icon: Users,       color: 'text-blue-600 bg-blue-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">{label}</p>
              <p className="text-lg font-semibold text-black">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search student name or svc number…"
            onChange={handleSearchChange}
            className="w-full pl-9 pr-3 py-2 text-sm text-black border border-neutral-200 rounded-lg placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <select
          value={selectedClass}
          onChange={e => { setSelectedClass(e.target.value); setPage(1) }}
          className="text-sm text-black border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
        >
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={selectedStatus}
          onChange={e => { setSelectedStatus(e.target.value); setPage(1) }}
          className="text-sm text-black border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([val, { label }]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-neutral-200">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-neutral-200">
          <AlertCircle className="w-10 h-10 mb-2 text-neutral-300" />
          <p className="font-medium text-black">No course reports found</p>
          <p className="text-sm mt-1 text-neutral-600">
            {isInstructor ? 'Use "Initiate Reports" to create reports for a class.' : 'No reports match your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">

          {/* Mobile / tablet cards — hidden on lg+ */}
          <div className="lg:hidden divide-y divide-neutral-200">
            {reports.map(report => {
              const name = `${report.student?.first_name || ''} ${report.student?.last_name || ''}`.trim()
              const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
              return (
                <div
                  key={report.id}
                  onClick={() => navigate(getDetailPath(report.id))}
                  className="bg-neutral-50 p-3 sm:p-4 cursor-pointer hover:bg-neutral-100 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm sm:text-base text-black truncate">{name || '—'}</div>
                        <div className="text-xs text-neutral-600">{report.student?.svc_number || '—'}</div>
                        <div className="text-xs text-neutral-500">{report.class_name || '—'}</div>
                      </div>
                    </div>
                    <StatusBadge status={report.status} />
                  </div>
                  <div className="space-y-1.5 text-xs sm:text-sm">
                    {report.student?.rank && (
                      <div className="flex justify-between gap-2">
                        <span className="text-neutral-600">Rank:</span>
                        <span className="text-black">{report.student.rank}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Course:</span>
                      <span className="text-black truncate ml-2">{report.course_name || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Updated:</span>
                      <span className="text-neutral-500">{formatDate(report.updated_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table — hidden below lg */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Svc No.</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Course</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {reports.map(report => {
                  const name = `${report.student?.first_name || ''} ${report.student?.last_name || ''}`.trim()
                  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
                  return (
                    <tr
                      key={report.id}
                      onClick={() => navigate(getDetailPath(report.id))}
                      className="hover:bg-neutral-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap font-mono">
                        {report.student?.svc_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                        {report.student?.rank || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                            {initials}
                          </div>
                          <div className="font-medium text-sm text-black whitespace-nowrap">{name || '—'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                        {report.class_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                        {report.course_name || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                        {formatDate(report.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalCount > 0 && (
            <div className="px-4 py-3 border-t border-neutral-200">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-neutral-600">
                  Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
                  <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
                  <span className="font-semibold text-black">{totalCount}</span> reports
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-5 h-5 text-neutral-600" />
                  </button>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = []
                      const maxVisible = 5
                      let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
                      let endPage = Math.min(totalPages, startPage + maxVisible - 1)
                      if (endPage - startPage < maxVisible - 1) {
                        startPage = Math.max(1, endPage - maxVisible + 1)
                      }
                      if (startPage > 1) {
                        pages.push(
                          <button key={1} onClick={() => setPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>
                        )
                        if (startPage > 2) {
                          pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                        }
                      }
                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <button
                            key={i}
                            onClick={() => setPage(i)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition ${
                              page === i
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
                          <button key={totalPages} onClick={() => setPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalPages}</button>
                        )
                      }
                      return pages
                    })()}
                  </div>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-5 h-5 text-neutral-600" />
                  </button>
                  <div className="ml-2 flex items-center gap-2">
                    <span className="text-sm text-neutral-600 hidden sm:inline">Per page:</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                      className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initiate Reports Modal — portalled to body so fixed overlay covers the full viewport */}
      {showInitiateModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowInitiateModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-6">
            <h3 className="text-lg font-semibold text-black mb-1">Initiate Course Reports</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Creates a report record for every active student enrolled in the selected class.
            </p>
            <label className="block text-sm font-medium text-black mb-1">Select Class</label>
            <select
              value={initiateClassId}
              onChange={e => { setInitiateClassId(e.target.value); setInitiateError('') }}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white mb-4"
            >
              <option value="">— choose a class —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {initiateError && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{initiateError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowInitiateModal(false); setInitiateClassId(''); setInitiateError('') }}
                className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-neutral-700 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateReports}
                disabled={bulkLoading || !initiateClassId}
                className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {bulkLoading ? 'Creating…' : 'Initiate'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
