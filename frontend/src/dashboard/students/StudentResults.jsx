import React, { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import * as api from '../../lib/api'
import { Download, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'

export default function StudentResults() {
  const { user } = useAuth()
  const toast = useToast()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [viewMode, setViewMode] = useState('table') // 'table' or 'cards'

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
    if (pct >= 80) return 'A'
    if (pct >= 70) return 'B'
    if (pct >= 60) return 'C'
    if (pct >= 50) return 'D'
    return 'F'
  }

  function getGradeColor(grade) {
    switch (grade) {
      case 'A': return 'bg-green-100 text-green-800 border-green-200'
      case 'B': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'D': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'F': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  function getPerformanceIndicator(pct) {
    if (pct == null) return null
    if (pct >= 80) return { icon: TrendingUp, color: 'text-green-600', label: 'Excellent' }
    if (pct >= 70) return { icon: TrendingUp, color: 'text-blue-600', label: 'Good' }
    if (pct >= 60) return { icon: Minus, color: 'text-yellow-600', label: 'Average' }
    if (pct >= 50) return { icon: TrendingDown, color: 'text-orange-600', label: 'Below Average' }
    return { icon: TrendingDown, color: 'text-red-600', label: 'Needs Improvement' }
  }

  function formatMarks(obtained, total) {
    const obtainedStr = obtained != null ? formatNumber(obtained) : '—'
    const totalStr = total != null ? formatNumber(total) : '—'
    return `${obtainedStr}/${totalStr}`
  }

  function formatNumber(num) {
    if (num == null || num === '') return '—'
    const n = Number(num)
    if (!Number.isFinite(n)) return '—'
    // Show no decimals for integers, 1 decimal for tenths, 2 decimals for hundredths
    if (Number.isInteger(n)) return String(n)
    const decimals = n.toFixed(2).replace(/\.?0+$/, '')
    return decimals
  }

  function formatPercentage(pct) {
    if (pct == null) return '—'
    const n = Number(pct)
    if (!Number.isFinite(n)) return '—'
    // Show no decimals for whole numbers, 1 decimal otherwise
    return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`
  }

  function calculateTrend() {
    if (!results || results.length < 2) return null
    const sorted = [...results].sort((a, b) => {
      const dateA = new Date(a.graded_at || a.submitted_at || a.created_at)
      const dateB = new Date(b.graded_at || b.submitted_at || b.created_at)
      return dateA - dateB
    })
    const recent = sorted.slice(-3).filter(r => r.percentage != null)
    if (recent.length < 2) return null
    const avg = recent.reduce((sum, r) => sum + r.percentage, 0) / recent.length
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2)).filter(r => r.percentage != null)
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2)).filter(r => r.percentage != null)
    if (firstHalf.length === 0 || secondHalf.length === 0) return null
    const firstAvg = firstHalf.reduce((sum, r) => sum + r.percentage, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, r) => sum + r.percentage, 0) / secondHalf.length
    const diff = secondAvg - firstAvg
    if (diff > 5) return { direction: 'up', value: diff, icon: TrendingUp, color: 'text-green-600' }
    if (diff < -5) return { direction: 'down', value: Math.abs(diff), icon: TrendingDown, color: 'text-red-600' }
    return { direction: 'stable', value: 0, icon: Minus, color: 'text-gray-600' }
  }

  function toggleRowExpansion(id) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
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

  function getGradeColorForPDF(grade) {
    switch (grade) {
      case 'A': return [34, 197, 94] // green-500
      case 'B': return [59, 130, 246] // blue-500
      case 'C': return [234, 179, 8] // yellow-500
      case 'D': return [249, 115, 22] // orange-500
      case 'F': return [239, 68, 68] // red-500
      default: return [107, 114, 128] // gray-500
    }
  }

  async function downloadTranscript() {
    const rows = results || []
    if (!rows || rows.length === 0) return

    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40

      // Header with decorative element
      doc.setFillColor(79, 70, 229) // indigo-600
      doc.rect(0, 0, pageWidth, 60, 'F')

      // Title
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(24)
      doc.setFont(undefined, 'bold')
      doc.text('Academic Transcript', margin, 35)

      // Student Information Section
      let yPos = 80
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('Student Information', margin, yPos)

      yPos += 20
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')

      const studentName = user && user.first_name
        ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
        : 'Student'
      const studentSvc = user && user.svc_number ? user.svc_number : ''
      const studentRank = user && user.rank ? user.rank : ''

      // Service Number
      if (studentSvc) {
        doc.text(`Service Number: ${studentSvc}`, margin, yPos)
        yPos += 15
      }

      // Rank
      if (studentRank) {
        doc.text(`Rank: ${studentRank}`, margin, yPos)
        yPos += 15
      }

      // Name
      doc.text(`Name: ${studentName}`, margin, yPos)

      // Generation date (right aligned)
      const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      doc.text(`Generated: ${generatedDate}`, pageWidth - margin - 150, yPos)

      // Summary Statistics Box
      yPos += 30
      doc.setFillColor(249, 250, 251) // gray-50
      doc.roundedRect(margin, yPos, pageWidth - (2 * margin), 70, 3, 3, 'F')
      doc.setDrawColor(229, 231, 235) // gray-200
      doc.roundedRect(margin, yPos, pageWidth - (2 * margin), 70, 3, 3, 'S')

      yPos += 20
      doc.setFontSize(11)
      doc.setFont(undefined, 'bold')
      doc.text('Overall Performance Summary', margin + 15, yPos)

      yPos += 20
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')

      const summaryLine1 = `Total Score: ${formatMarks(overall.obtained, overall.totalPossible)}`
      const summaryLine2 = `Overall Percentage: ${formatPercentage(overall.percentage)}`
      const overallGrade = overall.percentage != null ? toLetterGrade(overall.percentage) : '—'
      const summaryLine3 = `Overall Grade: ${overallGrade}`

      doc.text(summaryLine1, margin + 15, yPos)
      doc.text(summaryLine2, margin + 180, yPos)
      doc.text(summaryLine3, margin + 350, yPos)

      // Add performance indicator
      if (overall.percentage != null) {
        const indicator = getPerformanceIndicator(overall.percentage)
        if (indicator) {
          yPos += 15
          doc.setFont(undefined, 'italic')
          doc.text(`Performance Level: ${indicator.label}`, margin + 15, yPos)
        }
      }

      // Exam Results Table
      yPos += 40

      const body = rows.map(r => {
        const subjectName = r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || '—'
        const score = formatMarks(r.marks_obtained, r.exam_total_marks ?? (r.exam && r.exam.total_marks))
        const grade = r.grade || (r.percentage != null ? toLetterGrade(r.percentage) : '—')

        return [subjectName, score, grade]
      })

      autoTable(doc, {
        head: [['Subject', 'Score', 'Grade']],
        body,
        startY: yPos,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 11,
          cellPadding: 10,
          lineColor: [229, 231, 235],
          lineWidth: 0.5
        },
        headStyles: {
          fillColor: [79, 70, 229], // indigo-600
          textColor: 255,
          fontSize: 12,
          fontStyle: 'bold',
          halign: 'left'
        },
        columnStyles: {
          0: { cellWidth: 'auto', fontStyle: 'bold' }, // Subject
          1: { cellWidth: 120, halign: 'center', fontSize: 12 }, // Score
          2: { cellWidth: 80, halign: 'center', fontStyle: 'bold', fontSize: 13 } // Grade
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] // gray-50
        },
        didParseCell: function(data) {
          // Color-code grades
          if (data.column.index === 2 && data.section === 'body') {
            const grade = data.cell.text[0]
            const color = getGradeColorForPDF(grade)
            data.cell.styles.textColor = color
          }
        },
        didDrawPage: function(data) {
          // Footer with page numbers
          const pageCount = doc.internal.getNumberOfPages()
          const currentPage = doc.internal.getCurrentPageInfo().pageNumber

          doc.setFontSize(8)
          doc.setTextColor(107, 114, 128) // gray-500
          doc.setFont(undefined, 'normal')

          // Footer text
          const footerText = `Academic Transcript - ${studentName}`
          doc.text(footerText, margin, pageHeight - 20)

          // Page number
          doc.text(
            `Page ${currentPage} of ${pageCount}`,
            pageWidth - margin - 60,
            pageHeight - 20
          )

          // Footer line
          doc.setDrawColor(229, 231, 235) // gray-200
          doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30)
        }
      })

      // Generate filename with student name and date
      const dateStr = new Date().toISOString().split('T')[0]
      const nameSlug = studentName.toLowerCase().replace(/\s+/g, '-')
      const filename = `transcript-${nameSlug}-${dateStr}.pdf`

      doc.save(filename)

      if (toast && toast.success) {
        toast.success('Transcript downloaded successfully!')
      }
    } catch (err) {
      console.error('PDF generation failed', err)
      if (toast && toast.error) toast.error('Failed to generate PDF transcript. Please try again later.')
      else alert('Failed to generate PDF transcript. Please try again later.')
      return
    }
  }

  const overall = useMemo(() => calculateTotals(results), [results])
  const trend = useMemo(() => calculateTrend(), [results])

  // Detect mobile view
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('cards')
      } else {
        setViewMode('table')
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-black">My Results</h2>
        <p className="text-sm text-gray-500">All graded subjects and exams for your account</p>
      </header>

      {/* Summary Banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-6 border border-indigo-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Total Score</div>
            <div className="text-2xl font-bold text-indigo-900">{formatMarks(overall.obtained, overall.totalPossible)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Overall Grade</div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getGradeColor(toLetterGrade(overall.percentage))}`}>
                {overall.percentage != null ? toLetterGrade(overall.percentage) : '—'}
              </span>
              <span className="text-lg font-semibold text-gray-700">{formatPercentage(overall.percentage)}</span>
            </div>
          </div>
          {trend && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Performance Trend</div>
              <div className="flex items-center gap-2">
                {React.createElement(trend.icon, { className: `w-5 h-5 ${trend.color}` })}
                <span className={`text-sm font-medium ${trend.color}`}>
                  {trend.direction === 'up' && 'Improving'}
                  {trend.direction === 'down' && 'Declining'}
                  {trend.direction === 'stable' && 'Stable'}
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end">
            <button
              onClick={() => downloadTranscript()}
              disabled={!results || results.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm hover:shadow"
              aria-label="Download transcript as PDF"
            >
              <Download className="w-4 h-4" />
              Download Transcript
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-neutral-200 shadow-sm">
        {loading && (
          <div className="space-y-4">
            <div className="h-6 bg-neutral-200 rounded w-1/3 animate-pulse" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-neutral-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
            <span className="font-medium">Error:</span> Failed to load results. {String(error)}
          </div>
        )}

        {!loading && (!results || results.length === 0) && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Yet</h3>
            <p className="text-sm text-gray-500">Your graded results will appear here once your instructor grades your exams.</p>
          </div>
        )}

        {!loading && results && results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-black">
                Exam Results <span className="text-sm font-normal text-gray-500">({results.length} {results.length === 1 ? 'exam' : 'exams'})</span>
              </h3>
            </div>

            {/* Table View for Desktop */}
            {viewMode === 'table' && (
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="min-w-full text-sm" role="table" aria-label="Student exam results">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Subject</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Exam</th>
                      <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Score</th>
                      <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Percentage</th>
                      <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Grade</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white">
                    {results.map(r => {
                      const grade = r.grade || (r.percentage != null ? toLetterGrade(r.percentage) : '—')
                      const indicator = getPerformanceIndicator(r.percentage)
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-gray-50 transition-colors duration-150"
                          role="row"
                        >
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || '—'}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-700">
                            {r.exam_title || (r.exam && r.exam.title) || 'Exam'}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-sm font-semibold text-gray-900">
                              {formatMarks(r.marks_obtained, r.exam_total_marks ?? (r.exam && r.exam.total_marks))}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {indicator && React.createElement(indicator.icon, {
                                className: `w-4 h-4 ${indicator.color}`,
                                'aria-label': indicator.label
                              })}
                              <span className="text-sm font-medium text-gray-900">
                                {formatPercentage(r.percentage)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getGradeColor(grade)}`}>
                              {grade}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {formatDate(r.graded_at || r.submitted_at || r.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Card View for Mobile */}
            {viewMode === 'cards' && (
              <div className="space-y-3">
                {results.map(r => {
                  const grade = r.grade || (r.percentage != null ? toLetterGrade(r.percentage) : '—')
                  const indicator = getPerformanceIndicator(r.percentage)
                  const isExpanded = expandedRows.has(r.id)
                  return (
                    <div
                      key={r.id}
                      className="border border-neutral-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200"
                      role="article"
                      aria-label={`Result for ${r.subject_name || 'exam'}`}
                    >
                      <button
                        onClick={() => toggleRowExpansion(r.id)}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors duration-150"
                        aria-expanded={isExpanded}
                        aria-controls={`result-details-${r.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 truncate">
                              {r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || '—'}
                            </div>
                            <div className="text-sm text-gray-600 truncate mt-1">
                              {r.exam_title || (r.exam && r.exam.title) || 'Exam'}
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getGradeColor(grade)}`}>
                                {grade}
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatPercentage(r.percentage)}
                              </span>
                              {indicator && React.createElement(indicator.icon, {
                                className: `w-4 h-4 ${indicator.color}`,
                                'aria-label': indicator.label
                              })}
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {formatMarks(r.marks_obtained, r.exam_total_marks ?? (r.exam && r.exam.total_marks))}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" aria-hidden="true" />
                            )}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div
                          id={`result-details-${r.id}`}
                          className="px-4 pb-4 pt-2 bg-gray-50 border-t border-neutral-200 space-y-2"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Marks Obtained:</span>
                            <span className="font-medium text-gray-900">{formatNumber(r.marks_obtained)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Marks:</span>
                            <span className="font-medium text-gray-900">{formatNumber(r.exam_total_marks ?? (r.exam && r.exam.total_marks))}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Performance:</span>
                            <span className={`font-medium ${indicator?.color || 'text-gray-900'}`}>
                              {indicator?.label || '—'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Graded on:</span>
                            <span className="font-medium text-gray-900">
                              {formatDate(r.graded_at || r.submitted_at || r.created_at)}
                            </span>
                          </div>
                          {r.remarks && (
                            <div className="pt-2 border-t border-neutral-200">
                              <span className="text-xs text-gray-600 block mb-1">Remarks:</span>
                              <p className="text-sm text-gray-900">{r.remarks}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
