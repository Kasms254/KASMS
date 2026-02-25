import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  QrCode, Calendar, CheckCircle, XCircle, AlertCircle,
  TrendingUp, MapPin, RefreshCw,
  AlertTriangle, Award, Target, Camera, X, Keyboard, Filter, RotateCcw
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import ModernDatePicker from '../../components/ModernDatePicker'

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

  // Mark attendance state
  const [sessionId, setSessionId] = useState('')
  const [qrToken, setQrToken] = useState('')
  const [location, setLocation] = useState({ latitude: null, longitude: null })
  const [locationLoading, setLocationLoading] = useState(false)
  const [markingAttendance, setMarkingAttendance] = useState(false)

  // QR Scanner state
  const [showScanner, setShowScanner] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)

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

  // Safely stop and clean up a scanner instance
  async function safeStopScanner(scanner) {
    if (!scanner) return
    try {
      const state = scanner.getState()
      // Only stop if actually scanning or paused (state 2 = SCANNING, 3 = PAUSED)
      if (state === 2 || state === 3) {
        await scanner.stop()
      }
    } catch {
      // Scanner already stopped or never started — ignore
    }
    try {
      scanner.clear()
    } catch {
      // ignore clear errors
    }
  }

  // Start QR scanner
  async function startScanner() {
    setScannerError('')
    setShowScanner(true)

    // Wait for DOM element to be ready
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('qr-reader')
        html5QrCodeRef.current = html5QrCode

        // Responsive QR box: 70% of the smaller viewport dimension, capped at 250
        const vw = window.innerWidth
        const vh = window.innerHeight
        const boxSize = Math.min(Math.floor(Math.min(vw, vh) * 0.6), 250)

        const scanConfig = {
          fps: 10,
          qrbox: { width: boxSize, height: boxSize },
          aspectRatio: 1
        }

        const onSuccess = (decodedText) => handleQRCodeScanned(decodedText)
        const onFailure = () => {} // QR not found yet — keep scanning

        // Try rear camera first, then fall back to any available camera
        try {
          await html5QrCode.start(
            { facingMode: 'environment' },
            scanConfig,
            onSuccess,
            onFailure
          )
        } catch {
          // Rear camera failed — enumerate devices and try the first one
          const devices = await Html5Qrcode.getCameras()
          if (devices && devices.length > 0) {
            await html5QrCode.start(
              devices[0].id,
              scanConfig,
              onSuccess,
              onFailure
            )
          } else {
            throw new Error('No cameras found on this device. Please use manual entry.')
          }
        }
      } catch (err) {
        console.error('Scanner error:', err)
        setScannerError(
          err.message || 'Failed to start camera. Please check camera permissions and ensure you are on HTTPS.'
        )
        setShowScanner(false)
      }
    }, 100)
  }

  // Stop QR scanner
  async function stopScanner() {
    const scanner = html5QrCodeRef.current
    html5QrCodeRef.current = null
    setShowScanner(false)
    await safeStopScanner(scanner)
  }

  // Handle scanned QR code
  function handleQRCodeScanned(decodedText) {
    stopScanner()

    try {
      // Try parsing as JSON first (new format: { session_id, qr_token })
      const data = JSON.parse(decodedText)
      if (data.session_id && data.qr_token) {
        setSessionId(String(data.session_id))
        setQrToken(data.qr_token)
        toast.success('QR code scanned successfully!')
        // Auto-submit after a short delay
        setTimeout(() => {
          submitAttendance(String(data.session_id), data.qr_token)
        }, 500)
        return
      }
    } catch {
      // Not JSON, might be just the token (legacy format)
    }

    // Legacy: If it's just a token string, we still need session ID
    if (decodedText && decodedText.length === 16) {
      setQrToken(decodedText)
      setShowManualEntry(true)
      toast.info('Token scanned. Please enter the Session ID displayed on screen.')
    } else {
      toast.error('Invalid QR code format')
    }
  }

  // Submit attendance (used by both scanner and manual entry)
  async function submitAttendance(sid, token) {
    if (!sid || !token) {
      toast.error('Session ID and token are required')
      return
    }

    setMarkingAttendance(true)
    try {
      const payload = {
        session_id: sid.trim(),
        qr_token: token.trim(),
        ...(location.latitude && { latitude: location.latitude, longitude: location.longitude })
      }
      const result = await api.markQRAttendance(payload)
      toast.success(`Attendance marked as ${result.status || 'present'}!`)
      setQrToken('')
      setSessionId('')
      setShowManualEntry(false)
      loadAttendanceHistory()
    } catch (err) {
      // Extract field-level errors from DRF response (err.data holds the raw response body)
      let msg = 'Failed to mark attendance'
      if (err.data && typeof err.data === 'object') {
        const fieldMsgs = Object.values(err.data)
          .map(v => (Array.isArray(v) ? v.join(' ') : String(v)))
          .filter(Boolean)
        if (fieldMsgs.length) msg = fieldMsgs.join('. ')
      } else if (err.message) {
        msg = err.message
      }
      toast.error(msg)
    } finally {
      setMarkingAttendance(false)
    }
  }

  // Mark attendance with manual entry
  async function handleMarkAttendance() {
    submitAttendance(sessionId, qrToken)
  }

  // Cleanup scanner on unmount / page navigation
  useEffect(() => {
    return () => {
      const scanner = html5QrCodeRef.current
      html5QrCodeRef.current = null
      if (scanner) {
        safeStopScanner(scanner)
      }
    }
  }, [])

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
          {/* QR Scanner View */}
          {showScanner ? (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Scan QR Code</h2>
                <button
                  onClick={stopScanner}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Point your camera at the QR code displayed by your instructor
              </p>

              {/* Scanner container */}
              <div className="relative">
                <div
                  id="qr-reader"
                  ref={scannerRef}
                  className="w-full max-w-md mx-auto rounded-lg overflow-hidden"
                />
                {scannerError && (
                  <div className="mt-4 p-4 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertCircle className="w-5 h-5" />
                      <span className="text-sm">{scannerError}</span>
                    </div>
                    <button
                      onClick={() => { stopScanner(); setShowManualEntry(true) }}
                      className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      Use manual entry instead
                    </button>
                  </div>
                )}
              </div>

              {/* Location capture while scanning */}
              <div className="mt-4 bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-700">Location</span>
                  </div>
                  {location.latitude ? (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Ready
                    </span>
                  ) : (
                    <button
                      onClick={getLocation}
                      disabled={locationLoading}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 disabled:opacity-50"
                    >
                      {locationLoading ? 'Getting...' : 'Capture'}
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => { stopScanner(); setShowManualEntry(true) }}
                className="mt-4 w-full py-2 text-gray-600 hover:text-gray-900 text-sm flex items-center justify-center gap-2"
              >
                <Keyboard className="w-4 h-4" />
                Enter code manually instead
              </button>
            </div>
          ) : showManualEntry ? (
            /* Manual Entry Form */
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Manual Entry</h2>
                <button
                  onClick={() => { setShowManualEntry(false); setSessionId(''); setQrToken('') }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                Enter the session details shown on the instructor's screen
              </p>

              <div className="space-y-4">
                {/* Session ID Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session ID</label>
                  <input
                    type="text"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="Enter the Session ID"
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                  />
                </div>

                {/* QR Token Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
                  <input
                    type="text"
                    value={qrToken}
                    onChange={(e) => setQrToken(e.target.value)}
                    placeholder="Enter the 16-character token"
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-center font-mono text-lg tracking-wider"
                    maxLength={16}
                  />
                </div>

                {/* Location */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-gray-600" />
                      <div>
                        <span className="text-sm font-medium text-gray-800">Location</span>
                        <p className="text-xs text-gray-500">May be required</p>
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

                <button
                  onClick={() => { setShowManualEntry(false); startScanner() }}
                  className="w-full py-2 text-gray-600 hover:text-gray-900 text-sm flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Use camera to scan instead
                </button>
              </div>
            </div>
          ) : (
            /* Default: Choose method */
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Mark Your Attendance</h2>
              <p className="text-sm text-gray-600 mb-6">
                Scan the QR code displayed by your instructor to mark your attendance
              </p>

              {/* Primary: Scan QR Code Button */}
              <button
                onClick={startScanner}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-3"
              >
                <Camera className="w-6 h-6" />
                <span className="text-lg">Scan QR Code</span>
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Secondary: Manual Entry */}
              <button
                onClick={() => setShowManualEntry(true)}
                className="w-full py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2"
              >
                <Keyboard className="w-5 h-5" />
                Enter Code Manually
              </button>

              {/* Location pre-capture */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-gray-600" />
                    <div>
                      <span className="text-sm font-medium text-gray-800">Capture Location First</span>
                      <p className="text-xs text-gray-500">Some sessions require location verification</p>
                    </div>
                  </div>
                  {location.latitude ? (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Ready
                    </span>
                  ) : (
                    <button
                      onClick={getLocation}
                      disabled={locationLoading}
                      className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
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

              {/* Instructions */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Your instructor will display a QR code on screen</li>
                  <li>Tap "Scan QR Code" and point your camera at it</li>
                  <li>Your attendance is marked automatically</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-700">Excused</div>
              <div className="text-2xl font-bold text-blue-600">
                {attendanceHistory.filter(r => r.status === 'excused').length}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Filter Your Records</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Use the filters below to find specific attendance records. Select a date range or filter by status.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={historyFilter.status}
                  onChange={(e) => setHistoryFilter(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 hover:border-indigo-300 transition-colors"
                >
                  <option value="">All Status</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </div>

              {/* Start Date */}
              <ModernDatePicker
                label="From Date"
                value={historyFilter.startDate}
                onChange={(value) => setHistoryFilter(f => ({ ...f, startDate: value }))}
                placeholder="Select start date"
                maxDate={new Date().toISOString().split('T')[0]}
              />

              {/* End Date */}
              <ModernDatePicker
                label="To Date"
                value={historyFilter.endDate}
                onChange={(value) => setHistoryFilter(f => ({ ...f, endDate: value }))}
                placeholder="Select end date"
                maxDate={new Date().toISOString().split('T')[0]}
              />

              {/* Action Buttons */}
              <div className="flex flex-col justify-end gap-2">
                <button
                  onClick={loadAttendanceHistory}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Apply Filters
                </button>
                {(historyFilter.status || historyFilter.startDate || historyFilter.endDate) && (
                  <button
                    onClick={() => setHistoryFilter({ status: '', startDate: '', endDate: '' })}
                    className="w-full px-4 py-2 text-gray-600 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Clear Filters
                  </button>
                )}
              </div>
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
