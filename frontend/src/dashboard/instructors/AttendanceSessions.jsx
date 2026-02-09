import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Play, Square, QrCode, Users, Clock, Calendar,
  ChevronDown, ChevronUp, Search, Filter, MoreVertical,
  CheckCircle, XCircle, AlertCircle, Download, Trash2, Edit,
  Eye, RefreshCw, UserCheck, UserX, MapPin, ChevronLeft, ChevronRight,
  Fingerprint, Upload, Loader2
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import ConfirmModal from '../../components/ConfirmModal'
import QRCodeDisplay from '../../components/QRCodeDisplay'
import ModernDateTimePicker from '../../components/ModernDateTimePicker'

const SESSION_TYPES = [
  { value: 'class', label: 'Class' },
  { value: 'exam', label: 'Exam' },
  { value: 'bedcheck', label: 'Bed Check' },
  { value: 'lab', label: 'Lab' },
  { value: 'other', label: 'Other' }
]

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700'
}

const ATTENDANCE_STATUS_COLORS = {
  present: 'bg-emerald-500 text-white',
  late: 'bg-yellow-500 text-white',
  absent: 'bg-red-500 text-white',
  excused: 'bg-blue-500 text-white'
}

export default function AttendanceSessions() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  // Sessions state
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', session_type: '', search: '' })

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10

  // Classes and subjects for creating sessions
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showBiometricModal, setShowBiometricModal] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, session: null })

  // Biometric state
  const [biometricRecords, setBiometricRecords] = useState([])
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [biometricSyncForm, setBiometricSyncForm] = useState({
    device_id: '',
    device_type: 'zkteco',
    biometric_id: '',
    scan_time: ''
  })

  // Selected session for modals
  const [selectedSession, setSelectedSession] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [sessionStats, setSessionStats] = useState(null)

  // Sanitize text input
  function sanitizeInput(value) {
    if (typeof value !== 'string') return value
    // eslint-disable-next-line no-control-regex
    const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(controlChars, '')
  }

  // Create form state
  const [createForm, setCreateForm] = useState({
    title: '',
    session_type: 'class',
    class_obj: '',
    scheduled_start: '',
    scheduled_end: '',
    duration_minutes: 60,
    allow_late_minutes: 10,
    qr_refresh_interval: 30,
    enable_qr_scan: true,
    enable_manual_marking: true,
    enable_biometric: false,
    require_location: false,
    description: ''
  })
  const [createError, setCreateError] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // QR refresh timer
  const [qrRefreshTimer, setQrRefreshTimer] = useState(null)
  const [qrExpiresIn, setQrExpiresIn] = useState(0)

  // All sessions (unfiltered for pagination)
  const [allSessions, setAllSessions] = useState([])

  // Load sessions
  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.status) params.append('status', filter.status)
      if (filter.session_type) params.append('session_type', filter.session_type)
      if (filter.search) params.append('search', filter.search)

      const data = await api.getMyAttendanceSessions(params.toString())
      // API returns { count, sessions: [...] } or { results: [...] } or array
      const list = Array.isArray(data) ? data : (data?.sessions || data?.results || [])

      // Sort sessions by created_at or scheduled_start descending (most recent first)
      const sortedList = [...list].sort((a, b) => {
        const dateA = new Date(a.created_at || a.scheduled_start)
        const dateB = new Date(b.created_at || b.scheduled_start)
        return dateB - dateA
      })

      setAllSessions(sortedList)
      setTotalCount(sortedList.length)
    } catch (err) {
      toast.error(err.message || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [filter, toast])

  // Paginate sessions on the frontend
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    setSessions(allSessions.slice(startIndex, endIndex))
  }, [allSessions, currentPage, pageSize])

  // Load classes and subjects on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [classData, subjectData] = await Promise.all([
          api.getMyClasses(),
          api.getMySubjects()
        ])
        setClasses(Array.isArray(classData) ? classData : (classData?.results || []))
        setSubjects(Array.isArray(subjectData) ? subjectData : (subjectData?.results || []))
      } catch (err) {
        console.error('Failed to load classes/subjects:', err)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Cleanup QR timer on unmount
  useEffect(() => {
    return () => {
      if (qrRefreshTimer) clearInterval(qrRefreshTimer)
    }
  }, [qrRefreshTimer])

  // Get minimum datetime (current time) for date inputs
  const getMinDateTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  }

  // Create session
  async function handleCreateSession(e) {
    e.preventDefault()
    setCreateError('')

    if (!createForm.title || !createForm.class_obj || !createForm.scheduled_start || !createForm.scheduled_end) {
      setCreateError('Please fill in all required fields')
      return
    }

    const now = new Date()
    const startTime = new Date(createForm.scheduled_start)
    const endTime = new Date(createForm.scheduled_end)

    // Validate start time is not in the past
    if (startTime < now) {
      setCreateError('Start time cannot be in the past')
      return
    }

    // Validate end time is after start time
    if (endTime <= startTime) {
      setCreateError('End time must be after start time')
      return
    }

    setCreateLoading(true)
    try {
      const { subject, ...rest } = createForm;
      const payload = {
        ...rest,
        class_obj: Number(createForm.class_obj)
      }
      await api.createAttendanceSession(payload)
      toast.success('Session created successfully')
      setShowCreateModal(false)
      resetCreateForm()
      loadSessions()
    } catch (err) {
      setCreateError(err.message || 'Failed to create session')
    } finally {
      setCreateLoading(false)
    }
  }

  function resetCreateForm() {
    setCreateForm({
      title: '',
      session_type: 'class',
      class_obj: '',
      scheduled_start: '',
      scheduled_end: '',
      duration_minutes: 60,
      allow_late_minutes: 10,
      qr_refresh_interval: 30,
      enable_qr_scan: true,
      enable_manual_marking: true,
      enable_biometric: false,
      require_location: false,
      description: ''
    })
    setCreateError('')
  }

  // Start session
  async function handleStartSession(session) {
    // Check if session can be started (within 5 minutes before scheduled start)
    const now = new Date()
    const scheduledStart = new Date(session.scheduled_start)
    const minutesUntilStart = (scheduledStart - now) / 1000 / 60

    if (minutesUntilStart > 5) {
      const timeStr = scheduledStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      toast.error(`Session cannot be started yet. Please wait until 5 minutes before the scheduled time (${timeStr}).`)
      return
    }

    try {
      await api.startAttendanceSession(session.id)
      toast.success('Session started')
      loadSessions()
    } catch (err) {
      toast.error(err.message || 'Failed to start session')
    }
  }

  // End session
  async function handleEndSession(session) {
    try {
      await api.endAttendanceSession(session.id)
      toast.success('Session ended')
      loadSessions()
      if (showQRModal && selectedSession?.id === session.id) {
        setShowQRModal(false)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to end session')
    }
  }

  // Delete session
  async function handleDeleteSession(session) {
    try {
      await api.deleteAttendanceSession(session.id)
      toast.success('Session deleted')
      loadSessions()
    } catch (err) {
      toast.error(err.message || 'Failed to delete session')
    }
  }

  // Show QR Code
  async function handleShowQR(session) {
    setSelectedSession(session)
    setShowQRModal(true)
    await refreshQRCode(session.id)
  }

  // Refresh QR code
  async function refreshQRCode(sessionId) {
    try {
      const data = await api.getSessionQRCode(sessionId)
      setQrData(data)
      setQrExpiresIn(data.expires_time || data.expires_in || 30)

      // Start countdown timer
      if (qrRefreshTimer) clearInterval(qrRefreshTimer)
      const timer = setInterval(() => {
        setQrExpiresIn(prev => {
            if (prev <= 1) {
            refreshQRCode(sessionId)
            return data.refresh_interval || data.qr_refresh_interval || 30
          }
          return prev - 1
        })
      }, 1000)
      setQrRefreshTimer(timer)
    } catch (err) {
      toast.error(err.message || 'Failed to load QR code')
    }
  }

  // Navigate to attendance page
  function handleShowAttendance(session) {
    navigate(`/list/attendance-sessions/${session.id}`)
  }

  // Show statistics
  async function handleShowStats(session) {
    setSelectedSession(session)
    setShowStatsModal(true)
    try {
      const data = await api.getSessionStatistics(session.id)
      // Backend returns { statistics: {...}, session: {...}, ... }
      setSessionStats(data.statistics || data)
    } catch (err) {
      toast.error(err.message || 'Failed to load statistics')
    }
  }

  // Biometric functions
  async function handleShowBiometric() {
    setShowBiometricModal(true)
    setBiometricLoading(true)
    try {
      const data = await api.getUnprocessedBiometrics()
      setBiometricRecords(Array.isArray(data) ? data : (data?.records || []))
    } catch (err) {
      toast.error(err.message || 'Failed to load biometric records')
    } finally {
      setBiometricLoading(false)
    }
  }

  async function handleSyncBiometric(e) {
    e.preventDefault()
    if (!biometricSyncForm.device_id || !biometricSyncForm.biometric_id || !biometricSyncForm.scan_time) {
      toast.error('Please fill in all required fields')
      return
    }

    setBiometricLoading(true)
    try {
      const result = await api.syncBiometricRecords({
        device_id: biometricSyncForm.device_id,
        device_type: biometricSyncForm.device_type,
        records: [{
          biometric_id: biometricSyncForm.biometric_id,
          scan_time: new Date(biometricSyncForm.scan_time).toISOString()
        }]
      })
      toast.success(`Synced: ${result.created || 0} created, ${result.processed || 0} processed`)
      setBiometricSyncForm({ device_id: '', device_type: 'zkteco', biometric_id: '', scan_time: '' })
      // Refresh records
      const data = await api.getUnprocessedBiometrics()
      setBiometricRecords(Array.isArray(data) ? data : (data?.records || []))
    } catch (err) {
      toast.error(err.message || 'Failed to sync biometric record')
    } finally {
      setBiometricLoading(false)
    }
  }

  async function handleProcessPendingBiometrics() {
    setBiometricLoading(true)
    try {
      const result = await api.processPendingBiometrics()
      toast.success(`Processed: ${result.processed || 0} records`)
      // Refresh records
      const data = await api.getUnprocessedBiometrics()
      setBiometricRecords(Array.isArray(data) ? data : (data?.records || []))
    } catch (err) {
      toast.error(err.message || 'Failed to process biometric records')
    } finally {
      setBiometricLoading(false)
    }
  }

  // Export CSV
  async function handleExportCSV(session) {
    try {
      const data = await api.exportSessionAttendance(session.id)
      // Handle both raw CSV string and object with csv property
      const csvContent = typeof data === 'string' ? data : (data.csv || JSON.stringify(data))
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_${session.title}_${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err.message || 'Failed to export')
    }
  }

  // Confirm action handler
  function handleConfirmAction() {
    if (!confirmModal.action || !confirmModal.session) return

    switch (confirmModal.action) {
      case 'start':
        handleStartSession(confirmModal.session)
        break
      case 'end':
        handleEndSession(confirmModal.session)
        break
      case 'delete':
        handleDeleteSession(confirmModal.session)
        break
    }
    setConfirmModal({ open: false, action: null, session: null })
  }

  // Format datetime
  function formatDateTime(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="p-4 md:p-6 text-black">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Attendance Sessions</h1>
          <p className="text-sm text-gray-600 mt-1">Manage attendance sessions with QR codes, manual marking, and biometric integration</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleShowBiometric}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            <Fingerprint className="w-5 h-5" />
            Biometric
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus className="w-5 h-5" />
            Create Session
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search sessions..."
                value={filter.search}
                onChange={(e) => { setFilter(f => ({ ...f, search: e.target.value })); setCurrentPage(1) }}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <select
            value={filter.status}
            onChange={(e) => { setFilter(f => ({ ...f, status: e.target.value })); setCurrentPage(1) }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={filter.session_type}
            onChange={(e) => { setFilter(f => ({ ...f, session_type: e.target.value })); setCurrentPage(1) }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Types</option>
            {SESSION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={loadSessions}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No sessions found</h3>
            <p className="mt-2 text-gray-600">Create your first attendance session to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Create Session
            </button>
          </div>
        ) : (
          <>
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onStart={() => setConfirmModal({ open: true, action: 'start', session })}
                onEnd={() => setConfirmModal({ open: true, action: 'end', session })}
                onShowQR={() => handleShowQR(session)}
                onShowAttendance={() => handleShowAttendance(session)}
                onShowStats={() => handleShowStats(session)}
                onExport={() => handleExportCSV(session)}
                onDelete={() => setConfirmModal({ open: true, action: 'delete', session })}
                formatDateTime={formatDateTime}
              />
            ))}

            {/* Pagination */}
            {totalCount > pageSize && (
              <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-4 mt-4">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} sessions
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.ceil(totalCount / pageSize) }, (_, i) => i + 1)
                      .filter(page => {
                        const totalPages = Math.ceil(totalCount / pageSize)
                        if (totalPages <= 5) return true
                        if (page === 1 || page === totalPages) return true
                        if (Math.abs(page - currentPage) <= 1) return true
                        return false
                      })
                      .map((page, idx, arr) => (
                        <React.Fragment key={page}>
                          {idx > 0 && arr[idx - 1] !== page - 1 && (
                            <span className="px-2 text-gray-400">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                              currentPage === page
                                ? 'bg-indigo-600 text-white'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                    disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                    className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); resetCreateForm() }} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <form onSubmit={handleCreateSession} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Create session</h4>
                  <p className="text-sm text-neutral-500">Create a new attendance session.</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { setShowCreateModal(false); resetCreateForm() }} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              {createError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{createError}</p>
                </div>
              )}
              <div className="mt-4">
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1 flex justify-between">
                    <span>Title</span>
                    <span className={`text-xs ${(createForm.title?.length || 0) > 40 ? 'text-red-500' : 'text-neutral-400'}`}>{createForm.title?.length || 0}/40</span>
                  </div>
                  <input value={createForm.title} onChange={(e) => setCreateForm(f => ({ ...f, title: sanitizeInput(e.target.value).slice(0, 40) }))} maxLength={40} placeholder="e.g. Bedcheck Attendance" className="w-full border border-neutral-200 rounded px-3 py-2 text-black" required />
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <label className="block">
                    <div className="text-sm text-neutral-600 mb-1">Type</div>
                    <select value={createForm.session_type} onChange={(e) => setCreateForm(f => ({ ...f, session_type: e.target.value }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                      {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-sm text-neutral-600 mb-1">Class</div>
                    <select value={createForm.class_obj} onChange={(e) => setCreateForm(f => ({ ...f, class_obj: e.target.value }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" required>
                      <option value="">Select class</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name || c.class_code}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block mb-3">
                  {/* Subject field removed */}
                </label>
                <div className="mb-3">
                  <ModernDateTimePicker
                    label="Start Time"
                    value={createForm.scheduled_start}
                    onChange={(val) => setCreateForm(f => ({ ...f, scheduled_start: val }))}
                    min={getMinDateTime()}
                    placeholder="Select date"
                  />
                </div>
                <div className="mb-3">
                  <ModernDateTimePicker
                    label="End Time"
                    value={createForm.scheduled_end}
                    onChange={(val) => setCreateForm(f => ({ ...f, scheduled_end: val }))}
                    min={createForm.scheduled_start || getMinDateTime()}
                    placeholder="Select date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <label className="block">
                    <div className="text-sm text-neutral-600 mb-1">Late Grace Period (min)</div>
                    <input type="number" min="0" max="60" value={createForm.allow_late_minutes} onChange={(e) => setCreateForm(f => ({ ...f, allow_late_minutes: Number(e.target.value) }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                  </label>
                  <label className="block">
                    <div className="text-sm text-neutral-600 mb-1">QR Refresh (sec)</div>
                    <input type="number" min="10" max="300" value={createForm.qr_refresh_interval} onChange={(e) => setCreateForm(f => ({ ...f, qr_refresh_interval: Number(e.target.value) }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                  </label>
                </div>
                <div className="mb-3">
                  <div className="text-sm text-neutral-600 mb-2">Marking Methods</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={createForm.enable_qr_scan} onChange={(e) => setCreateForm(f => ({ ...f, enable_qr_scan: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-gray-700">QR Scan</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={createForm.enable_manual_marking} onChange={(e) => setCreateForm(f => ({ ...f, enable_manual_marking: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-gray-700">Manual</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={createForm.enable_biometric} onChange={(e) => setCreateForm(f => ({ ...f, enable_biometric: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-gray-700">Biometric</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={createForm.require_location} onChange={(e) => setCreateForm(f => ({ ...f, require_location: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-gray-700">Location</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => { setShowCreateModal(false); resetCreateForm() }} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={createLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{createLoading ? 'Creating...' : 'Create session'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowQRModal(false); if (qrRefreshTimer) clearInterval(qrRefreshTimer) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 text-center">
              <h2 className="text-xl font-semibold mb-2">{selectedSession.title}</h2>
              <p className="text-sm text-gray-600 mb-4">Scan this QR code to mark attendance</p>

              {qrData ? (
                <div className="space-y-4">
                  {/* Scannable QR Code Display */}
                  <div className="bg-gray-100 p-6 rounded-lg">
                    <div className="bg-white p-4 rounded-lg shadow-inner flex flex-col items-center">
                      <QRCodeDisplay sessionId={selectedSession.session_id} token={qrData.qr_token} size={200} />
                      <p className="mt-3 font-mono text-sm text-gray-500">Token: {qrData.qr_token}</p>
                    </div>
                  </div>

                  {/* Timer */}
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <RefreshCw className={`w-4 h-4 ${qrExpiresIn <= 5 ? 'text-red-500 animate-spin' : 'text-gray-500'}`} />
                    <span className={qrExpiresIn <= 5 ? 'text-red-500 font-medium' : 'text-gray-600'}>
                      Refreshes in {qrExpiresIn}s
                    </span>
                  </div>

                  <div className="text-xs text-gray-500">
                    Session ID: {selectedSession.session_id}
                  </div>
                </div>
              ) : (
                <div className="py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => { setShowQRModal(false); if (qrRefreshTimer) clearInterval(qrRefreshTimer) }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
                >
                  Close
                </button>
                {selectedSession.status === 'active' && (
                  <button
                    onClick={() => setConfirmModal({ open: true, action: 'end', session: selectedSession })}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  >
                    End Session
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Modal */}
      {showStatsModal && selectedSession && sessionStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowStatsModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Session Statistics</h2>
                <button onClick={() => setShowStatsModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600">Total Students</div>
                    <div className="text-2xl font-bold">{sessionStats.total_students || 0}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600">Attendance Rate</div>
                    <div className="text-2xl font-bold">{sessionStats.attendance_rate || 0}%</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">By Status</h3>
                  <div className="flex items-center justify-between">
                    <span>Present</span>
                    <span className={`px-2 py-1 rounded text-sm ${ATTENDANCE_STATUS_COLORS.present}`}>
                      {sessionStats.present_count || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Late</span>
                    <span className={`px-2 py-1 rounded text-sm ${ATTENDANCE_STATUS_COLORS.late}`}>
                      {sessionStats.late_count || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Absent</span>
                    <span className={`px-2 py-1 rounded text-sm ${ATTENDANCE_STATUS_COLORS.absent}`}>
                      {sessionStats.absent_count || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Excused</span>
                    <span className={`px-2 py-1 rounded text-sm ${ATTENDANCE_STATUS_COLORS.excused}`}>
                      {sessionStats.excused_count || 0}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">By Method</h3>
                  <div className="flex items-center justify-between">
                    <span>QR Scan</span>
                    <span className="text-gray-600">{sessionStats.qr_scan_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Manual</span>
                    <span className="text-gray-600">{sessionStats.manual_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Biometric</span>
                    <span className="text-gray-600">{sessionStats.biometric_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Admin</span>
                    <span className="text-gray-600">{sessionStats.admin_count || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Modal */}
      {showBiometricModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowBiometricModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-6 h-6 text-purple-600" />
                <div>
                  <h2 className="text-xl font-semibold">Biometric Management</h2>
                  <p className="text-sm text-gray-500">Sync and process biometric attendance records</p>
                </div>
              </div>
              <button onClick={() => setShowBiometricModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] space-y-6">
              {/* Manual Sync Form */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <h3 className="font-medium text-purple-900 mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Manual Biometric Entry
                </h3>
                <form onSubmit={handleSyncBiometric} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Device ID *</label>
                    <input
                      type="text"
                      value={biometricSyncForm.device_id}
                      onChange={(e) => setBiometricSyncForm(f => ({ ...f, device_id: e.target.value }))}
                      placeholder="e.g., device_001"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Device Type</label>
                    <select
                      value={biometricSyncForm.device_type}
                      onChange={(e) => setBiometricSyncForm(f => ({ ...f, device_type: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="zkteco">ZKTeco</option>
                      <option value="fingerprint">Fingerprint Scanner</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Student SVC Number *</label>
                    <input
                      type="text"
                      value={biometricSyncForm.biometric_id}
                      onChange={(e) => setBiometricSyncForm(f => ({ ...f, biometric_id: e.target.value }))}
                      placeholder="e.g., SVC12345"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scan Time *</label>
                    <input
                      type="datetime-local"
                      value={biometricSyncForm.scan_time}
                      onChange={(e) => setBiometricSyncForm(f => ({ ...f, scan_time: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={biometricLoading}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {biometricLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Sync Biometric Record
                    </button>
                  </div>
                </form>
              </div>

              {/* Process Pending Button */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                <div>
                  <h3 className="font-medium">Unprocessed Records</h3>
                  <p className="text-sm text-gray-500">Process pending biometric scans to create attendance records</p>
                </div>
                <button
                  onClick={handleProcessPendingBiometrics}
                  disabled={biometricLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {biometricLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Process All
                </button>
              </div>

              {/* Unprocessed Records Table */}
              <div>
                <h3 className="font-medium mb-3">Pending Biometric Records ({biometricRecords.length})</h3>
                {biometricLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                    <p className="mt-2 text-gray-500">Loading records...</p>
                  </div>
                ) : biometricRecords.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Student</th>
                          <th className="px-4 py-2 text-left">Biometric ID</th>
                          <th className="px-4 py-2 text-left">Device</th>
                          <th className="px-4 py-2 text-left">Scan Time</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {biometricRecords.map(record => (
                          <tr key={record.id} className="border-t">
                            <td className="px-4 py-2">{record.student_name || '—'}</td>
                            <td className="px-4 py-2 font-mono text-xs">{record.biometric_id}</td>
                            <td className="px-4 py-2 capitalize">{record.device_type || '—'}</td>
                            <td className="px-4 py-2">{formatDateTime(record.scan_time)}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${record.processed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {record.processed ? 'Processed' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Fingerprint className="w-12 h-12 text-gray-300 mx-auto" />
                    <p className="mt-2 text-gray-500">No pending biometric records</p>
                    <p className="text-sm text-gray-400">Records will appear here when synced from biometric devices</p>
                  </div>
                )}
              </div>

              {/* Info Section */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h3 className="font-medium text-blue-900 mb-2">How Biometric Attendance Works</h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>Students scan their fingerprint on the biometric device</li>
                  <li>Device records are synced to the system (manually or via API)</li>
                  <li>System matches the scan time with active attendance sessions</li>
                  <li>Attendance is automatically marked based on the scan time</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmModal.open}
        title={
          confirmModal.action === 'start' ? 'Start Session' :
          confirmModal.action === 'end' ? 'End Session' :
          confirmModal.action === 'delete' ? 'Delete Session' : 'Confirm'
        }
        message={
          confirmModal.action === 'start' ? 'Are you sure you want to start this session? Students will be able to mark attendance.' :
          confirmModal.action === 'end' ? 'Are you sure you want to end this session? No more attendance can be marked.' :
          confirmModal.action === 'delete' ? 'Are you sure you want to delete this session? This action cannot be undone.' : 'Are you sure?'
        }
        confirmLabel={confirmModal.action === 'delete' ? 'Delete' : 'Confirm'}
        confirmVariant={confirmModal.action === 'delete' ? 'danger' : ''}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal({ open: false, action: null, session: null })}
      />
    </div>
  )
}

// Session Card Component
function SessionCard({ session, onStart, onEnd, onShowQR, onShowAttendance, onShowStats, onExport, onDelete, formatDateTime }) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h3 className="font-semibold text-gray-900">{session.title}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[session.status]}`}>
              {session.status}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
              {session.session_type}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600">
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
            {session.subject_name && (
              <div className="text-gray-500">| {session.subject_name}</div>
            )}
          </div>

          {/* Marking methods indicators */}
          <div className="mt-2 flex gap-2">
            {session.enable_qr_scan && (
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">QR</span>
            )}
            {session.enable_manual_marking && (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">Manual</span>
            )}
            {session.enable_biometric && (
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">Biometric</span>
            )}
            {session.require_location && (
              <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Location
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {session.status === 'scheduled' && (
            <button
              onClick={onStart}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          )}

          {session.status === 'active' && (
            <>
              {session.enable_manual_marking && (
                <button
                  onClick={onShowAttendance}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm"
                >
                  <UserCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Mark</span>
                </button>
              )}
              <button
                onClick={onShowQR}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">QR</span>
              </button>
              <button
                onClick={onEnd}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
              >
                <Square className="w-4 h-4" />
                <span className="hidden sm:inline">End</span>
              </button>
            </>
          )}

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <MoreVertical className="w-5 h-5 text-gray-500" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-20">
                  {session.status !== 'scheduled' && (
                    <button
                      onClick={() => { onShowAttendance(); setShowMenu(false) }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Users className="w-4 h-4" />
                      Attendance Report
                    </button>
                  )}
                  {session.status !== 'scheduled' && (
                    <button
                      onClick={() => { onShowStats(); setShowMenu(false) }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Statistics
                    </button>
                  )}
                  {session.status !== 'scheduled' && (
                    <button
                      onClick={() => { onExport(); setShowMenu(false) }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  )}
                  {session.status !== 'completed' && (
                    <button
                      onClick={() => { onDelete(); setShowMenu(false) }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
