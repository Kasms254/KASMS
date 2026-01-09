import { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import api from '../../lib/api'

function toPercent(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  return Math.round(Number(n) * 100) / 100
}

function gradeFromPercent(p) {
  if (p == null || Number.isNaN(Number(p))) return null
  if (p >= 80) return 'A'
  if (p >= 70) return 'B'
  if (p >= 60) return 'C'
  if (p >= 50) return 'D'
  if (p >= 40) return 'E'
  return 'F'
}

export default function ClassDetail() {
  const { id } = useParams()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [marksLoading, setMarksLoading] = useState(false)
  const [subjectMarks, setSubjectMarks] = useState({}) // NEW: store marks per subject separately
  const [subjectName, setSubjectName] = useState('')
  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const location = useLocation()
  const subjectIdParam = new URLSearchParams(location.search).get('subject')
  // Ensure subjectId is a number for consistent keying (backend returns numbers)
  const subjectId = subjectIdParam ? Number(subjectIdParam) : null
  const subjectStats = subjectId ? subjectMarks[subjectId] || {} : {}
  const totalStudents = students.length
  const gradedCount = subjectId ? Object.values(subjectStats).filter(v => v?.percent != null).length : 0
  const pendingCount = subjectId ? Math.max(0, totalStudents - gradedCount) : totalStudents
  const subjectLabel = subjectId ? (subjectName || `Subject ${subjectId}`) : null

  // Calculate paginated students
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedStudents = students.slice(startIndex, endIndex)
  const totalPages = Math.ceil(totalStudents / pageSize)

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
      if (!subjectId) {
        // don't clear students, just clear subject marks
        setSubjectName('')
        return
      }
      setMarksLoading(true)
      try {
        // fetch exams for ONLY this subject
        console.log('[ClassDetail] Loading marks for subject ID:', subjectId)
        const exams = await api.getExams(`subject=${encodeURIComponent(subjectId)}`)
        const examsList = Array.isArray(exams) ? exams : (exams && Array.isArray(exams.results) ? exams.results : [])
        console.log('[ClassDetail] Found', examsList.length, 'exams for subject', subjectId, ':', examsList.map(e => ({ id: e.id, title: e.title, subject: e.subject, subject_name: e.subject_name })))
        if (!examsList.length) {
          // no exams for this subject, just clear this subject's marks
          setSubjectMarks(prev => {
            const updated = { ...prev }
            delete updated[subjectId]
            return updated
          })
          setSubjectName('')
          return
        }

        // fetch results for all exams of THIS subject to find which has the most recent grading
        const resultsData = await Promise.all(
          examsList.map(ex => 
            api.getExamResults(ex.id).then(res => ({
              exam: ex,
              results: Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
            })).catch(() => ({ exam: ex, results: [] }))
          )
        )

        // pick the latest exam by exam_date (not by grading time) to avoid cross-subject contamination
        const sorted = [...resultsData].sort((a, b) => {
          const bDate = b.exam.exam_date || b.exam.created_at || 0
          const aDate = a.exam.exam_date || a.exam.created_at || 0
          return new Date(bDate) - new Date(aDate)
        })
        const targetExam = sorted[0]?.exam
        const targetResults = sorted[0]?.results || []

        // capture subject name if available
        if (targetExam?.subject_name || targetExam?.subject_title) {
          setSubjectName(targetExam.subject_name || targetExam.subject_title)
        } else if (examsList[0]?.subject_name) {
          setSubjectName(examsList[0].subject_name)
        }

        if (!targetExam?.id) {
          setSubjectMarks(prev => {
            const updated = { ...prev }
            delete updated[subjectId]
            return updated
          })
          return
        }

        const list = targetResults
        const studentStats = {}
        list.forEach(r => {
          const studentObj = r.student || r.student_id || r.student_id || (r.student && r.student.id) || null
          const studentId = (r.student && r.student.id) || r.student_id || (typeof studentObj === 'object' ? studentObj.id : studentObj)
          if (!studentId) return
          const marks = r.marks_obtained != null ? Number(r.marks_obtained) : null
          const total = r.exam_total_marks != null ? Number(r.exam_total_marks) : null
          const percent = r.percentage != null
            ? Number(r.percentage)
            : (marks != null && total > 0) ? (marks / total) * 100 : null
          const derivedGrade = r.grade || gradeFromPercent(percent)
          studentStats[studentId] = {
            percent: percent != null && !Number.isNaN(percent) ? percent : null,
            grade: derivedGrade || null,
          }
        })

        if (!mounted) return
        // store marks in subjectMarks indexed by subjectId, NOT in students array
        console.log('[ClassDetail] Storing marks for subject', subjectId, 'with', Object.keys(studentStats).length, 'students from exam:', targetExam?.id, targetExam?.title)
        setSubjectMarks(prev => ({
          ...prev,
          [subjectId]: studentStats
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
    // build CSV with svc_number, rank, name, marks_percent
    const headers = ['svc_number', 'rank', 'name', 'marks_percent']
    const rows = students.map(s => {
      const name = (s.full_name && String(s.full_name).trim()) || `${s.first_name || ''} ${s.last_name || ''}`.trim()
      const subjectStats = subjectMarks[subjectId]?.[s.id]
      const marks = subjectStats?.percent != null ? String(Math.round(subjectStats.percent)) : ''
      return [
        (s.svc_number || '').replace(/,/g, ''),
        (s.rank || '').replace(/,/g, ''),
        name.replace(/,/g, ''),
        marks,
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
    <div className="p-3 sm:p-4 md:p-6 text-black space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Class students</h2>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mt-1">
              <p className="text-xs sm:text-sm text-gray-600 break-words">
                {subjectId ? 'Students enrolled and their latest exam performance for this subject.' : 'Students enrolled in this class.'}
              </p>
              {subjectLabel && (
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 w-fit">
                  {subjectLabel}
                </span>
              )}
            </div>
          </div>
          {subjectId && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={downloadCSV}
                disabled={marksLoading}
                className="flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white shadow-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap"
              >
                {marksLoading ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white border rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Enrolled</p>
          <p className="text-xl sm:text-2xl font-semibold text-gray-900 my-1">{totalStudents}</p>
          <p className="text-[10px] sm:text-xs text-gray-500">Total students in this class</p>
        </div>
        <div className="bg-white border rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Graded</p>
          <p className="text-xl sm:text-2xl font-semibold text-green-700 my-1">{subjectId ? gradedCount : '—'}</p>
          <p className="text-[10px] sm:text-xs text-gray-500">Latest exam for selected subject</p>
        </div>
        <div className="bg-white border rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Pending</p>
          <p className="text-xl sm:text-2xl font-semibold text-amber-600 my-1">{subjectId ? pendingCount : '—'}</p>
          <p className="text-[10px] sm:text-xs text-gray-500">Awaiting grades for this subject</p>
        </div>
      </div>

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">Failed to load students: {error.message || String(error)}</div>}

      {!loading && students.length === 0 && <div className="text-sm text-neutral-600">No students found for this class.</div>}

      <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 border shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <p className="text-xs sm:text-sm font-medium text-gray-800">Students enrolled in this class.</p>
          {subjectId && <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">Showing latest exam per subject</span>}
        </div>
        <div className="overflow-x-auto -mx-3 sm:-mx-4">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full text-left text-xs sm:text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-[10px] sm:text-sm whitespace-nowrap">Svc number</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-[10px] sm:text-sm whitespace-nowrap">Rank</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-[10px] sm:text-sm">Name</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-[10px] sm:text-sm whitespace-nowrap">Marks (%)</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-[10px] sm:text-sm">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {marksLoading
                  ? Array.from({ length: Math.min(6, Math.max(3, paginatedStudents.length)) || 4 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="px-2 sm:px-3 py-2 sm:py-3"><div className="h-3 w-12 sm:w-16 bg-gray-200 rounded" /></td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3"><div className="h-3 w-10 sm:w-14 bg-gray-200 rounded" /></td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3"><div className="h-3 w-20 sm:w-28 bg-gray-200 rounded" /></td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3"><div className="h-3 w-10 sm:w-12 bg-gray-200 rounded" /></td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3"><div className="h-5 sm:h-6 w-10 sm:w-12 bg-gray-200 rounded-full" /></td>
                      </tr>
                    ))
                  : paginatedStudents.map(st => {
                      const stats = subjectMarks[subjectId]?.[st.id]
                      const marks = stats?.percent != null ? toPercent(stats.percent) : null
                      const grade = stats?.grade || (marks != null ? gradeFromPercent(marks) || '—' : '—')
                      const badgeClass = grade
                        ? grade === 'A' || grade === 'B'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : grade === 'C' || grade === 'D'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                      return (
                        <tr key={st.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-2 sm:px-3 py-2 whitespace-nowrap text-gray-800 text-[10px] sm:text-xs">{st.svc_number || st.student_svc_number || '—'}</td>
                          <td className="px-2 sm:px-3 py-2 whitespace-nowrap text-gray-700 text-[10px] sm:text-xs">{st.rank || '—'}</td>
                          <td className="px-2 sm:px-3 py-2 text-gray-900 text-[10px] sm:text-xs">{st.full_name || `${st.first_name || ''} ${st.last_name || ''}`.trim()}</td>
                          <td className="px-2 sm:px-3 py-2 text-gray-800 text-[10px] sm:text-xs">{marks != null ? `${marks}%` : <span className="text-gray-400">—</span>}</td>
                          <td className="px-2 sm:px-3 py-2">
                            <span className={`inline-flex items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold border ${badgeClass}`}>
                              {grade || 'Pending'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>
        {!subjectId && (
          <div className="mt-3 text-[10px] sm:text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Add a subject query param in the URL to see marks for that subject (e.g. ?subject=123).
          </div>
        )}
      </div>

      {/* Modern Pagination Controls */}
      {!loading && totalStudents > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Results info */}
            <div className="text-sm text-black">
              Showing <span className="font-semibold text-black">{Math.min(startIndex + 1, totalStudents)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(endIndex, totalStudents)}</span> of{' '}
              <span className="font-semibold text-black">{totalStudents}</span> students
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              {/* Previous button */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const pages = []
                  const maxVisible = 5

                  let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
                  let endPage = Math.min(totalPages, startPage + maxVisible - 1)

                  if (endPage - startPage < maxVisible - 1) {
                    startPage = Math.max(1, endPage - maxVisible + 1)
                  }

                  if (startPage > 1) {
                    pages.push(
                      <button key={1} onClick={() => setPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        1
                      </button>
                    )
                    if (startPage > 2) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition ${
                          page === i
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }
                    pages.push(
                      <button key={totalPages} onClick={() => setPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              {/* Next button */}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page size selector */}
              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-black hidden sm:inline">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
