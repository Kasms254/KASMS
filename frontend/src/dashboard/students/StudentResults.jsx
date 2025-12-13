import React, { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import * as api from '../../lib/api'

export default function StudentResults() {
  const { user } = useAuth()
  const toast = useToast()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load all student results once (no class selection required)
      useEffect(() => {
      let mounted = true

      async function loadStudentResults() {
        if (!user) return

        setLoading(true)
        setError(null)

        try {
          const res = await api.getMyResults()

          if (!mounted) return

          const allResults = Array.isArray(res)
            ? res
            : Array.isArray(res?.results)
              ? res.results
              : []

          setResults(allResults)
        } catch (err) {
          if (!mounted) return
          setError(err)
        } finally {
          if (mounted) setLoading(false)
        }
      }

      loadStudentResults()
      return () => { mounted = false }
    }, [user])

  // We keep results flat for the one-line display. Grouping by subject is no longer needed.

  function calculateTotals(rows) {
    const valid = (rows || []).filter(r => r.marks_obtained != null && !isNaN(Number(r.marks_obtained)))
    const obtained = valid.reduce((s, r) => s + Number(r.marks_obtained), 0)
    const totalPossible = valid.reduce((s, r) => s + (Number(r.exam_total_marks) || 0), 0)
    const pct = totalPossible > 0 ? (obtained / totalPossible) * 100 : null
    return { obtained, totalPossible, percentage: pct }
  }

  function toLetterGrade(pct) {
    if (pct == null) return '—'
    if (pct >= 90) return 'A'
    if (pct >= 80) return 'B'
    if (pct >= 70) return 'C'
    if (pct >= 60) return 'D'
    return 'F'
  }

  function formatDate(dt) {
    if (!dt) return ''
    try {
      const d = new Date(dt)
      return d.toLocaleString()
    } catch {
      return String(dt)
    }
  }

  async function downloadTranscript() {
    const rows = results || []
    if (!rows || rows.length === 0) return

    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      doc.setFontSize(14)
      const title = `Transcript${user && user.first_name ? ' — ' + (user.first_name + (user.last_name ? ' ' + user.last_name : '')) : ''}`
      doc.text(title, 40, 50)

      const body = rows.map(r => {
        const subjectName = r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || ''
        const examTitle = r.exam_title || (r.exam && r.exam.title) || ''
        const marks = r.marks_obtained != null ? String(r.marks_obtained) : ''
        const total = r.exam_total_marks || (r.exam && r.exam.total_marks) || ''
        const pct = r.percentage != null ? String(Math.round(r.percentage)) + '%' : ''
        const grade = r.grade || (r.percentage != null ? toLetterGrade(r.percentage) : '')
        return [subjectName, examTitle, marks, total, pct, grade]
      })

      // use autoTable exported function to avoid plugin attach issues
      autoTable(doc, {
        head: [['Subject', 'Exam', 'Marks Obtained', 'Total Marks', '%', 'Grade']],
        body,
        startY: 80,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 }
      })

      // overall summary below table
      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 80
      const overallText = `Total: ${overall.obtained ?? 0} / ${overall.totalPossible ?? 0} • ${overall.percentage != null ? Math.round(overall.percentage) + '%' : '—'} • Grade: ${overall.percentage != null ? toLetterGrade(overall.percentage) : '—'}`
      doc.setFontSize(11)
      doc.text(overallText, 40, finalY)

      const name = `transcript-${user && user.id ? user.id : 'me'}.pdf`
      doc.save(name)
    } catch (err) {
      console.error('PDF generation failed', err)
      if (toast && toast.error) toast.error('Failed to generate PDF transcript. Please try again later.')
      else alert('Failed to generate PDF transcript. Please try again later.')
      return
    }
  }

  const overall = useMemo(() => calculateTotals(results), [results])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">My Results</h2>
        <p className="text-sm text-gray-500">All graded subjects and exams for your account</p>
      </header>

      <div className="bg-white rounded-xl p-4 border border-neutral-200">
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-neutral-100">
              <div className="text-sm text-black">Summary</div>
              <div className="text-lg font-semibold text-black truncate">Total scored: {overall.obtained ?? 0}</div>
              <div className="mt-2 text-xs text-black">Total possible: {overall.totalPossible ?? 0}</div>
              <div className="mt-2 text-xs text-black">Percentage: {overall.percentage != null ? `${Math.round(overall.percentage)}%` : '—'}</div>
              <div className="mt-2 text-xs text-black">Grade: {overall.percentage != null ? toLetterGrade(overall.percentage) : '—'}</div>
              <div className="mt-3">
                <button
                  onClick={() => downloadTranscript()}
                  disabled={!results || results.length === 0}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${(!results || results.length === 0) ? 'bg-indigo-300 text-white cursor-not-allowed opacity-70' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  Download transcript
                </button>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            {loading && (
              <div className="space-y-3">
                <div className="h-4 bg-neutral-200 rounded w-1/3 animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="h-28 bg-neutral-100 rounded animate-pulse" />
                  <div className="h-28 bg-neutral-100 rounded animate-pulse" />
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-600">Failed to load: {String(error)}</div>}

            {!loading && (!results || results.length === 0) && (
              <div className="text-sm text-black p-6 bg-white rounded-lg border border-dashed border-neutral-200">No graded results yet.</div>
            )}

            {!loading && results && results.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-3 text-black">Subjects & Results</h3>

                <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
                  <table className="min-w-full text-sm table-auto">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Subject</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Exam</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Marks</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">%</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Grade</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(r => (
                        <tr key={r.id} className="border-t">
                          <td className="px-4 py-3 text-sm text-black">{r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || '—'}</td>
                          <td className="px-4 py-3 text-sm text-black">{r.exam_title || (r.exam && r.exam.title) || 'Exam'}</td>
                          <td className="px-4 py-3 text-right text-black">{r.marks_obtained != null ? Number(r.marks_obtained).toFixed(2) : 'Pending'}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{r.exam_total_marks ?? (r.exam && r.exam.total_marks) ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{r.percentage != null ? `${Math.round(r.percentage)}%` : '—'}</td>
                          <td className="px-4 py-3 text-center text-black">{r.grade || (r.percentage != null ? toLetterGrade(r.percentage) : '—')}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{formatDate(r.graded_at || r.submitted_at || r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
