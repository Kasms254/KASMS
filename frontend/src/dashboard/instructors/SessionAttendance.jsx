import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, Clock, Calendar, CheckCircle, AlertCircle,
  RefreshCw, Download, Search, ChevronLeft, ChevronRight, X
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'

const ATTENDANCE_STATUS_COLORS = {
  present: 'bg-green-100 text-green-700',
  late: 'bg-yellow-100 text-yellow-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-blue-100 text-blue-700'
}

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function SessionAttendance() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [unmarkedStudents, setUnmarkedStudents] = useState([])
  const [markingStudent, setMarkingStudent] = useState(null)

  // Search and filter
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Pagination for unmarked students
  const [unmarkedPage, setUnmarkedPage] = useState(1)
  const [unmarkedPageSize, setUnmarkedPageSize] = useState(10)

  // Pagination for marked students
  const [markedPage, setMarkedPage] = useState(1)
  const [markedPageSize, setMarkedPageSize] = useState(10)

  // Load session and attendance data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionData, records, unmarked] = await Promise.all([
        api.getAttendanceSession(sessionId),
        api.getSessionAttendances(`session=${sessionId}`),
        api.getUnmarkedStudents(sessionId)
      ])
      setSession(sessionData)
      setAttendanceRecords(Array.isArray(records) ? records : (records?.results || records?.attendances || []))
      setUnmarkedStudents(Array.isArray(unmarked) ? unmarked : (unmarked?.unmarked_students || unmarked?.results || []))
    } catch (err) {
      toast.error(err.message || 'Failed to load session data')
    } finally {
      setLoading(false)
    }
  }, [sessionId, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Manual mark attendance
  async function handleManualMark(studentId, status) {
    setMarkingStudent(studentId)
    try {
      await api.bulkMarkSessionAttendance({
        session_id: parseInt(sessionId),
        attendance_records: [{ student_id: studentId, status }]
      })
      toast.success('Attendance marked')
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to mark attendance')
    } finally {
      setMarkingStudent(null)
    }
  }

  // Mark all absent
  async function handleMarkAllAbsent() {
    if (!window.confirm('Mark all unmarked students as absent?')) return
    try {
      const result = await api.markAbsentStudents(sessionId)
      toast.success(`Marked ${result.marked_count || 0} students as absent`)
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to mark absent')
    }
  }

  // Export CSV
  async function handleExportCSV() {
    try {
      const data = await api.exportSessionAttendance(sessionId)
      // Handle both raw CSV string and object with csv property
      const csvContent = typeof data === 'string' ? data : (data.csv || JSON.stringify(data))
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_${session?.title || 'session'}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err.message || 'Failed to export')
    }
  }

  // Filter unmarked students by search
  const filteredUnmarked = unmarkedStudents.filter(student => {
    const name = student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()
    const svc = student.svc_number || ''
    const rank = student.rank || ''
    const search = searchTerm.toLowerCase()
    return name.toLowerCase().includes(search) || svc.toLowerCase().includes(search) || rank.toLowerCase().includes(search)
  })

  // Filter marked students by search and status
  const filteredMarked = attendanceRecords.filter(record => {
    const name = record.student_name || ''
    const svc = record.student_svc_number || ''
    const rank = record.student_rank || ''
    const search = searchTerm.toLowerCase()
    const matchesSearch = name.toLowerCase().includes(search) || svc.toLowerCase().includes(search) || rank.toLowerCase().includes(search)
    const matchesStatus = !statusFilter || record.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Paginated data
  const paginatedUnmarked = filteredUnmarked.slice(
    (unmarkedPage - 1) * unmarkedPageSize,
    unmarkedPage * unmarkedPageSize
  )
  const totalUnmarkedPages = Math.ceil(filteredUnmarked.length / unmarkedPageSize)

  const paginatedMarked = filteredMarked.slice(
    (markedPage - 1) * markedPageSize,
    markedPage * markedPageSize
  )
  const totalMarkedPages = Math.ceil(filteredMarked.length / markedPageSize)

  // Format datetime
  function formatDateTime(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading session data...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-black">Session not found</h3>
          <button
            onClick={() => navigate('/list/attendance-sessions')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="mb-4 sm:mb-6">
        <button
          onClick={() => navigate('/list/attendance-sessions')}
          className="flex items-center gap-2 text-neutral-600 hover:text-black mb-4 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm text-neutral-500 mb-1">
              {session.status === 'completed' ? 'Attendance Report' :
               session.status === 'active' ? 'Mark Attendance' :
               'Session Preview'}
            </p>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">{session.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs sm:text-sm text-neutral-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formatDateTime(session.scheduled_start)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{session.duration_minutes || 60} min</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{session.class_name || 'Class'}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                session.status === 'active' ? 'bg-green-100 text-green-700' :
                session.status === 'completed' ? 'bg-neutral-100 text-neutral-700' :
                session.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                'bg-red-100 text-red-700'
              }`}>
                {session.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={loadData}
              className="px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-black" />
              <span className="hidden sm:inline text-black">Refresh</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-black">
            {attendanceRecords.length + unmarkedStudents.length}
          </div>
          <div className="text-xs sm:text-sm text-neutral-600 font-medium">Total</div>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-green-600">
            {attendanceRecords.filter(r => r.status === 'present').length}
          </div>
          <div className="text-xs sm:text-sm text-green-700 font-medium">Present</div>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-yellow-600">
            {attendanceRecords.filter(r => r.status === 'late').length}
          </div>
          <div className="text-xs sm:text-sm text-yellow-700 font-medium">Late</div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-red-600">
            {attendanceRecords.filter(r => r.status === 'absent').length}
          </div>
          <div className="text-xs sm:text-sm text-red-700 font-medium">Absent</div>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-blue-600">
            {attendanceRecords.filter(r => r.status === 'excused').length}
          </div>
          <div className="text-xs sm:text-sm text-blue-700 font-medium">Excused</div>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-orange-600">{unmarkedStudents.length}</div>
          <div className="text-xs sm:text-sm text-orange-700 font-medium">Pending</div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4 sm:mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by name, service number, or rank..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setUnmarkedPage(1); setMarkedPage(1) }}
                className="w-full pl-9 pr-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black placeholder-neutral-400"
              />
            </div>
            <div className="w-full sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setMarkedPage(1) }}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black"
              >
                <option value="">All Status</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>
            </div>
          </div>

          {/* Filter summary */}
          {(searchTerm || statusFilter) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
              <span className="text-xs text-neutral-600">Active filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Search: "{searchTerm}"
                  <button onClick={() => { setSearchTerm(''); setUnmarkedPage(1); setMarkedPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Status: {statusFilter}
                  <button onClick={() => { setStatusFilter(''); setMarkedPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unmarked Students Section - only show when session is active and manual marking is enabled */}
      {session.enable_manual_marking && session.status === 'active' && (
        <section className="mb-4 sm:mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-black">Unmarked Students</h3>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  {filteredUnmarked.length}
                </span>
              </div>
              {unmarkedStudents.length > 0 && (
                <button
                  onClick={handleMarkAllAbsent}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Mark All Absent
                </button>
              )}
            </div>

            {filteredUnmarked.length > 0 ? (
              <>
                {/* Mobile Card View */}
                <div className="lg:hidden p-4 space-y-3">
                  {paginatedUnmarked.map((student) => (
                    <div key={student.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                            {initials(student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.svc_number)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm sm:text-base text-black truncate">
                              {student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'}
                            </div>
                            <div className="text-xs text-neutral-600">{student.svc_number || '—'}</div>
                            {student.rank && <div className="text-xs text-neutral-500">{student.rank}</div>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleManualMark(student.id, 'present')}
                          disabled={markingStudent === student.id}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition disabled:opacity-50"
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleManualMark(student.id, 'late')}
                          disabled={markingStudent === student.id}
                          className="flex-1 px-3 py-2 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 transition disabled:opacity-50"
                        >
                          Late
                        </button>
                        <button
                          onClick={() => handleManualMark(student.id, 'absent')}
                          disabled={markingStudent === student.id}
                          className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition disabled:opacity-50"
                        >
                          Absent
                        </button>
                        <button
                          onClick={() => handleManualMark(student.id, 'excused')}
                          disabled={markingStudent === student.id}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          Excused
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
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Mark As</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 bg-white">
                      {paginatedUnmarked.map(student => (
                        <tr key={student.id} className="hover:bg-neutral-50 transition">
                          <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{student.svc_number || '—'}</td>
                          <td className="px-4 py-3 text-sm text-neutral-700">{student.rank || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-semibold text-xs flex-shrink-0">
                                {initials(student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.svc_number)}
                              </div>
                              <div className="font-medium text-sm text-black">
                                {student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleManualMark(student.id, 'present')}
                                disabled={markingStudent === student.id}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition disabled:opacity-50"
                              >
                                Present
                              </button>
                              <button
                                onClick={() => handleManualMark(student.id, 'late')}
                                disabled={markingStudent === student.id}
                                className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600 transition disabled:opacity-50"
                              >
                                Late
                              </button>
                              <button
                                onClick={() => handleManualMark(student.id, 'absent')}
                                disabled={markingStudent === student.id}
                                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition disabled:opacity-50"
                              >
                                Absent
                              </button>
                              <button
                                onClick={() => handleManualMark(student.id, 'excused')}
                                disabled={markingStudent === student.id}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50"
                              >
                                Excused
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination for unmarked */}
                {totalUnmarkedPages > 1 && (
                  <div className="px-4 py-3 border-t border-neutral-200">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-sm text-black">
                        Showing <span className="font-semibold">{((unmarkedPage - 1) * unmarkedPageSize) + 1}</span> to{' '}
                        <span className="font-semibold">{Math.min(unmarkedPage * unmarkedPageSize, filteredUnmarked.length)}</span> of{' '}
                        <span className="font-semibold">{filteredUnmarked.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setUnmarkedPage(p => Math.max(1, p - 1))}
                          disabled={unmarkedPage === 1}
                          className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          <ChevronLeft className="w-5 h-5 text-neutral-600" />
                        </button>
                        <span className="px-3 py-1 text-sm text-black">
                          Page {unmarkedPage} of {totalUnmarkedPages}
                        </span>
                        <button
                          onClick={() => setUnmarkedPage(p => Math.min(totalUnmarkedPages, p + 1))}
                          disabled={unmarkedPage >= totalUnmarkedPages}
                          className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          <ChevronRight className="w-5 h-5 text-neutral-600" />
                        </button>
                        <select
                          value={unmarkedPageSize}
                          onChange={(e) => { setUnmarkedPageSize(Number(e.target.value)); setUnmarkedPage(1) }}
                          className="ml-2 px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : unmarkedStudents.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="font-semibold text-black mb-1">All Students Marked</h3>
                <p className="text-sm text-neutral-500">All enrolled students have been marked for this session.</p>
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                <p className="text-neutral-500">No students match your search.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Manual marking disabled message */}
      {!session.enable_manual_marking && (
        <div className="bg-yellow-50 rounded-xl p-6 text-center border border-yellow-200 mb-4 sm:mb-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="font-semibold text-yellow-800 mb-1">Manual Marking Disabled</h3>
          <p className="text-sm text-yellow-700">Manual marking was not enabled for this session.</p>
        </div>
      )}

      {/* Marked Students Section */}
      <section>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
            <h3 className="font-semibold text-black">
              {session.status === 'completed' ? 'Attendance Records' : 'Marked Students'}
            </h3>
            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-full text-xs font-medium">
              {filteredMarked.length}
            </span>
          </div>

          {filteredMarked.length > 0 ? (
            <>
              {/* Mobile Card View */}
              <div className="lg:hidden p-4 space-y-3">
                {paginatedMarked.map((record) => (
                  <div key={record.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                          {initials(record.student_name || record.student_svc_number)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm sm:text-base text-black truncate">{record.student_name || '—'}</div>
                          <div className="text-xs text-neutral-600">{record.student_svc_number || '—'}</div>
                          {record.student_rank && <div className="text-xs text-neutral-500">{record.student_rank}</div>}
                        </div>
                      </div>
                      <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full flex-shrink-0 font-semibold ${ATTENDANCE_STATUS_COLORS[record.status] || 'bg-neutral-100 text-neutral-700'}`}>
                        {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs sm:text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-neutral-600">Method:</span>
                        <span className="text-black capitalize">{record.marking_method?.replace('_', ' ') || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-neutral-600">Time:</span>
                        <span className="text-black">{formatDateTime(record.marked_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full table-auto">
                  <thead className="bg-neutral-50">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Method</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white">
                    {paginatedMarked.map(record => (
                      <tr key={record.id} className="hover:bg-neutral-50 transition">
                        <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{record.student_svc_number || '—'}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{record.student_rank || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                              {initials(record.student_name || record.student_svc_number)}
                            </div>
                            <div className="font-medium text-sm text-black">{record.student_name || '—'}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${ATTENDANCE_STATUS_COLORS[record.status] || 'bg-neutral-100 text-neutral-700'}`}>
                            {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700 capitalize">{record.marking_method?.replace('_', ' ') || '—'}</td>
                        <td className="px-4 py-3 text-sm text-neutral-500">{formatDateTime(record.marked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination for marked */}
              {totalMarkedPages > 1 && (
                <div className="px-4 py-3 border-t border-neutral-200">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-sm text-black">
                      Showing <span className="font-semibold">{((markedPage - 1) * markedPageSize) + 1}</span> to{' '}
                      <span className="font-semibold">{Math.min(markedPage * markedPageSize, filteredMarked.length)}</span> of{' '}
                      <span className="font-semibold">{filteredMarked.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMarkedPage(p => Math.max(1, p - 1))}
                        disabled={markedPage === 1}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <ChevronLeft className="w-5 h-5 text-neutral-600" />
                      </button>
                      <span className="px-3 py-1 text-sm text-black">
                        Page {markedPage} of {totalMarkedPages}
                      </span>
                      <button
                        onClick={() => setMarkedPage(p => Math.min(totalMarkedPages, p + 1))}
                        disabled={markedPage >= totalMarkedPages}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <ChevronRight className="w-5 h-5 text-neutral-600" />
                      </button>
                      <select
                        value={markedPageSize}
                        onChange={(e) => { setMarkedPageSize(Number(e.target.value)); setMarkedPage(1) }}
                        className="ml-2 px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : attendanceRecords.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <h3 className="font-semibold text-black mb-1">No Attendance Records</h3>
              <p className="text-sm text-neutral-500">No students have been marked for this session yet.</p>
            </div>
          ) : (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-500">No students match your search or filter.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
