import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import useToast from '../../hooks/useToast'
import { getBiometricRecords, processPendingBiometrics } from '../../lib/api'

function sanitizeInput(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
}

function processedBadge(processed, errorMessage) {
  if (processed) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Processed</span>
  if (errorMessage) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Error</span>
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pending</span>
}

const DEVICE_TYPE_OPTIONS = ['zkteco', 'fingerprint', 'other']

export default function BiometricRecords() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session') || ''
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

  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 20
  const [search, setSearch] = useState('')
  const [filterProcessed, setFilterProcessed] = useState('')
  const [filterDeviceType, setFilterDeviceType] = useState('')
  const [filterDeviceId, setFilterDeviceId] = useState('')
  const [processingPending, setProcessingPending] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true)
    try {
      const parts = [`page=${currentPage}`, `page_size=${pageSize}`]
      if (search.trim()) parts.push(`search=${encodeURIComponent(search.trim())}`)
      if (filterProcessed !== '') parts.push(`processed=${filterProcessed}`)
      if (filterDeviceType) parts.push(`device_type=${filterDeviceType}`)
      if (filterDeviceId.trim()) parts.push(`device_id=${encodeURIComponent(filterDeviceId.trim())}`)
      if (sessionId) parts.push(`session=${sessionId}`)
      const data = await getBiometricRecords(parts.join('&'))
      const list = Array.isArray(data) ? data : (data?.results ?? [])
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
      setRecords(list)
    } catch (err) {
      reportError(err?.message || 'Failed to load biometric records')
    } finally {
      setRecordsLoading(false)
    }
  }, [currentPage, search, filterProcessed, filterDeviceType, filterDeviceId, sessionId, reportError])

  useEffect(() => { loadRecords() }, [loadRecords])

  async function handleProcessPending() {
    setProcessingPending(true)
    try {
      const result = await processPendingBiometrics()
      reportSuccess(`Processed ${result?.processed ?? 0} records. Failed: ${result?.failed ?? 0}`)
      loadRecords()
    } catch (err) {
      reportError(err?.message || 'Failed to process pending records')
    } finally {
      setProcessingPending(false)
    }
  }

  const pendingCount = records.filter(r => !r.processed && !r.error_message).length

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {sessionId && (
            <button
              onClick={() => navigate('/list/attendance-sessions')}
              className="flex items-center gap-2 text-neutral-600 hover:text-black mb-4 transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sessions
            </button>
          )}
          <h2 className="text-lg sm:text-xl font-semibold text-black">Biometric Records</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">View fingerprint scan history and attendance processing status.</p>
        </div>
        <button
          onClick={handleProcessPending}
          disabled={processingPending}
          className="whitespace-nowrap bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {processingPending ? 'Processing...' : `Process Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search student name, biometric ID..."
          value={search}
          onChange={e => { setSearch(sanitizeInput(e.target.value)); setCurrentPage(1) }}
          className="w-56 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <select
          value={filterProcessed}
          onChange={e => { setFilterProcessed(e.target.value); setCurrentPage(1) }}
          className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All Records</option>
          <option value="false">Pending Only</option>
          <option value="true">Processed Only</option>
        </select>
        <select
          value={filterDeviceType}
          onChange={e => { setFilterDeviceType(e.target.value); setCurrentPage(1) }}
          className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All Device Types</option>
          {DEVICE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter by device ID..."
          value={filterDeviceId}
          onChange={e => { setFilterDeviceId(sanitizeInput(e.target.value)); setCurrentPage(1) }}
          className="w-44 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} records
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left bg-neutral-50">
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Student</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Biometric ID</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Device</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Scan Time</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Session</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Attendance</th>
              <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Detail</th>
            </tr>
          </thead>
          <tbody>
            {recordsLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-400">No biometric records found</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="border-t last:border-b hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium text-black">{r.student_name || '—'}</div>
                  <div className="text-xs text-neutral-400">{r.student_svc_number || ''}</div>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-neutral-600">{r.biometric_id}</td>
                <td className="px-4 py-3 text-sm text-neutral-500">
                  <div>{r.device_name || r.device_id}</div>
                  <div className="text-xs text-neutral-400">{r.device_type_display || r.device_type}</div>
                </td>
                <td className="px-4 py-3 text-xs text-neutral-500">{r.scan_time ? new Date(r.scan_time).toLocaleString() : '—'}</td>
                <td className="px-4 py-3">{processedBadge(r.processed, r.error_message)}</td>
                <td className="px-4 py-3 text-sm text-neutral-500">{r.session_title || '—'}</td>
                <td className="px-4 py-3">
                  {r.attendance_status ? (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      r.attendance_status.status === 'present' ? 'bg-green-100 text-green-700' :
                      r.attendance_status.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{r.attendance_status.status}</span>
                  ) : <span className="text-xs text-neutral-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setDetailRecord(r)} className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs hover:bg-neutral-200 transition">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {recordsLoading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : records.length === 0 ? (
          <div className="text-sm text-neutral-400">No biometric records found</div>
        ) : records.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm text-black">{r.student_name || '—'}</div>
                <div className="text-xs text-neutral-400">{r.student_svc_number || ''}</div>
                <div className="text-xs text-neutral-500 mt-1">ID: <span className="font-mono">{r.biometric_id}</span></div>
                <div className="text-xs text-neutral-400">{r.scan_time ? new Date(r.scan_time).toLocaleString() : ''}</div>
                {r.session_title && <div className="text-xs text-neutral-400 mt-0.5">{r.session_title}</div>}
              </div>
              <div className="flex flex-col items-end gap-2">
                {processedBadge(r.processed, r.error_message)}
                {r.attendance_status && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    r.attendance_status.status === 'present' ? 'bg-green-100 text-green-700' :
                    r.attendance_status.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>{r.attendance_status.status}</span>
                )}
                <button onClick={() => setDetailRecord(r)} className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs hover:bg-neutral-200 transition">View</button>
              </div>
            </div>
            {r.error_message && <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">{r.error_message}</div>}
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

      {/* Detail Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDetailRecord(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Scan Record Detail</h4>
                  <p className="text-sm text-neutral-500">{detailRecord.student_name} — {detailRecord.scan_time ? new Date(detailRecord.scan_time).toLocaleString() : ''}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setDetailRecord(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ['Student', detailRecord.student_name],
                  ['Svc Number', detailRecord.student_svc_number],
                  ['Biometric ID', detailRecord.biometric_id],
                  ['Device ID', detailRecord.device_id],
                  ['Device Name', detailRecord.device_name || '—'],
                  ['Device Type', detailRecord.device_type_display || detailRecord.device_type],
                  ['Scan Time', detailRecord.scan_time ? new Date(detailRecord.scan_time).toLocaleString() : '—'],
                  ['Processed', detailRecord.processed ? 'Yes' : 'No'],
                  ['Processed At', detailRecord.processed_at ? new Date(detailRecord.processed_at).toLocaleString() : '—'],
                  ['Session', detailRecord.session_title || '—'],
                  ['Attendance Status', detailRecord.attendance_status?.status || '—'],
                  ['Verification Type', detailRecord.verification_type || '—'],
                  ['Verification Score', detailRecord.verification_score ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3 border-b border-neutral-50 pb-2">
                    <span className="w-36 text-neutral-500 shrink-0">{label}</span>
                    <span className="text-neutral-800 font-medium">{value}</span>
                  </div>
                ))}
                {detailRecord.error_message && (
                  <div className="mt-2 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                    <span className="font-medium">Error: </span>{detailRecord.error_message}
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={() => setDetailRecord(null)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
