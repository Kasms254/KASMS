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
      const list = Array.isArray(resp.results) ? resp.results : (resp && resp.results) ? resp.results : []
      // ensure each row has editable fields
      const mapped = list.map(r => ({
        id: r.id,
        student_id: r.student || r.student_id || (r.student && r.student.id),
        student_name: r.student_name || (r.student && `${r.student.first_name || ''} ${r.student.last_name || ''}`.trim()),
        svc_number: r.student_svc_number || (r.student && r.student.svc_number) || '',
        marks_obtained: r.marks_obtained == null ? '' : r.marks_obtained,
        remarks: r.remarks || ''
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
      await loadResults(selectedExam)
    } catch (err) {
      toast.error(err?.message || 'Failed to generate result entries')
    } finally { setLoading(false) }
  }

  function updateRow(idx, key, value) {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  async function handleSave() {
    if (!selectedExam) return toast.error('Select exam')

    // client-side validation: marks must be numeric and within 0..total_marks
    const max = examInfo?.total_marks != null ? Number(examInfo.total_marks) : null
    for (const r of results) {
      if (r.marks_obtained === '' || r.marks_obtained === null) {
        return toast.error(`Provide marks for ${r.student_name || r.svc_number || r.student_id}`)
      }
      const n = Number(r.marks_obtained)
      if (!Number.isFinite(n) || n < 0) return toast.error(`Invalid marks for ${r.student_name || r.svc_number || r.student_id}`)
      if (max != null && n > max) return toast.error(`Marks for ${r.student_name || r.svc_number || r.student_id} cannot exceed ${max}`)
    }

    // build payload expected by backend: { results: [{ id, student_id, marks_obtained, remarks }, ...] }
    const payload = { results: results.map(r => ({ id: r.id, student_id: r.student_id, marks_obtained: Number(r.marks_obtained), remarks: r.remarks })) }
    setSaving(true)
    try {
      const res = await api.bulkGradeResults(payload)
      toast.success(`${res.updated || 0} result(s) saved`)
      await loadResults(selectedExam)
    } catch (err) {
      toast.error(err?.message || (err && err.data) ? JSON.stringify(err.data) : 'Failed to save results')
    } finally { setSaving(false) }
  }

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
        <button onClick={() => loadResults(selectedExam)} disabled={!selectedExam || loading} className="px-3 py-2 rounded bg-indigo-600 text-white">Load results</button>
        <button onClick={handleGenerate} disabled={!selectedExam || loading} className="px-3 py-2 rounded bg-green-600 text-white">Generate entries</button>
      </div>

      {loading && <div className="text-sm text-neutral-600">Loading…</div>}

      {!loading && results.length === 0 && examInfo && <div className="p-4 bg-white rounded border text-sm text-neutral-600">No result entries yet. Click "Generate entries" to create rows for students.</div>}

      {results.length > 0 && (
        <div className="bg-white rounded shadow p-4 overflow-auto">
          <div className="mb-3 font-medium">Exam: {examInfo?.title || '—'} • Total marks: {examInfo?.total_marks ?? '—'}</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600">
                <th className="px-2 py-2">Svc No</th>
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Marks</th>
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
                          </td>
                          <td className="px-2 py-2 w-64 min-w-0"><input value={r.remarks} onChange={e => updateRow(idx, 'remarks', e.target.value)} className="p-1 rounded border w-full" /></td>
                        </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-3">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded">{saving ? 'Saving...' : 'Save grades'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
