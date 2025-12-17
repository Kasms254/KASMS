import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '../../lib/api'

function toPercent(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  return Math.round(Number(n) * 100) / 100
}

export default function ClassDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [marksLoading, setMarksLoading] = useState(false)

  const location = useLocation()
  const subjectId = new URLSearchParams(location.search).get('subject')

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!id) return
      setLoading(true)
      try {
        const res = await api.getClassEnrolledStudents(id)
        const list = res && Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
        const mapped = (list || []).map((u) => {
          const student = u.student || u
          return {
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            full_name: student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
            svc_number: student.svc_number != null ? String(student.svc_number) : '',
            email: student.email,
            phone_number: student.phone_number,
            rank: student.rank || student.rank_display || '',
            is_active: student.is_active,
            created_at: student.created_at,
          }
        })
        if (mounted) setStudents(mapped)
      } catch (err) {
        console.error('Failed to load class students', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [id])

  // If a subject query param is present, fetch exams for that subject and gather marks per student
  useEffect(() => {
    let mounted = true
    async function loadMarks() {
      if (!subjectId) return
      setMarksLoading(true)
      try {
        // fetch exams for the subject
        const exams = await api.getExams(`?subject=${encodeURIComponent(subjectId)}`)
        const examsList = Array.isArray(exams) ? exams : (exams && Array.isArray(exams.results) ? exams.results : [])
        const examIds = examsList.map(e => e.id).filter(Boolean)
        if (!examIds.length) return

        // fetch results for each exam in parallel
  const resultsArr = await Promise.all(examIds.map(eid => api.getExamResults(eid).catch(() => null)))
        // aggregate marks per student: compute average percent across results
        const studentStats = {}
  resultsArr.forEach((res) => {
          const list = res && Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
          list.forEach(r => {
            const studentObj = r.student || r.student_id || r.student_id || (r.student && r.student.id) || null
            const studentId = (r.student && r.student.id) || r.student_id || (typeof studentObj === 'object' ? studentObj.id : studentObj)
            if (!studentId) return
            const marks = r.marks_obtained != null ? Number(r.marks_obtained) : null
            const total = r.exam_total_marks != null ? Number(r.exam_total_marks) : null
            const percent = (marks != null && total > 0) ? (marks / total) * 100 : (marks != null ? marks : null)
            studentStats[studentId] = studentStats[studentId] || { sumPercent: 0, count: 0 }
            if (percent != null && !Number.isNaN(percent)) {
              studentStats[studentId].sumPercent += percent
              studentStats[studentId].count += 1
            }
          })
        })

        if (!mounted) return
        // merge stats into students array
        setStudents(prev => prev.map(st => {
          const stats = studentStats[st.id]
          if (!stats) return { ...st, marks: null, exams_count: 0 }
          const avg = stats.count ? stats.sumPercent / stats.count : null
          return { ...st, marks: avg != null ? toPercent(avg) : null, exams_count: stats.count }
        }))
      } catch (err) {
        console.error('Failed to load marks for subject', err)
      } finally {
        if (mounted) setMarksLoading(false)
      }
    }
    loadMarks()
    return () => { mounted = false }
  }, [subjectId])

  function downloadCSV() {
    // build CSV with svc_number, rank, name, marks_percent, exams_count
    const headers = ['svc_number', 'rank', 'name', 'marks_percent', 'exams_count']
    const rows = students.map(s => {
      const name = (s.full_name && String(s.full_name).trim()) || `${s.first_name || ''} ${s.last_name || ''}`.trim()
      return [
        (s.svc_number || '').replace(/,/g, ''),
        (s.rank || '').replace(/,/g, ''),
        name.replace(/,/g, ''),
        s.marks != null ? String(s.marks) : '',
        s.exams_count || 0,
      ]
    })
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `class_${id}_students.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 text-black">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Class students</h2>
          <p className="text-sm text-gray-600">Students enrolled in this class.</p>
        </div>
        <div className="flex items-center space-x-2">
          {subjectId && (
            <button onClick={downloadCSV} disabled={marksLoading} className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
              {marksLoading ? 'Preparing CSV…' : 'Download CSV'}
            </button>
          )}
          <button onClick={() => navigate(-1)} className="px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Back</button>
        </div>
      </div>

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">Failed to load students: {error.message || String(error)}</div>}

      {!loading && students.length === 0 && <div className="text-sm text-neutral-600">No students found for this class.</div>}

      <div className="bg-white rounded-xl p-4 border">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-gray-600">
              <th className="px-2 py-2">Svc number</th>
              <th className="px-2 py-2">Rank</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Marks (%)</th>
            </tr>
          </thead>
          <tbody>
            {students.map(st => (
              <tr key={st.id} className="border-t">
                <td className="px-2 py-2">{st.svc_number || st.student_svc_number || '—'}</td>
                <td className="px-2 py-2">{st.rank || '—'}</td>
                <td className="px-2 py-2">{st.full_name || `${st.first_name || ''} ${st.last_name || ''}`.trim()}</td>
                <td className="px-2 py-2">{st.marks != null ? `${st.marks}%` : (st.exams_count ? '0%' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
