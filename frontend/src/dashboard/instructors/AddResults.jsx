import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../lib/api'
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

  async function loadResults(examId) {
    if (!examId) return
    setLoading(true)
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
        dirty: false,
        errors: {}
      }))
      setResults(mapped)
    } catch (err) {
      toast.error(err?.message || 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }

  // load results whenever selectedExam changes
  useEffect(() => {
    if (selectedExam) {
      loadResults(selectedExam)
    } else {
      setExamInfo(null)
      setResults([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExam])

  async function handleGenerate() {
    if (!selectedExam) return toast.error('Select an exam first')
    setLoading(true)
    try {
      await api.generateExamResults(selectedExam)
      toast.success('Result entries generated')
      // backend returns created count only; reload to fetch new rows
      await loadResults(selectedExam)
    } catch (err) {
      toast.error(err?.message || 'Failed to generate result entries')
    } finally { setLoading(false) }
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
    // Validate inline errors first
    const max = examInfo?.total_marks != null ? Number(examInfo.total_marks) : null
    const validated = results.map(r => {
      const errors = { ...r.errors }
      if (r.marks_obtained === '' || r.marks_obtained == null) {
        errors.marks_obtained = 'Required'
      } else {
        const n = Number(r.marks_obtained)
        if (!Number.isFinite(n) || n < 0) errors.marks_obtained = 'Invalid number'
        else if (max != null && n > max) errors.marks_obtained = `Cannot exceed ${max}`
        else delete errors.marks_obtained
      }
      return { ...r, errors }
    })

    // if any validation errors, update state and stop
    if (validated.some(r => r.errors && Object.keys(r.errors).length > 0)) {
      setResults(validated)
      return toast.error('Fix validation errors before saving')
    }

    // build payload
    const payload = { results: results.map(r => ({ id: r.id, student_id: r.student_id, marks_obtained: Number(r.marks_obtained), remarks: r.remarks })) }
    setSaving(true)
    try {
      const res = await api.bulkGradeResults(payload)

      // backend returns { status, updated, errors }
      if (res.errors && Array.isArray(res.errors) && res.errors.length > 0) {
        // attempt to attach errors to rows by extracting ids from messages
        const errMap = {}
        res.errors.forEach(msg => {
          const m = msg && String(msg).match(/(\d+)/)
          if (m) errMap[Number(m[1])] = msg
        })
        setResults(prev => prev.map(r => ({
          ...r,
          errors: {
            ...r.errors,
            save: errMap[r.id] || r.errors?.save
          }
        })))
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

  // exam stats from server
  const [examStats, setExamStats] = useState({ count: 0, submitted: 0, pending: 0 })

  const hasChanges = results.some(r => r.dirty)

  return (
    <div className="p-4 text-black max-w-5xl">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Grade results</h2>
          <p className="text-sm text-gray-600">Select an exam and enter marks for your students.</p>
        </div>
      </header>

      <div className="mb-4 flex gap-3 items-center">
        <select value={selectedExam} onChange={e => { setSelectedExam(e.target.value); setExamInfo(null); setResults([]); }} className="p-2 rounded border">
          <option value="">-- select exam --</option>
          {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title} — {ex.subject_name || ex.subject?.name}</option>)}
        </select>
        <button onClick={() => loadResults(selectedExam)} disabled={!selectedExam || loading} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">Load results</button>
        <button onClick={handleGenerate} disabled={!selectedExam || loading} className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition">Generate entries</button>
      </div>

      {loading && <div className="text-sm text-neutral-600">Loading…</div>}

      {!loading && results.length === 0 && examInfo && <div className="p-4 bg-white rounded border text-sm text-neutral-600">No result entries yet. Click "Generate entries" to create rows for students.</div>}

      {results.length > 0 && (
        <div className="bg-white rounded shadow p-4 overflow-auto">
          <div className="mb-3 font-medium">Exam: {examInfo?.title || '—'} • Total marks: {examInfo?.total_marks ?? '—'}</div>
          <div className="text-sm text-neutral-600 mb-3">Students: {examStats.count} • Graded: {examStats.submitted} • Pending: {examStats.pending}</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600">
                <th className="px-2 py-2">Svc No</th>
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Marks</th>
                <th className="px-2 py-2">%</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                        <tr key={r.id} className="border-t">
                          <td className="px-2 py-2 min-w-0">{r.svc_number || '-'}</td>
                          <td className="px-2 py-2 min-w-0 break-words">{r.student_name || '-'}</td>
                          <td className="px-2 py-2 w-40 min-w-0">
                            <input type="number" min="0" max={examInfo?.total_marks || undefined} value={r.marks_obtained} onChange={e => updateRow(idx, 'marks_obtained', e.target.value)} className="p-1 rounded border w-full" />
                            {r.errors?.marks_obtained && <div className="text-xs text-red-600 mt-1">{r.errors.marks_obtained}</div>}
                          </td>
                          <td className="px-2 py-2 w-24">{formatPercentage(r.percentage)}</td>
                          <td className="px-2 py-2 w-24">{r.grade || '-'}</td>
                          <td className="px-2 py-2 w-64 min-w-0"><input value={r.remarks} onChange={e => updateRow(idx, 'remarks', e.target.value)} className="p-1 rounded border w-full" /></td>
                          {r.errors?.save && <td className="text-xs text-red-600 px-2">{r.errors.save}</td>}
                        </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-3">
            <div className="flex items-center gap-3 mr-2">
              {hasChanges && <div className="text-sm text-yellow-700">You have unsaved changes</div>}
            </div>
            <button onClick={handleSave} disabled={!hasChanges || saving} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{saving ? 'Saving...' : 'Save grades'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
