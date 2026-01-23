import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import * as api from '../../lib/api'
import { Download, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Filter } from 'lucide-react'

export default function StudentResults() {
  const { user } = useAuth()
  const toast = useToast()
  const [results, setResults] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [loading, setLoading] = useState(false)
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)
  const [error, setError] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [viewMode, setViewMode] = useState('table') // 'table' or 'cards'
  const [showTranscriptMenu, setShowTranscriptMenu] = useState(false)
  const transcriptMenuRef = useRef(null)

  // Close transcript menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (transcriptMenuRef.current && !transcriptMenuRef.current.contains(event.target)) {
        setShowTranscriptMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load student enrollments (all classes they've been enrolled in)
  useEffect(() => {
    let mounted = true

    async function loadEnrollments() {
      if (!user) return
      setLoadingEnrollments(true)
      try {
        const res = await api.getStudentEnrollments()
        if (!mounted) return
        const enrollmentList = Array.isArray(res)
          ? res
          : Array.isArray(res?.results)
            ? res.results
            : []
        setEnrollments(enrollmentList)
      } catch {
        // Silently handle enrollment load error
      } finally {
        if (mounted) setLoadingEnrollments(false)
      }
    }

    loadEnrollments()
    return () => { mounted = false }
  }, [user])

  // Load student results with optional class filter
  useEffect(() => {
    let mounted = true

    async function loadStudentResults() {
      if (!user) return

      setLoading(true)
      setError(null)

      try {
        const params = {}
        if (selectedClassId !== 'all') {
          params.class_id = selectedClassId
        }
        const res = await api.getMyResults(params)

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
  }, [user, selectedClassId])

  // Group results by class for display
  const resultsByClass = useMemo(() => {
    const groups = {}
    for (const r of results) {
      const classId = r.class_id || 'unknown'
      const className = r.class_name || 'Unknown Class'
      const courseName = r.course_name || ''
      if (!groups[classId]) {
        groups[classId] = {
          classId,
          className,
          courseName,
          results: []
        }
      }
      groups[classId].results.push(r)
    }
    return Object.values(groups)
  }, [results])

  // Get unique classes from enrollments for the filter dropdown
  const classOptions = useMemo(() => {
    const options = []
    for (const enrollment of enrollments) {
      const classObj = enrollment.class_obj || enrollment
      const classId = classObj.id
      const className = classObj.name || enrollment.class_name || 'Unknown Class'
      const courseName = classObj.course?.name || enrollment.course_name || ''
      const isActive = enrollment.is_active !== false // default to true if not specified
      if (classId && !options.find(o => o.id === classId)) {
        options.push({ id: classId, name: className, courseName, isActive })
      }
    }
    return options
  }, [enrollments])

  // Get the active class (current enrollment)
  const activeClass = useMemo(() => {
    // Find the active enrollment
    const activeEnrollment = enrollments.find(e => e.is_active !== false)
    if (!activeEnrollment) return null
    const classObj = activeEnrollment.class_obj || activeEnrollment
    return {
      id: classObj.id,
      name: classObj.name || activeEnrollment.class_name || 'Unknown Class',
      courseName: classObj.course?.name || activeEnrollment.course_name || ''
    }
  }, [enrollments])

  // Get the current class to display in summary (either selected class or active class)
  const currentClass = useMemo(() => {
    if (selectedClassId !== 'all') {
      // Use the selected class from filter - check both classOptions and resultsByClass
      const selected = classOptions.find(c => String(c.id) === String(selectedClassId))
      if (selected) {
        return { id: selected.id, name: selected.name, courseName: selected.courseName }
      }
      // Fallback to resultsByClass if not found in classOptions
      const fromResults = resultsByClass.find(g => String(g.classId) === String(selectedClassId))
      if (fromResults) {
        return { id: fromResults.classId, name: fromResults.className, courseName: fromResults.courseName }
      }
    }
    // Default to active class (the student's current enrollment)
    // Always show the active class regardless of whether it has results
    if (activeClass?.id) {
      return activeClass
    }
    // Only fallback to first class with results if there's no active class at all
    if (resultsByClass.length > 0) {
      const first = resultsByClass[0]
      return { id: first.classId, name: first.className, courseName: first.courseName }
    }
    return null
  }, [selectedClassId, classOptions, activeClass, resultsByClass])

  // Get results for the current class only (for summary stats)
  const currentClassResults = useMemo(() => {
    if (!currentClass?.id) return []
    return results.filter(r => String(r.class_id) === String(currentClass.id))
  }, [results, currentClass])

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

  const calculateTrend = useCallback(() => {
    if (!results || results.length < 2) return null
    const sorted = [...results].sort((a, b) => {
      const dateA = new Date(a.graded_at || a.submitted_at || a.created_at)
      const dateB = new Date(b.graded_at || b.submitted_at || b.created_at)
      return dateA - dateB
    })
    const recent = sorted.slice(-3).filter(r => r.percentage != null)
    if (recent.length < 2) return null
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2)).filter(r => r.percentage != null)
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2)).filter(r => r.percentage != null)
    if (firstHalf.length === 0 || secondHalf.length === 0) return null
    const firstAvg = firstHalf.reduce((sum, r) => sum + r.percentage, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, r) => sum + r.percentage, 0) / secondHalf.length
    const diff = secondAvg - firstAvg
    if (diff > 5) return { direction: 'up', value: diff, icon: TrendingUp, color: 'text-green-600' }
    if (diff < -5) return { direction: 'down', value: Math.abs(diff), icon: TrendingDown, color: 'text-red-600' }
    return { direction: 'stable', value: 0, icon: Minus, color: 'text-gray-600' }
  }, [results])

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

  // Download transcript for a specific class or all classes
  async function downloadTranscript(transcriptClassId = null) {
    setShowTranscriptMenu(false)
    
    // Determine which results to use based on selection
    let rows
    let transcriptResultsByClass
    
    if (transcriptClassId === 'all') {
      // All classes
      rows = results || []
      transcriptResultsByClass = resultsByClass
    } else if (transcriptClassId) {
      // Specific class
      rows = results.filter(r => String(r.class_id) === String(transcriptClassId))
      transcriptResultsByClass = resultsByClass.filter(g => String(g.classId) === String(transcriptClassId))
    } else {
      // Current class (default)
      rows = currentClassResults
      transcriptResultsByClass = resultsByClass.filter(g => String(g.classId) === String(currentClass?.id))
    }
    
    if (!rows || rows.length === 0) {
      if (toast?.error) toast.error('No results to download for the selected class.')
      return
    }

    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40

      const studentName = user && user.first_name
        ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
        : 'Student'
      const studentSvc = user && user.svc_number ? user.svc_number : ''
      const studentRank = user && user.rank ? user.rank : ''
      const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      // Helper function to draw header on each page
      function drawHeader(title, subtitle) {
        doc.setFillColor(79, 70, 229) // indigo-600
        doc.rect(0, 0, pageWidth, 60, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(24)
        doc.setFont(undefined, 'bold')
        doc.text(title, margin, 35)
        if (subtitle) {
          doc.setFontSize(12)
          doc.setFont(undefined, 'normal')
          doc.text(subtitle, margin, 52)
        }
      }

      // Helper function to draw student info
      function drawStudentInfo(startY) {
        let yPos = startY
        doc.setTextColor(0, 0, 0)
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('Student Information', margin, yPos)

        yPos += 20
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')

        if (studentSvc) {
          doc.text(`Service Number: ${studentSvc}`, margin, yPos)
          yPos += 15
        }
        if (studentRank) {
          doc.text(`Rank: ${studentRank}`, margin, yPos)
          yPos += 15
        }
        doc.text(`Name: ${studentName}`, margin, yPos)
        doc.text(`Generated: ${generatedDate}`, pageWidth - margin - 150, yPos)

        return yPos + 15
      }

      // Helper function to draw summary box
      function drawSummaryBox(startY, classResults, classLabel) {
        const classTotals = calculateTotals(classResults)
        let yPos = startY

        if (classLabel) {
          doc.setFontSize(14)
          doc.setFont(undefined, 'bold')
          doc.setTextColor(79, 70, 229) // indigo-600
          doc.text(classLabel, margin, yPos)
          yPos += 20
        }

        doc.setFillColor(249, 250, 251) // gray-50
        doc.roundedRect(margin, yPos, pageWidth - (2 * margin), 70, 3, 3, 'F')
        doc.setDrawColor(229, 231, 235) // gray-200
        doc.roundedRect(margin, yPos, pageWidth - (2 * margin), 70, 3, 3, 'S')

        yPos += 20
        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text('Performance Summary', margin + 15, yPos)

        yPos += 20
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')

        const summaryLine1 = `Total Score: ${formatMarks(classTotals.obtained, classTotals.totalPossible)}`
        const summaryLine2 = `Percentage: ${formatPercentage(classTotals.percentage)}`
        const classGrade = classTotals.percentage != null ? toLetterGrade(classTotals.percentage) : '—'
        const summaryLine3 = `Grade: ${classGrade}`

        doc.text(summaryLine1, margin + 15, yPos)
        doc.text(summaryLine2, margin + 180, yPos)
        doc.text(summaryLine3, margin + 320, yPos)

        if (classTotals.percentage != null) {
          const indicator = getPerformanceIndicator(classTotals.percentage)
          if (indicator) {
            yPos += 15
            doc.setFont(undefined, 'italic')
            doc.text(`Performance Level: ${indicator.label}`, margin + 15, yPos)
          }
        }

        return yPos + 40
      }

      // Helper function to draw results table
      function drawResultsTable(startY, classResults) {
        const body = classResults.map(r => {
          const subjectName = r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || '—'
          const examTitle = r.exam_title || (r.exam && r.exam.title) || 'Exam'
          const score = formatMarks(r.marks_obtained, r.exam_total_marks ?? (r.exam && r.exam.total_marks))
          const grade = r.grade || (r.percentage != null ? toLetterGrade(r.percentage) : '—')
          return [subjectName, examTitle, score, grade]
        })

        autoTable(doc, {
          head: [['Subject', 'Exam', 'Score', 'Grade']],
          body,
          startY,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 10,
            cellPadding: 8,
            lineColor: [229, 231, 235],
            lineWidth: 0.5
          },
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontSize: 11,
            fontStyle: 'bold',
            halign: 'left'
          },
          columnStyles: {
            0: { cellWidth: 'auto', fontStyle: 'bold' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 70, halign: 'center', fontSize: 11 },
            3: { cellWidth: 50, halign: 'center', fontStyle: 'bold', fontSize: 12 }
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251]
          },
          didParseCell: function(data) {
            if (data.column.index === 3 && data.section === 'body') {
              const grade = data.cell.text[0]
              const color = getGradeColorForPDF(grade)
              data.cell.styles.textColor = color
            }
          }
        })

        return doc.lastAutoTable.finalY + 20
      }

      // Helper function to draw footer
      function drawFooter(classInfo) {
        const pageCount = doc.internal.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i)
          doc.setFontSize(8)
          doc.setTextColor(107, 114, 128)
          doc.setFont(undefined, 'normal')

          const footerText = classInfo 
            ? `Academic Transcript - ${studentName} - ${classInfo}`
            : `Academic Transcript - ${studentName}`
          doc.text(footerText, margin, pageHeight - 20)
          doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 60, pageHeight - 20)

          doc.setDrawColor(229, 231, 235)
          doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30)
        }
      }

      // Generate transcript based on whether we're viewing all classes or a single class
      if (transcriptClassId === 'all' && transcriptResultsByClass.length > 1) {
        // Multiple classes - create separate sections for each class
        let isFirstClass = true

        for (const classGroup of transcriptResultsByClass) {
          if (!isFirstClass) {
            doc.addPage()
          }

          const classLabel = `${classGroup.className}${classGroup.courseName ? ` — ${classGroup.courseName}` : ''}`
          
          drawHeader('Academic Transcript', classLabel)
          let yPos = drawStudentInfo(80)
          yPos = drawSummaryBox(yPos + 15, classGroup.results, null)
          drawResultsTable(yPos, classGroup.results)

          isFirstClass = false
        }

        // Add a summary page at the end with overall totals
        doc.addPage()
        drawHeader('Academic Transcript', 'Overall Summary - All Classes')
        let yPos = drawStudentInfo(80)
        
        yPos += 15
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text('Summary by Class', margin, yPos)
        yPos += 20

        // Summary table for all classes
        const classSummaryBody = transcriptResultsByClass.map(cg => {
          const totals = calculateTotals(cg.results)
          return [
            `${cg.className}${cg.courseName ? ` (${cg.courseName})` : ''}`,
            String(cg.results.length),
            formatMarks(totals.obtained, totals.totalPossible),
            formatPercentage(totals.percentage),
            totals.percentage != null ? toLetterGrade(totals.percentage) : '—'
          ]
        })

        autoTable(doc, {
          head: [['Class', 'Exams', 'Score', 'Percentage', 'Grade']],
          body: classSummaryBody,
          startY: yPos,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 10,
            cellPadding: 8,
            lineColor: [229, 231, 235],
            lineWidth: 0.5
          },
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontSize: 11,
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { cellWidth: 'auto', fontStyle: 'bold' },
            1: { cellWidth: 50, halign: 'center' },
            2: { cellWidth: 70, halign: 'center' },
            3: { cellWidth: 70, halign: 'center' },
            4: { cellWidth: 50, halign: 'center', fontStyle: 'bold' }
          },
          didParseCell: function(data) {
            if (data.column.index === 4 && data.section === 'body') {
              const grade = data.cell.text[0]
              const color = getGradeColorForPDF(grade)
              data.cell.styles.textColor = color
            }
          }
        })

        yPos = doc.lastAutoTable.finalY + 30

        // Overall totals box
        doc.setFillColor(79, 70, 229)
        doc.roundedRect(margin, yPos, pageWidth - (2 * margin), 60, 3, 3, 'F')

        yPos += 25
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('Combined Overall Performance', margin + 15, yPos)

        yPos += 20
        doc.setFontSize(11)
        doc.setFont(undefined, 'normal')
        const transcriptOverall = calculateTotals(rows)
        const overallGrade = transcriptOverall.percentage != null ? toLetterGrade(transcriptOverall.percentage) : '—'
        doc.text(
          `Total: ${formatMarks(transcriptOverall.obtained, transcriptOverall.totalPossible)}  |  Percentage: ${formatPercentage(transcriptOverall.percentage)}  |  Grade: ${overallGrade}`,
          margin + 15,
          yPos
        )

        drawFooter('All Classes')
      } else {
        // Single class or one class only - simple single-page transcript
        const classInfo = transcriptResultsByClass.length > 0 
          ? `${transcriptResultsByClass[0]?.className || ''}${transcriptResultsByClass[0]?.courseName ? ` — ${transcriptResultsByClass[0].courseName}` : ''}`
          : null

        drawHeader('Academic Transcript', classInfo)
        let yPos = drawStudentInfo(80)
        yPos = drawSummaryBox(yPos + 15, rows, null)
        drawResultsTable(yPos, rows)
        drawFooter(classInfo)
      }

      // Generate filename
      const dateStr = new Date().toISOString().split('T')[0]
      const nameSlug = studentName.toLowerCase().replace(/\s+/g, '-')
      let filename = `transcript-${nameSlug}`
      if (transcriptResultsByClass.length === 1) {
        const classSlug = (transcriptResultsByClass[0]?.className || '').toLowerCase().replace(/\s+/g, '-')
        if (classSlug) filename += `-${classSlug}`
      } else if (transcriptResultsByClass.length > 1) {
        filename += '-all-classes'
      }
      filename += `-${dateStr}.pdf`

      doc.save(filename)

      if (toast && toast.success) {
        toast.success('Transcript downloaded successfully!')
      }
    } catch {
      if (toast && toast.error) toast.error('Failed to generate PDF transcript. Please try again later.')
      else alert('Failed to generate PDF transcript. Please try again later.')
      return
    }
  }

  // Stats for the current class (shown in summary banner)
  const currentClassStats = useMemo(() => calculateTotals(currentClassResults), [currentClassResults])
  // Trend for displayed results
  const trend = useMemo(() => calculateTrend(), [calculateTrend])

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
        <p className="text-sm text-gray-500">View your graded results across all classes you've been enrolled in</p>
      </header>

      {/* Class Filter */}
      {classOptions.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filter by Class:</span>
            </div>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="flex-1 sm:flex-none sm:min-w-[280px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              aria-label="Select a class to filter results"
              style={{ color: '#000' }}
            >
              <option value="all" style={{ color: '#000' }}>All Classes</option>
              {classOptions.map(opt => (
                <option key={opt.id} value={opt.id} style={{ color: '#000' }}>
                  {opt.name}{opt.courseName ? ` (${opt.courseName})` : ''}
                </option>
              ))}
            </select>
            {selectedClassId !== 'all' && (
              <button
                onClick={() => setSelectedClassId('all')}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear filter
              </button>
            )}
          </div>
          {loadingEnrollments && (
            <div className="mt-2 text-xs text-gray-500">Loading classes...</div>
          )}
        </div>
      )}

      {/* Summary Banner - Shows current class stats */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-6 border border-indigo-100">
        {currentClass && (
          <div className="mb-4 pb-3 border-b border-indigo-200">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {selectedClassId !== 'all' ? 'Selected Class' : 'Current Class'}
            </div>
            <div className="text-lg font-semibold text-indigo-900">
              {currentClass.name}{currentClass.courseName ? ` — ${currentClass.courseName}` : ''}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Total Score</div>
            <div className="text-2xl font-bold text-indigo-900">{formatMarks(currentClassStats.obtained, currentClassStats.totalPossible)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Overall Grade</div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getGradeColor(toLetterGrade(currentClassStats.percentage))}`}>
                {currentClassStats.percentage != null ? toLetterGrade(currentClassStats.percentage) : '—'}
              </span>
              <span className="text-lg font-semibold text-gray-700">{formatPercentage(currentClassStats.percentage)}</span>
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
          <div className="flex items-center justify-end relative" ref={transcriptMenuRef}>
            <button
              onClick={() => setShowTranscriptMenu(!showTranscriptMenu)}
              disabled={!results || results.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm hover:shadow"
              aria-label="Download transcript as PDF"
              aria-expanded={showTranscriptMenu}
              aria-haspopup="true"
            >
              <Download className="w-4 h-4" />
              Download Transcript
              <ChevronDown className={`w-4 h-4 transition-transform ${showTranscriptMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {/* Transcript selection dropdown */}
            {showTranscriptMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  Select Transcript
                </div>
                
                {/* Current class option */}
                {currentClass && (
                  <button
                    onClick={() => downloadTranscript(currentClass.id)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 flex items-center gap-2 text-gray-700 hover:text-indigo-700"
                  >
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{currentClass.name}</div>
                      <div className="text-xs text-gray-500">Current Class</div>
                    </div>
                  </button>
                )}
                
                {/* Other classes */}
                {resultsByClass.filter(g => String(g.classId) !== String(currentClass?.id)).map(classGroup => (
                  <button
                    key={classGroup.classId}
                    onClick={() => downloadTranscript(classGroup.classId)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 flex items-center gap-2 text-gray-700 hover:text-indigo-700"
                  >
                    <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{classGroup.className}</div>
                      {classGroup.courseName && <div className="text-xs text-gray-500">{classGroup.courseName}</div>}
                    </div>
                  </button>
                ))}
                
                {/* All classes option (only if multiple classes) */}
                {resultsByClass.length > 1 && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={() => downloadTranscript('all')}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 flex items-center gap-2 text-gray-700 hover:text-indigo-700"
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">All Classes Combined</div>
                        <div className="text-xs text-gray-500">{resultsByClass.length} classes • Full transcript</div>
                      </div>
                    </button>
                  </>
                )}
              </div>
            )}
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

        {!loading && currentClassResults.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Results for This Class
            </h3>
            <p className="text-sm text-gray-500">
              No graded exams found for {currentClass?.name || 'this class'}. Your results will appear here once your instructor grades your exams.
            </p>
          </div>
        )}

        {!loading && currentClassResults.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-black">
                Exam Results <span className="text-sm font-normal text-gray-500">({currentClassResults.length} {currentClassResults.length === 1 ? 'exam' : 'exams'})</span>
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
                    {currentClassResults.map(r => {
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
                {currentClassResults.map(r => {
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
