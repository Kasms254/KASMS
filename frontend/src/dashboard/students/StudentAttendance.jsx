import React, { useEffect, useState, useCallback } from 'react'
import {
  QrCode, Calendar, CheckCircle, XCircle, AlertCircle,
  TrendingUp, TrendingDown, MapPin, RefreshCw,
  AlertTriangle, Award, Target
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'

const STATUS_COLORS = {
  present: { bg: 'bg-emerald-100', text: 'text-emerald-700', fill: 'bg-emerald-500' },
  late: { bg: 'bg-yellow-100', text: 'text-yellow-700', fill: 'bg-yellow-500' },
  absent: { bg: 'bg-red-100', text: 'text-red-700', fill: 'bg-red-500' },
  excused: { bg: 'bg-blue-100', text: 'text-blue-700', fill: 'bg-blue-500' }
}

export default function StudentAttendance() {
  useAuth() // ensures user is authenticated
  const toast = useToast()

  // State
  const [activeTab, setActiveTab] = useState('mark') // 'mark' | 'history' | 'stats'
  const [loading, setLoading] = useState(false)

  // Mark attendance state - students enter session_id and qr_token from QR code
  const [sessionId, setSessionId] = useState('') // UUID session_id from QR code
  const [qrToken, setQrToken] = useState('')
  const [location, setLocation] = useState({ latitude: null, longitude: null })
  const [locationLoading, setLocationLoading] = useState(false)
  const [markingAttendance, setMarkingAttendance] = useState(false)

  // History state
  const [attendanceHistory, setAttendanceHistory] = useState([])
  const [historyFilter, setHistoryFilter] = useState({ status: '', startDate: '', endDate: '' })

  // Stats state (fetched but may be used for future features)
  const [_attendanceStats, setAttendanceStats] = useState(null)


  // Load attendance history
  const loadAttendanceHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (historyFilter.status) params.append('status', historyFilter.status)
      if (historyFilter.startDate) params.append('start_date', historyFilter.startDate)
      if (historyFilter.endDate) params.append('end_date', historyFilter.endDate)

      const data = await api.getMyAttendance(params.toString())
      const list = Array.isArray(data) ? data : (data?.attendances || data?.results || [])
      setAttendanceHistory(list)
      // Also set stats from the same response
      if (data?.statistics) {
        setAttendanceStats(data.statistics)
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load attendance history')
    } finally {
      setLoading(false)
    }
  }, [historyFilter, toast])


  useEffect(() => {
    // Load attendance data on mount and when tab changes
    if (activeTab === 'history' || activeTab === 'stats') {
      loadAttendanceHistory()
    }
  }, [activeTab, loadAttendanceHistory])

  // Get current location
  async function getLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      return
    }

    setLocationLoading(true)
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        })
      })
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      })
      toast.success('Location captured')
    } catch (err) {
      toast.error('Failed to get location: ' + err.message)
    } finally {
      setLocationLoading(false)
    }
  }

  // Mark attendance with QR token - students enter session_id directly
  async function handleMarkAttendance() {
    if (!sessionId.trim()) {
      toast.error('Please enter the Session ID from the QR code')
      return
    }
    if (!qrToken.trim()) {
      toast.error('Please enter the QR code token')
      return
    }

    setMarkingAttendance(true)
    try {
      const payload = {
        session_id: sessionId.trim(),
        qr_token: qrToken.trim(),
        ...(location.latitude && { latitude: location.latitude, longitude: location.longitude })
      }
      const result = await api.markQRAttendance(payload)
      toast.success(`Attendance marked as ${result.status || 'present'}!`)
      setQrToken('')
      setSessionId('')
      loadAttendanceHistory()
    } catch (err) {
      toast.error(err.message || 'Failed to mark attendance')
    } finally {
      setMarkingAttendance(false)
    }
  }

  // Format datetime
  function formatDateTime(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  // Format date
  function formatDate(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    })
  }

  // Calculate attendance rate from history
  const calculateAttendanceRate = () => {
    if (attendanceHistory.length === 0) return 0
    const attended = attendanceHistory.filter(r => r.status === 'present' || r.status === 'late').length
    return ((attended / attendanceHistory.length) * 100).toFixed(1)
  }

  return (
    <div className="p-4 md:p-6 text-black">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">My Attendance</h1>
        <p className="text-sm text-gray-600 mt-1">Mark attendance and view your attendance history</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('mark')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === 'mark'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <QrCode className="w-4 h-4 inline-block mr-2" />
            Mark Attendance
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === 'history'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calendar className="w-4 h-4 inline-block mr-2" />
            History
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === 'stats'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline-block mr-2" />
            Statistics
          </button>
        </div>
      </div>

      {/* Mark Attendance Tab */}
      {activeTab === 'mark' && (
        <div className="space-y-6">
          {/* Mark Attendance Form */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-2">Mark Your Attendance</h2>
            <p className="text-sm text-gray-600 mb-6">
              Scan the QR code displayed by your instructor. Enter the Session ID and Token from the QR code below.
            </p>

            <div className="space-y-4">
              {/* Session ID Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session ID</label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="Enter the Session ID (UUID format)"
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">The session ID is shown in the QR code data</p>
              </div>

              {/* QR Token Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QR Token</label>
                <input
                  type="text"
                  value={qrToken}
                  onChange={(e) => setQrToken(e.target.value)}
                  placeholder="Enter the 16-character token"
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-center font-mono text-lg tracking-wider"
                  maxLength={16}
                />
              </div>

              {/* Location (optional) */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-gray-600" />
                    <div>
                      <span className="text-sm font-medium text-gray-800">Location</span>
                      <p className="text-xs text-gray-500">Some sessions may require location</p>
                    </div>
                  </div>
                  {location.latitude ? (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Captured
                    </span>
                  ) : (
                    <button
                      onClick={getLocation}
                      disabled={locationLoading}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 disabled:opacity-50"
                    >
                      {locationLoading ? 'Getting...' : 'Get Location'}
                    </button>
                  )}
                </div>
                {location.latitude && (
                  <p className="text-xs text-gray-500 mt-2">
                    Lat: {location.latitude.toFixed(6)}, Long: {location.longitude.toFixed(6)}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleMarkAttendance}
                disabled={markingAttendance || !qrToken.trim() || !sessionId.trim()}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {markingAttendance ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Marking Attendance...
                  </span>
                ) : (
                  'Mark Attendance'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="text-sm text-gray-600">Total Sessions</div>
              <div className="text-2xl font-bold text-gray-900">{attendanceHistory.length}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-4">
              <div className="text-sm text-emerald-700">Present</div>
              <div className="text-2xl font-bold text-emerald-600">
                {attendanceHistory.filter(r => r.status === 'present').length}
              </div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-sm text-yellow-700">Late</div>
              <div className="text-2xl font-bold text-yellow-600">
                {attendanceHistory.filter(r => r.status === 'late').length}
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-sm text-red-700">Absent</div>
              <div className="text-2xl font-bold text-red-600">
                {attendanceHistory.filter(r => r.status === 'absent').length}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <select
                value={historyFilter.status}
                onChange={(e) => setHistoryFilter(f => ({ ...f, status: e.target.value }))}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Status</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>
              <input
                type="date"
                value={historyFilter.startDate}
                onChange={(e) => setHistoryFilter(f => ({ ...f, startDate: e.target.value }))}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Start Date"
              />
              <input
                type="date"
                value={historyFilter.endDate}
                onChange={(e) => setHistoryFilter(f => ({ ...f, endDate: e.target.value }))}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="End Date"
              />
              <button
                onClick={loadAttendanceHistory}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Apply
              </button>
            </div>
          </div>

          {/* History List */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading history...</p>
              </div>
            ) : attendanceHistory.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-12 h-12 text-gray-400 mx-auto" />
                <h3 className="mt-4 text-gray-700 font-medium">No Attendance Records</h3>
                <p className="text-sm text-gray-500 mt-1">Your attendance history will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Session</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Class</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Method</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceHistory.map(record => (
                      <tr key={record.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{formatDate(record.marked_at)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{record.session_title || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{record.class_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[record.status]?.bg} ${STATUS_COLORS[record.status]?.text}`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                          {record.marking_method?.replace('_', ' ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(record.marked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  calculateAttendanceRate() >= 75 ? 'bg-emerald-100' : calculateAttendanceRate() >= 50 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <Target className={`w-6 h-6 ${
                    calculateAttendanceRate() >= 75 ? 'text-emerald-600' : calculateAttendanceRate() >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Attendance Rate</div>
                  <div className="text-2xl font-bold">{calculateAttendanceRate()}%</div>
                </div>
              </div>
              {calculateAttendanceRate() < 75 && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    Your attendance is below 75%. This may affect your performance evaluation.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Award className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Punctuality Rate</div>
                  <div className="text-2xl font-bold">
                    {attendanceHistory.length > 0
                      ? (
                          (attendanceHistory.filter(r => r.status === 'present').length /
                            attendanceHistory.filter(r => r.status !== 'absent').length || 1) * 100
                        ).toFixed(1)
                      : 0}%
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Sessions</div>
                  <div className="text-2xl font-bold">{attendanceHistory.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-semibold mb-4">Attendance Breakdown</h3>
            <div className="space-y-4">
              {['present', 'late', 'absent', 'excused'].map(status => {
                const count = attendanceHistory.filter(r => r.status === status).length
                const percentage = attendanceHistory.length > 0 ? (count / attendanceHistory.length) * 100 : 0

                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="capitalize text-sm font-medium">{status}</span>
                      <span className="text-sm text-gray-600">{count} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${STATUS_COLORS[status]?.fill}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Performance Impact Notice */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Attendance & Performance</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Your attendance contributes to 30% of your overall performance score. Exam scores make up the remaining 70%.
                  Maintaining good attendance can significantly impact your final evaluation.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-white/70 rounded-lg p-3">
                    <div className="text-gray-600">Exam Score Weight</div>
                    <div className="font-semibold text-lg">70%</div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-3">
                    <div className="text-gray-600">Attendance Weight</div>
                    <div className="font-semibold text-lg">30%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
