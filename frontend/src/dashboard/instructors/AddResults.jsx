import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import api, { createResultEditRequest } from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'

export default function AddResults() {
  const { user } = useAuth()
  const toast = useToast()

  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState('')
  const [examInfo, setExamInfo] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [savedSnapshot, setSavedSnapshot] = useState([])
  const [showRemarksModal, setShowRemarksModal] = useState(false)
  const [remarksInput, setRemarksInput] = useState('')

  // Edit request state for locked results
  const [editRequestModal, setEditRequestModal] = useState(false)
  const [editRequestRow, setEditRequestRow] = useState(null)
  const [editRequestForm, setEditRequestForm] = useState({ reason: '', proposed_marks: '', proposed_remarks: '' })
  const [editRequestErrors, setEditRequestErrors] = useState({})
  const [editRequestSaving, setEditRequestSaving] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Helper to normalize numbers for input display: remove trailing .0 for integers
  function normalizeNumberForInput(v) {
    if (v === '' || v == null) return ''
    const n = parseFloat(v)
    if (!Number.isFinite(n)) return String(v)
    return Number.isInteger(n) ? String(n) : String(n)
  }

  // Format percentage nicely: integers show without decimal (90%), otherwise one decimal (85.5%)
  function formatPercentage(v) {
    if (v === '' || v == null) return '-'
    const n = Number(v)
    if (!Number.isFinite(n)) return '-'
    const rounded = Math.round(n * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await api.getMyExams?.() ?? api.getExams()
        const arr = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : (res && res.results) ? res.results : [])
        if (!mounted) return
        setExams(arr)
      } catch (err) {
        toast.error(err?.message || 'Failed to load exams')
      }
    }
    if (user) load()
    return () => { mounted = false }
  }, [user, toast])

  // auto-select exam from query param (e.g. /list/results?exam=5)
  const location = useLocation()
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('exam')
    if (q) setSelectedExam(String(q))
  }, [location.search])

  async function loadResults(examId, { skipSpinner = false } = {}) {
    if (!examId) return
    if (!skipSpinner) setLoading(true)
    try {
      const resp = await api.getExamResults(examId)
      // resp contains { exam, count, submitted, pending, results }
      setExamInfo(resp.exam || null)
      // save stats returned by backend
      setExamStats({
        count: resp.count || 0,
        submitted: resp.submitted || 0,
        pending: resp.pending || 0
      })
      const list = Array.isArray(resp.results) ? resp.results : (resp && resp.results) ? resp.results : []
      // ensure each row has editable fields and UX helpers (dirty/errors)
      const mapped = list.map(r => ({
        id: r.id,
        student_id: r.student || r.student_id || (r.student && r.student.id),
        student_name: r.student_name || (r.student && `${r.student.first_name || ''} ${r.student.last_name || ''}`.trim()),
        svc_number: r.student_svc_number || (r.student && r.student.svc_number) || '',
  marks_obtained: r.marks_obtained == null ? '' : normalizeNumberForInput(r.marks_obtained),
        remarks: r.remarks || '',
        percentage: r.percentage,
        grade: r.grade,
        is_locked: !!r.is_locked,
        dirty: false,
        errors: {}
      }))
      setResults(mapped)
      setSavedSnapshot(JSON.parse(JSON.stringify(mapped)))
    } catch (err) {
      toast.error(err?.message || 'Failed to load results')
    } finally {
      if (!skipSpinner) setLoading(false)
    }
  }

  // load results whenever selectedExam changes
  useEffect(() => {
    let mounted = true

    async function generateAndLoad(id) {
      if (!id) return
      setLoading(true)
      try {
        await api.generateExamResults(id)
      } catch (err) {
        toast.error(err?.message || 'Failed to create result entries')
      }
      try {
        if (mounted) await loadResults(id, { skipSpinner: true })
      } finally {
        if (mounted) setLoading(false)
      }
    }

    if (selectedExam) {
      generateAndLoad(selectedExam)
    } else {
      setExamInfo(null)
      setResults([])
    }

    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExam])

  function handleConfirmApplyRemarks() {
    applyRemarksToAll(remarksInput)
    setShowRemarksModal(false)
    toast.success('Remarks applied to all students')
  }

  function updateRow(idx, key, value) {
    // mark the row dirty and run inline validation for marks
    setResults(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [key]: value, dirty: true }
      const errors = { ...r.errors }

      if (key === 'marks_obtained') {
        if (value === '') {
          errors.marks_obtained = 'Required'
        } else {
          const num = Number(value)
          const max = examInfo?.total_marks != null ? Number(examInfo.total_marks) : null
          if (isNaN(num)) errors.marks_obtained = 'Must be a number'
          else if (num < 0) errors.marks_obtained = 'Cannot be negative'
          else if (max != null && num > max) errors.marks_obtained = `Cannot exceed ${max}`
          else delete errors.marks_obtained
        }
      }

      updated.errors = errors
      return updated
    }))
  }

  async function handleSave() {
    if (!selectedExam) return toast.error('Select exam')

    // Determine which rows have changed: either marked dirty, or differ from saved snapshot
    const snapshotById = Object.fromEntries(savedSnapshot.map(s => [s.id, s]))
    const changedRows = results.filter(r => {
      if (r.dirty) return true
      const snap = snapshotById[r.id]
      if (!snap) return true
      // compare marks and remarks as the editable fields
      return String(r.marks_obtained) !== String(snap.marks_obtained) || String(r.remarks || '') !== String(snap.remarks || '')
    })

    if (changedRows.length === 0) return toast.error('No changes to save')

    // Validate only changed rows
    const max = examInfo?.total_marks != null ? Number(examInfo.total_marks) : null
    const validationErrors = []
    const validated = results.map(r => {
      if (!changedRows.find(cr => cr.id === r.id)) return r
      const errors = {}
      if (r.marks_obtained === '' || r.marks_obtained == null) {
        errors.marks_obtained = 'Required'
      } else {
        const n = Number(r.marks_obtained)
        if (!Number.isFinite(n) || n < 0) errors.marks_obtained = 'Invalid number'
        else if (max != null && n > max) errors.marks_obtained = `Cannot exceed ${max}`
      }
      if (Object.keys(errors).length > 0) {
        validationErrors.push(r.id)
      }
      return { ...r, errors }
    })

    // if any validation errors on changed rows, update state and stop
    if (validationErrors.length > 0) {
      setResults(validated)
      return toast.error('Fix validation errors before saving')
    }

    // build payload only for changed rows
    const payload = { results: changedRows.map(r => ({ id: r.id, student_id: r.student_id, marks_obtained: Number(r.marks_obtained), remarks: r.remarks })) }
    setSaving(true)
    try {
      const res = await api.bulkGradeResults(payload)

      // backend returns { status, updated, errors }
      if (res.errors && Array.isArray(res.errors) && res.errors.length > 0) {
        // attempt to attach errors to the changed rows by extracting ids from messages
        const errMap = {}
        res.errors.forEach(msg => {
          const m = msg && String(msg).match(/(\d+)/)
          if (m) errMap[Number(m[1])] = msg
        })
        setResults(prev => prev.map(r => {
          if (!changedRows.find(cr => cr.id === r.id)) return r
          return {
            ...r,
            errors: {
              ...r.errors,
              save: errMap[r.id] || r.errors?.save
            }
          }
        }))
        toast.error(`${res.errors.length} error(s) occurred while saving`) 
      }

      if (res.updated && res.updated > 0) {
        toast.success(`${res.updated} result(s) saved`)
        // reload to fetch computed fields (percentage/grade)
        await loadResults(selectedExam)
      }

    } catch (err) {
      toast.error(err?.message || (err && err.data) ? JSON.stringify(err.data) : 'Failed to save results')
    } finally { setSaving(false) }
  }

  // Bulk actions
  function applyRemarksToAll(value) {
    setResults(prev => prev.map(r => ({ ...r, remarks: value, dirty: true })))
  }

  // Undo functionality
  function handleUndo() {
    setResults(JSON.parse(JSON.stringify(savedSnapshot)))
    toast.success('Changes reverted')
  }

  // Open edit request modal for a locked row
  function openEditRequest(row) {
    setEditRequestRow(row)
    setEditRequestForm({ reason: '', proposed_marks: '', proposed_remarks: '' })
    setEditRequestErrors({})
    setEditRequestModal(true)
  }

  async function handleSubmitEditRequest(e) {
    e.preventDefault()
    const errs = {}
    if (!editRequestForm.reason.trim()) errs.reason = 'Reason is required'
    if (editRequestForm.proposed_marks !== '' && editRequestForm.proposed_marks != null) {
      const n = Number(editRequestForm.proposed_marks)
      const max = examInfo?.total_marks != null ? Number(examInfo.total_marks) : null
      if (!Number.isFinite(n) || n < 0) errs.proposed_marks = 'Invalid number'
      else if (max != null && n > max) errs.proposed_marks = `Cannot exceed ${max}`
    }
    if (Object.keys(errs).length) { setEditRequestErrors(errs); return }

    setEditRequestSaving(true)
    try {
      const payload = {
        exam_result: editRequestRow.id,
        reason: editRequestForm.reason.trim(),
      }
      if (editRequestForm.proposed_marks !== '' && editRequestForm.proposed_marks != null) {
        payload.proposed_marks = Number(editRequestForm.proposed_marks)
      }
      if (editRequestForm.proposed_remarks.trim()) {
        payload.proposed_remarks = editRequestForm.proposed_remarks.trim()
      }
      await createResultEditRequest(payload)
      toast.success('Edit request submitted — awaiting HOD approval')
      setEditRequestModal(false)
      setEditRequestRow(null)
    } catch (err) {
      if (err?.data && typeof err.data === 'object') {
        const d = err.data
        const fieldErrors = {}
        Object.keys(d).forEach((k) => {
          if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' ')
          else if (typeof d[k] === 'string') fieldErrors[k] = d[k]
        })
        if (fieldErrors.non_field_errors) { toast.error(fieldErrors.non_field_errors); return }
        if (fieldErrors.detail) { toast.error(fieldErrors.detail); return }
        if (Object.keys(fieldErrors).length) { setEditRequestErrors(fieldErrors); return }
      }
      toast.error(err?.message || 'Failed to submit edit request')
    } finally {
      setEditRequestSaving(false)
    }
  }

  // Sorting
  function handleSort(key) {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    setSortConfig({ key, direction })
  }

  // Filter and sort results
  const filteredAndSortedResults = React.useMemo(() => {
    let filtered = results.filter(r => {
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        (r.student_name || '').toLowerCase().includes(term) ||
        (r.svc_number || '').toLowerCase().includes(term)
      )
    })

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

        if (sortConfig.key === 'marks_obtained') {
          aVal = Number(aVal) || 0
          bVal = Number(bVal) || 0
        } else if (sortConfig.key === 'percentage') {
          aVal = Number(aVal) || 0
          bVal = Number(bVal) || 0
        } else {
          aVal = String(aVal || '').toLowerCase()
          bVal = String(bVal || '').toLowerCase()
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return filtered
  }, [results, searchTerm, sortConfig])

  // Paginated results
  const paginatedResults = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredAndSortedResults.slice(startIndex, endIndex)
  }, [filteredAndSortedResults, currentPage, itemsPerPage])

  // Total pages calculation
  const totalPages = Math.ceil(filteredAndSortedResults.length / itemsPerPage)

  // Reset to page 1 when search term or sort changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortConfig])

  // Keyboard navigation
  function handleKeyDown(e, idx, field) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (field === 'marks_obtained') {
        const nextInput = document.querySelector(`input[data-idx="${idx}"][data-field="remarks"]`)
        if (nextInput) nextInput.focus()
      } else if (field === 'remarks') {
        if (idx < results.length - 1) {
          const nextInput = document.querySelector(`input[data-idx="${idx + 1}"][data-field="marks_obtained"]`)
          if (nextInput) nextInput.focus()
        } else {
          // Last row, save
          handleSave()
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < results.length - 1) {
        const nextInput = document.querySelector(`input[data-idx="${idx + 1}"][data-field="${field}"]`)
        if (nextInput) nextInput.focus()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) {
        const prevInput = document.querySelector(`input[data-idx="${idx - 1}"][data-field="${field}"]`)
        if (prevInput) prevInput.focus()
      }
    }
  }

  // exam stats from server
  const [examStats, setExamStats] = useState({ count: 0, submitted: 0, pending: 0 })

  const hasChanges = results.some(r => r.dirty)

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  return (
    <div className="p-3 sm:p-4 md:p-6 text-black w-full">
      <header className="mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold mb-2">Grade Results</h2>
        <p className="text-xs sm:text-sm md:text-base text-gray-600">Select an exam and enter marks for your students. <span className="hidden sm:inline">Use Tab/Enter to navigate, arrow keys to move between rows.</span></p>
      </header>

      {/* Exam Selection */}
      <div className="mb-4 sm:mb-6 bg-white rounded-lg shadow p-3 sm:p-4">
        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Select Exam</label>
        <div className="flex gap-3 items-center flex-wrap">
          <select
            value={selectedExam}
            onChange={e => {
              setSelectedExam(e.target.value);
              setExamInfo(null);
              setResults([]);
              setSearchTerm('');
              setSortConfig({ key: null, direction: 'asc' });
            }}
            className="flex-1 min-w-full sm:min-w-[250px] p-2 sm:p-2.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">-- Select an exam --</option>
            {exams.map(ex => (
              <option key={ex.id} value={ex.id}>
                {ex.title} — {ex.subject_name || ex.subject?.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      )}

      {/* Empty State - No Exam Selected */}
      {!loading && !selectedExam && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 sm:p-6 text-center">
          <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-base sm:text-lg font-medium text-gray-900">No exam selected</h3>
          <p className="mt-1 text-xs sm:text-sm text-gray-600">Please select an exam from the dropdown above to begin grading.</p>
        </div>
      )}

      {/* Empty State - No Results */}
      {!loading && results.length === 0 && examInfo && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 sm:p-6">
          <div className="flex items-start gap-2 sm:gap-3">
            <svg className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-base sm:text-lg font-medium text-gray-900">No result entries found</h3>
              <p className="mt-1 text-xs sm:text-sm text-gray-700">
                {examStats.count === 0
                  ? 'No students are enrolled in this course. Please ensure students are added to the course before creating result entries.'
                  : 'Result entries have not been generated yet. Click "Create Result Entries for All Students" above to generate rows for all enrolled students.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg">
          {/* Exam Info Cards */}
          <div className="p-3 sm:p-4 border-b bg-gradient-to-r from-indigo-50 to-blue-50">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                <div className="text-[10px] sm:text-xs font-medium text-gray-600 uppercase">Exam</div>
                <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 truncate" title={examInfo?.title || '—'}>{examInfo?.title || '—'}</div>
              </div>
              <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                <div className="text-[10px] sm:text-xs font-medium text-gray-600 uppercase">Total Marks</div>
                <div className="text-sm sm:text-base md:text-lg font-semibold text-indigo-600">{examInfo?.total_marks ?? '—'}</div>
              </div>
              <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                <div className="text-[10px] sm:text-xs font-medium text-gray-600 uppercase">Students</div>
                <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">{examStats.count}</div>
              </div>
              <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                <div className="text-[10px] sm:text-xs font-medium text-gray-600 uppercase">Progress</div>
                <div className="text-sm sm:text-base md:text-lg font-semibold">
                  <span className="text-green-600">{examStats.submitted}</span>
                  <span className="text-gray-400 mx-1">/</span>
                  <span className="text-orange-600">{examStats.pending}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Bulk Actions */}
          <div className="p-3 sm:p-4 border-b bg-gray-50">
            <div className="flex flex-col gap-3">
              {/* Search and Per Page selector */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search by student name or service number..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">Per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={e => {
                      setItemsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Bulk Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setRemarksInput('')
                    setShowRemarksModal(true)
                  }}
                  className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
                >
                  Apply Remarks
                </button>
                <button
                  onClick={handleUndo}
                  disabled={!hasChanges}
                  className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Undo
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden p-3 space-y-3">
            {paginatedResults.map((r) => {
              const actualIdx = results.findIndex(row => row.id === r.id);
              return (
                <div key={r.id} className={`bg-white rounded-xl border-2 p-4 shadow-sm ${r.is_locked ? 'border-orange-300 bg-orange-50/30' : r.dirty ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}>
                  {/* Student Info Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.is_locked && <svg className="h-4 w-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                        <div className="font-semibold text-gray-900 text-base truncate">{r.student_name || '-'}</div>
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">SVC: {r.svc_number || '-'}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2.5 py-1 text-sm font-bold rounded-lg ${
                        r.grade === 'A' || r.grade === 'A-' ? 'bg-green-100 text-green-800' :
                        r.grade === 'B+' || r.grade === 'B' || r.grade === 'B-' ? 'bg-blue-100 text-blue-800' :
                        r.grade === 'C+' || r.grade === 'C' || r.grade === 'C-' ? 'bg-yellow-100 text-yellow-800' :
                        r.grade === 'F' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {r.grade || '-'}
                      </span>
                      <span className={`text-sm font-semibold ${
                        Number(r.percentage) >= 76 ? 'text-green-600' :
                        Number(r.percentage) >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {formatPercentage(r.percentage)}
                      </span>
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Marks <span className="text-gray-400">(out of {examInfo?.total_marks || '?'})</span>
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={examInfo?.total_marks || undefined}
                        step="any"
                        value={r.marks_obtained}
                        onChange={e => updateRow(actualIdx, 'marks_obtained', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, actualIdx, 'marks_obtained')}
                        data-idx={actualIdx}
                        data-field="marks_obtained"
                        placeholder="Enter marks"
                        disabled={r.is_locked}
                        className={`w-full px-4 py-3 text-base rounded-lg border-2 ${
                          r.is_locked
                            ? 'border-orange-300 bg-orange-50 text-orange-700 cursor-not-allowed'
                            : r.errors?.marks_obtained
                            ? 'border-red-500 focus:ring-red-500 bg-red-50'
                            : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                        } focus:ring-2 focus:outline-none transition`}
                      />
                      {r.errors?.marks_obtained && (
                        <div className="text-sm text-red-600 mt-1.5 font-medium">{r.errors.marks_obtained}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Remarks</label>
                      <input
                        type="text"
                        value={r.remarks}
                        onChange={e => updateRow(actualIdx, 'remarks', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, actualIdx, 'remarks')}
                        data-idx={actualIdx}
                        data-field="remarks"
                        placeholder="Optional remarks"
                        disabled={r.is_locked}
                        className={`w-full px-4 py-3 text-base rounded-lg border-2 ${r.is_locked ? 'border-orange-300 bg-orange-50 cursor-not-allowed' : 'border-gray-300'} focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition`}
                      />
                    </div>
                    {r.is_locked && (
                      <button
                        type="button"
                        onClick={() => openEditRequest(r)}
                        className="w-full px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
                      >
                        Request Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th
                      onClick={() => handleSort('svc_number')}
                      className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition"
                    >
                      <div className="flex items-center gap-1">
                        Svc No
                        {sortConfig.key === 'svc_number' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('student_name')}
                      className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition"
                    >
                      <div className="flex items-center gap-1">
                        Student Name
                        {sortConfig.key === 'student_name' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('marks_obtained')}
                      className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition"
                    >
                      <div className="flex items-center gap-1">
                        Marks (/{examInfo?.total_marks || '?'})
                        {sortConfig.key === 'marks_obtained' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('percentage')}
                      className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition"
                    >
                      <div className="flex items-center gap-1">
                        Percentage
                        {sortConfig.key === 'percentage' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('grade')}
                      className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition"
                    >
                      <div className="flex items-center gap-1">
                        Grade
                        {sortConfig.key === 'grade' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Remarks
                    </th>
                    <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-20">
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedResults.map((r) => {
                    const actualIdx = results.findIndex(row => row.id === r.id);
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 transition ${r.is_locked ? 'bg-orange-50/40' : r.dirty ? 'bg-yellow-50' : ''}`}>
                        <td className="px-3 lg:px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-1">
                            {r.is_locked && <svg className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                            {r.svc_number || '-'}
                          </div>
                        </td>
                        <td className="px-3 lg:px-4 py-3 text-sm text-gray-900">
                          {r.student_name || '-'}
                        </td>
                        <td className="px-3 lg:px-4 py-3">
                          <div>
                            <input
                              type="number"
                              min="0"
                              max={examInfo?.total_marks || undefined}
                              step="any"
                              value={r.marks_obtained}
                              onChange={e => updateRow(actualIdx, 'marks_obtained', e.target.value)}
                              onKeyDown={e => handleKeyDown(e, actualIdx, 'marks_obtained')}
                              data-idx={actualIdx}
                              data-field="marks_obtained"
                              placeholder="Marks"
                              disabled={r.is_locked}
                              className={`w-full px-2 py-1.5 text-sm rounded-md border ${
                                r.is_locked
                                  ? 'border-orange-300 bg-orange-50 text-orange-700 cursor-not-allowed'
                                  : r.errors?.marks_obtained
                                  ? 'border-red-500 focus:ring-red-500'
                                  : 'border-gray-300 focus:ring-indigo-500'
                              } focus:ring-2 focus:border-transparent`}
                            />
                            {r.errors?.marks_obtained && (
                              <div className="text-xs text-red-600 mt-1">{r.errors.marks_obtained}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 lg:px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            Number(r.percentage) >= 76 ? 'text-green-600' :
                            Number(r.percentage) >= 50 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {formatPercentage(r.percentage)}
                          </span>
                        </td>
                        <td className="px-3 lg:px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            r.grade === 'A' || r.grade === 'A-' ? 'bg-green-100 text-green-800' :
                            r.grade === 'B+' || r.grade === 'B' || r.grade === 'B-' ? 'bg-blue-100 text-blue-800' :
                            r.grade === 'C+' || r.grade === 'C' || r.grade === 'C-' ? 'bg-yellow-100 text-yellow-800' :
                            r.grade === 'F' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {r.grade || '-'}
                          </span>
                        </td>
                        <td className="px-3 lg:px-4 py-3">
                          <input
                            type="text"
                            value={r.remarks}
                            onChange={e => updateRow(actualIdx, 'remarks', e.target.value)}
                            onKeyDown={e => handleKeyDown(e, actualIdx, 'remarks')}
                            data-idx={actualIdx}
                            data-field="remarks"
                            placeholder="Remarks"
                            disabled={r.is_locked}
                            className={`w-full px-2 py-1.5 text-sm rounded-md border ${r.is_locked ? 'border-orange-300 bg-orange-50 cursor-not-allowed' : 'border-gray-300'} focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                          />
                        </td>
                        <td className="px-3 lg:px-4 py-3">
                          {r.is_locked && (
                            <button
                              type="button"
                              onClick={() => openEditRequest(r)}
                              className="px-2 py-1 rounded-md bg-orange-600 text-white text-xs hover:bg-orange-700 transition whitespace-nowrap"
                            >
                              Request Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 sm:p-4 border-t bg-white">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Results info */}
                <div className="text-xs sm:text-sm text-gray-600">
                  Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSortedResults.length)}</span> of{' '}
                  <span className="font-medium">{filteredAndSortedResults.length}</span> results
                </div>

                {/* Pagination buttons */}
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    title="First page"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    title="Previous page"
                  >
                    ‹
                  </button>

                  {/* Page numbers */}
                  <div className="flex items-center gap-1">
                    {(() => {
                      const pageNumbers = []
                      const maxButtons = 5
                      let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2))
                      let endPage = Math.min(totalPages, startPage + maxButtons - 1)

                      if (endPage - startPage + 1 < maxButtons) {
                        startPage = Math.max(1, endPage - maxButtons + 1)
                      }

                      for (let i = startPage; i <= endPage; i++) {
                        pageNumbers.push(
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i)}
                            className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition ${
                              currentPage === i
                                ? 'bg-indigo-600 text-white font-medium'
                                : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {i}
                          </button>
                        )
                      }
                      return pageNumbers
                    })()}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    title="Next page"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    title="Last page"
                  >
                    »
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer with Save Button */}
          <div className="p-3 sm:p-4 border-t bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                {hasChanges && (
                  <div className="flex items-center gap-2 text-yellow-700 bg-yellow-100 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm">
                    <svg className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">Unsaved changes</span>
                  </div>
                )}
                <div className="text-xs sm:text-sm text-gray-600">
                  {filteredAndSortedResults.length < results.length ? (
                    <>Filtered: {filteredAndSortedResults.length} of {results.length} students</>
                  ) : (
                    <>Total: {results.length} students</>
                  )}
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-indigo-600 text-white text-sm sm:text-base font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md hover:shadow-lg"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save All Grades'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Apply Remarks to All */}
      {showRemarksModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Apply remarks to all students</h3>
                <p className="text-gray-700 mb-4">Enter the remarks text to apply to all result rows for this exam.</p>
                <div className="mb-3">
                  <input
                    type="text"
                    value={remarksInput}
                    onChange={e => setRemarksInput(e.target.value)}
                    placeholder="Remarks (optional)"
                    className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowRemarksModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={handleConfirmApplyRemarks} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Request Edit for Locked Result */}
      {editRequestModal && editRequestRow && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-4 sm:p-6 ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h4 className="text-lg text-black font-medium">Request Result Edit</h4>
                <p className="text-sm text-neutral-500">
                  {editRequestRow.student_name} — Current marks: {editRequestRow.marks_obtained}/{examInfo?.total_marks || '?'}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEditRequestModal(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-800">
              This result is locked after grading. Submit an edit request for HOD approval.
            </div>
            <form onSubmit={handleSubmitEditRequest}>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Reason for Edit *</label>
                  <textarea
                    value={editRequestForm.reason}
                    onChange={(e) => setEditRequestForm({ ...editRequestForm, reason: e.target.value.slice(0, 500) })}
                    placeholder="Explain why this result needs to be edited..."
                    rows={3}
                    maxLength={500}
                    className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editRequestErrors.reason ? 'border-rose-500' : 'border-neutral-200'}`}
                  />
                  {editRequestErrors.reason && <div className="text-xs text-rose-600 mt-1">{editRequestErrors.reason}</div>}
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Proposed Marks (optional)</label>
                  <input
                    type="number"
                    min="0"
                    max={examInfo?.total_marks || undefined}
                    step="any"
                    value={editRequestForm.proposed_marks}
                    onChange={(e) => setEditRequestForm({ ...editRequestForm, proposed_marks: e.target.value })}
                    placeholder={`New marks (max ${examInfo?.total_marks || '?'})`}
                    className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editRequestErrors.proposed_marks ? 'border-rose-500' : 'border-neutral-200'}`}
                  />
                  {editRequestErrors.proposed_marks && <div className="text-xs text-rose-600 mt-1">{editRequestErrors.proposed_marks}</div>}
                </div>
                <div>
                  <label className="text-sm text-neutral-600 mb-1 block">Proposed Remarks (optional)</label>
                  <input
                    type="text"
                    value={editRequestForm.proposed_remarks}
                    onChange={(e) => setEditRequestForm({ ...editRequestForm, proposed_remarks: e.target.value.slice(0, 300) })}
                    placeholder="New remarks"
                    maxLength={300}
                    className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setEditRequestModal(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={editRequestSaving} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {editRequestSaving ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
