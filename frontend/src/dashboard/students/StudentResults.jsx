import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QK } from '../../lib/queryKeys'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import useTheme from '../../hooks/useTheme'
import * as api from '../../lib/api'
import { Download, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Filter } from 'lucide-react'

export default function StudentResults() {
  const { user } = useAuth()
  const toast = useToast()
  const { theme } = useTheme()
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [viewMode, setViewMode] = useState('table') // 'table' or 'cards'
  const [showTranscriptMenu, setShowTranscriptMenu] = useState(false)
  const transcriptMenuRef = useRef(null)
  const [transcriptClasses, setTranscriptClasses] = useState([])


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

  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
    queryKey: QK.studentEnrollments(),
    queryFn: async () => {
      const res = await api.getStudentEnrollments()
      return Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : []
    },
    enabled: !!user,
  })

  const { data: results = [], isLoading: loading, error } = useQuery({
    queryKey: QK.studentResults(selectedClassId),
    queryFn: async () => {
      const params = {}
      if (selectedClassId !== 'all') {
        params.class_id = selectedClassId
      }
      const res = await api.getMyResults(params)
      return Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : []
    },
    enabled: !!user,
  })

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

  // Mirrors the backend ExamResult.grade property exactly
  function toLetterGrade(pct) {
    if (pct == null) return '—'
    if (pct >= 91) return 'A'
    if (pct >= 86) return 'A-'
    if (pct >= 81) return 'B+'
    if (pct >= 76) return 'B'
    if (pct >= 71) return 'B-'
    if (pct >= 65) return 'C+'
    if (pct >= 60) return 'C'
    if (pct >= 50) return 'C-'
    return 'F'
  }

  function getGradeColor(grade) {
    if (grade === 'A' || grade === 'A-') return 'bg-green-100 text-green-800 border-green-200'
    if (grade === 'B+' || grade === 'B' || grade === 'B-') return 'bg-blue-100 text-blue-800 border-blue-200'
    if (grade === 'C+' || grade === 'C' || grade === 'C-') return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    if (grade === 'F') return 'bg-red-100 text-red-800 border-red-200'
    return 'bg-gray-100 text-gray-600 border-gray-200'
  }

  function getPerformanceIndicator(pct) {
    if (pct == null) return null
    if (pct >= 91) return { icon: TrendingUp, color: 'text-green-600', label: 'Excellent' }
    if (pct >= 86) return { icon: TrendingUp, color: 'text-green-500', label: 'Very Good' }
    if (pct >= 81) return { icon: TrendingUp, color: 'text-blue-600', label: 'Good' }
    if (pct >= 76) return { icon: TrendingUp, color: 'text-blue-500', label: 'Good' }
    if (pct >= 71) return { icon: Minus, color: 'text-indigo-500', label: 'Above Average' }
    if (pct >= 65) return { icon: Minus, color: 'text-yellow-600', label: 'Average' }
    if (pct >= 60) return { icon: Minus, color: 'text-orange-500', label: 'Pass' }
    if (pct >= 50) return { icon: TrendingDown, color: 'text-orange-600', label: 'Pass' }
    return { icon: TrendingDown, color: 'text-red-600', label: 'Fail' }
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
    switch ((grade || '').trim()) {
      case 'A':  return [22, 163, 74]   // green-600
      case 'A-': return [34, 197, 94]   // green-500
      case 'B+': return [37, 99, 235]   // blue-600
      case 'B':  return [59, 130, 246]  // blue-500
      case 'B-': return [99, 102, 241]  // indigo-500
      case 'C+': return [202, 138, 4]   // yellow-600
      case 'C':  return [234, 179, 8]   // yellow-500
      case 'C-': return [234, 88, 12]   // orange-600
      case 'F':  return [220, 38, 38]   // red-600
      default:   return [107, 114, 128] // gray-500
    }
  }

  // Download transcript for a specific class or all classes
  async function downloadTranscript(transcriptClassId = null) {
    setShowTranscriptMenu(false)
    const sourceClasses =
      transcriptClasses.length ? transcriptClasses : resultsByClass

    let rows = []
    let transcriptResultsByClass = []

    if (transcriptClassId === 'all') {
      transcriptResultsByClass = sourceClasses
      rows = sourceClasses.flatMap(c => c.results)
    } else if (transcriptClassId) {
      const group = sourceClasses.find(
        g => String(g.classId) === String(transcriptClassId)
      )
      if (group) {
        transcriptResultsByClass = [group]
        rows = group.results
      }
    } else if (currentClass?.id) {
      const group = sourceClasses.find(
        g => String(g.classId) === String(currentClass.id)
      )
      if (group) {
        transcriptResultsByClass = [group]
        rows = group.results
      }
    }

    if (!rows.length) {
      toast?.error?.('No results to download for the selected class.')
      return
    }

    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      // Get school theme from context (already loaded at login)
      const schoolName = theme.school_name || 'School Management System'
      const schoolShortName = theme.school_short_name || ''
      const schoolLogoUrl = theme.logo_url || null

      // Helper: load any image URL as base64
      const getImageBase64 = url => new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });

      // Load school logo (prefer school logo from theme, fallback to ka.png)
      let logoBase64 = null;
      const logoUrl = schoolLogoUrl || '/ka.png';
      try { logoBase64 = await getImageBase64(logoUrl); } catch {}
      // Always try ka.png as background watermark
      let bgLogoBase64 = null;
      try { bgLogoBase64 = await getImageBase64('/ka.png'); } catch {}

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

      // Draw ka.png as a centred watermark on every page (applied in drawFooter pass)
      function drawBackground() {
        if (!bgLogoBase64) return
        const bgSize = 280
        doc.saveGraphicsState()
        doc.setGState(new doc.GState({ opacity: 0.06 }))
        doc.addImage(bgLogoBase64, 'PNG', (pageWidth - bgSize) / 2, (pageHeight - bgSize) / 2, bgSize, bgSize)
        doc.restoreGraphicsState()
      }

      // ── HEADER ──────────────────────────────────────────────────────────
      // Returns the Y position where content should start after the header
      function drawHeader(classLabel) {
        // White page background strip
        doc.setFillColor(255, 255, 255)
        doc.rect(0, 0, pageWidth, pageHeight, 'F')

        let y = 22

        // Logo
        if (logoBase64) {
          const logoSize = 72
          doc.addImage(logoBase64, 'PNG', (pageWidth - logoSize) / 2, y, logoSize, logoSize)
          y += logoSize + 20
        }

        // School full name
        doc.setFont(undefined, 'bold')
        doc.setFontSize(16)
        doc.setTextColor(15, 15, 15)
        doc.text(schoolName, pageWidth / 2, y, { align: 'center' })
        y += 18

        // Short name
        if (schoolShortName) {
          doc.setFont(undefined, 'normal')
          doc.setFontSize(11)
          doc.setTextColor(60, 60, 60)
          doc.text(`(${schoolShortName})`, pageWidth / 2, y, { align: 'center' })
          y += 14
        }

        // Decorative double rule
        doc.setDrawColor(30, 30, 30)
        doc.setLineWidth(1.5)
        doc.line(margin, y, pageWidth - margin, y)
        doc.setLineWidth(0.4)
        doc.line(margin, y + 3, pageWidth - margin, y + 3)
        y += 26

        // "ACADEMIC TRANSCRIPT" title
        doc.setFont(undefined, 'bold')
        doc.setFontSize(13)
        doc.setTextColor(15, 15, 15)
        doc.text('ACADEMIC TRANSCRIPT', pageWidth / 2, y, { align: 'center' })
        y += 14

        // Class / course label
        if (classLabel) {
          doc.setFont(undefined, 'normal')
          doc.setFontSize(10)
          doc.setTextColor(70, 70, 70)
          doc.text(classLabel, pageWidth / 2, y, { align: 'center' })
          y += 10
        }

        // Bottom rule of header
        doc.setDrawColor(30, 30, 30)
        doc.setLineWidth(0.4)
        doc.line(margin, y, pageWidth - margin, y)
        y += 12

        return y
      }

      // ── STUDENT INFO BOX ─────────────────────────────────────────────────
      function drawStudentInfo(startY, classLabel, subjectCount) {
        const boxH = 52
        const innerPad = 10
        doc.setFillColor(247, 247, 247)
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.5)
        doc.roundedRect(margin, startY, pageWidth - 2 * margin, boxH, 3, 3, 'FD')

        const col = (pageWidth - 2 * margin) / 3
        const rows2 = [
          [
            { label: 'Service No:', value: studentSvc || '—' },
            { label: 'Name:', value: studentName },
            { label: 'Date:', value: generatedDate }
          ],
          [
            { label: 'Rank:', value: studentRank || '—' },
            { label: 'Class:', value: classLabel || '—' },
            { label: 'Subjects:', value: subjectCount != null ? String(subjectCount) : '—' }
          ]
        ]

        let rowY = startY + innerPad + 8
        for (const row of rows2) {
          let cx = margin + innerPad
          for (let ci = 0; ci < row.length; ci++) {
            const { label, value } = row[ci]
            doc.setFont(undefined, 'bold')
            doc.setFontSize(9)
            doc.setTextColor(80, 80, 80)
            doc.text(label, cx, rowY)
            doc.setFont(undefined, 'normal')
            doc.setFontSize(9)
            doc.setTextColor(15, 15, 15)
            doc.text(value, cx + doc.getTextWidth(label) + 3, rowY)
            cx += col
          }
          rowY += 14
        }

        return startY + boxH + 10
      }

      // ── RESULTS TABLE ────────────────────────────────────────────────────
      function drawResultsTable(startY, classResults) {
        const totals = calculateTotals(classResults)
        const meanPct = totals.percentage != null ? Number(totals.percentage).toFixed(2) : '—'
        const overallGrade = totals.percentage != null ? toLetterGrade(totals.percentage) : '—'

        const body = classResults.map(r => {
          const subjectCode = r.subject_code || '—'
          const subjectName = r.subject_name || (r.exam && r.exam.subject && (r.exam.subject.name || r.exam.subject)) || '—'
          const pct = r.percentage != null ? Number(r.percentage).toFixed(0) : '—'
          const grade = r.percentage != null ? toLetterGrade(r.percentage) : '—'
          return [subjectCode, subjectName, pct, grade]
        })

        autoTable(doc, {
          head: [['Subject Code', 'Subject Title', 'Marks %', 'Grade']],
          body,
          foot: [['', 'Overall Grade :', meanPct, overallGrade]],
          showFoot: 'lastPage',
          startY,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 10,
            cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
            lineColor: [210, 210, 210],
            lineWidth: 0.4,
            textColor: [20, 20, 20]
          },
          headStyles: {
            fillColor: [30, 30, 30],
            textColor: [255, 255, 255],
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }
          },
          footStyles: {
            fillColor: [235, 235, 235],
            textColor: [10, 10, 10],
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 90, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 'auto', halign: 'left' },
            2: { cellWidth: 68, halign: 'center' },
            3: { cellWidth: 52, halign: 'center', fontStyle: 'bold', fontSize: 11 }
          },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          didParseCell(data) {
            if (data.section === 'body' && data.column.index === 3) {
              data.cell.styles.textColor = getGradeColorForPDF(data.cell.text[0])
            }
            if (data.section === 'foot') {
              if (data.column.index === 1) data.cell.styles.halign = 'right'
            }
          }
        })

        return doc.lastAutoTable.finalY + 14
      }

      // ── GRADE KEY ─────────────────────────────────────────────────────────
      function drawGradeKey(startY) {
        const grades = [
          { g: 'A',  range: '91 – 100', label: 'Excellent'     },
          { g: 'A-', range: '86 – 90',  label: 'Very Good'     },
          { g: 'B+', range: '81 – 85',  label: 'Good'          },
          { g: 'B',  range: '76 – 80',  label: 'Good'          },
          { g: 'B-', range: '71 – 75',  label: 'Above Average' },
          { g: 'C+', range: '65 – 70',  label: 'Average'       },
          { g: 'C',  range: '60 – 64',  label: 'Pass'          },
          { g: 'C-', range: '50 – 59',  label: 'Pass'          },
          { g: 'F',  range: '0 – 49',   label: 'Fail'          },
        ]

        // Separator rule
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.4)
        doc.line(margin, startY, pageWidth - margin, startY)
        let y = startY + 14

        // Title
        doc.setFont(undefined, 'bold')
        doc.setFontSize(9)
        doc.setTextColor(30, 30, 30)
        doc.text('KEY TO GRADING SYSTEM', pageWidth / 2, y, { align: 'center' })
        y += 10

        // Draw a two-column grid: 5 grades left, 4 grades right
        const colW = (pageWidth - 2 * margin) / 2
        const colGap = 10
        const leftX  = margin
        const rightX = margin + colW + colGap
        const cellH  = 16
        const leftGrades  = grades.slice(0, 5)
        const rightGrades = grades.slice(5)

        // Column headers
        const drawColHeader = (x, w) => {
          doc.setFillColor(30, 30, 30)
          doc.rect(x, y, w - colGap / 2, cellH, 'F')
          doc.setFont(undefined, 'bold')
          doc.setFontSize(8)
          doc.setTextColor(255, 255, 255)
          const gradeX    = x + 14
          const rangeX    = x + 38
          const remarksX  = x + 90
          doc.text('Grade',   gradeX,   y + 10, { align: 'center' })
          doc.text('Range',   rangeX + 12, y + 10, { align: 'center' })
          doc.text('Remarks', remarksX + 20, y + 10, { align: 'center' })
        }
        drawColHeader(leftX,  colW)
        drawColHeader(rightX, colW)
        y += cellH

        // Draw grade rows for a column
        const drawColRows = (items, x, colWidth) => {
          items.forEach((k, i) => {
            const rowY = y + i * cellH
            const fill = i % 2 === 0 ? [248, 248, 248] : [255, 255, 255]
            doc.setFillColor(...fill)
            doc.setDrawColor(210, 210, 210)
            doc.setLineWidth(0.3)
            doc.rect(x, rowY, colWidth - colGap / 2, cellH, 'FD')

            const gradeX   = x + 14
            const rangeX   = x + 38
            const remarksX = x + 90

            // Grade letter (coloured)
            doc.setFont(undefined, 'bold')
            doc.setFontSize(9)
            doc.setTextColor(...getGradeColorForPDF(k.g))
            doc.text(k.g, gradeX, rowY + 10, { align: 'center' })

            // Range
            doc.setFont(undefined, 'normal')
            doc.setFontSize(8)
            doc.setTextColor(40, 40, 40)
            doc.text(k.range, rangeX + 12, rowY + 10, { align: 'center' })

            // Remarks
            doc.setFont(undefined, 'normal')
            doc.setFontSize(8)
            doc.setTextColor(60, 60, 60)
            doc.text(k.label, remarksX + 20, rowY + 10, { align: 'center' })
          })
        }

        drawColRows(leftGrades,  leftX,  colW)
        drawColRows(rightGrades, rightX, colW)

        const tallestCol = Math.max(leftGrades.length, rightGrades.length)
        return y + tallestCol * cellH + 14
      }

      // ── FOOTER (page numbers + watermark, applied last) ─────────────────
      function finalisePages(classInfo) {
        const pageCount = doc.internal.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i)
          drawBackground()

          // thin rule above footer
          doc.setDrawColor(200, 200, 200)
          doc.setLineWidth(0.4)
          doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28)

          doc.setFont(undefined, 'normal')
          doc.setFontSize(8)
          doc.setTextColor(120, 120, 120)
          const left = classInfo ? `${schoolName}  —  ${classInfo}` : schoolName
          doc.text(left, margin, pageHeight - 16)
          doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 16, { align: 'right' })
        }
      }

      // ── GENERATION ───────────────────────────────────────────────────────
      if (transcriptClassId === 'all' && transcriptResultsByClass.length > 1) {
        let isFirst = true
        for (const cg of transcriptResultsByClass) {
          if (!isFirst) doc.addPage()
          const classLabel = `${cg.className}${cg.courseName ? ` — ${cg.courseName}` : ''}`
          let yPos = drawHeader(classLabel)
          yPos = drawStudentInfo(yPos, classLabel, cg.results.length)
          yPos = drawResultsTable(yPos, cg.results)
          drawGradeKey(yPos)
          isFirst = false
        }

        // Summary page
        doc.addPage()
        let yPos = drawHeader('Overall Summary — All Classes')
        yPos = drawStudentInfo(yPos, 'All Classes', rows.length)
        yPos += 8

        const classSummaryBody = transcriptResultsByClass.map(cg => {
          const t = calculateTotals(cg.results)
          return [
            `${cg.className}${cg.courseName ? ` (${cg.courseName})` : ''}`,
            String(cg.results.length),
            t.percentage != null ? `${Number(t.percentage).toFixed(1)}%` : '—',
            t.percentage != null ? toLetterGrade(t.percentage) : '—'
          ]
        })
        const overallT = calculateTotals(rows)
        const overallMean = overallT.percentage != null ? `${Number(overallT.percentage).toFixed(1)}%` : '—'
        const overallG = overallT.percentage != null ? toLetterGrade(overallT.percentage) : '—'

        autoTable(doc, {
          head: [['Class / Course', 'Subjects', 'Mean %', 'Grade']],
          body: classSummaryBody,
          foot: [['', 'Overall :', overallMean, overallG]],
          showFoot: 'lastPage',
          startY: yPos,
          margin: { left: margin, right: margin },
          styles: { fontSize: 10, cellPadding: 6, lineColor: [210, 210, 210], lineWidth: 0.4 },
          headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
          footStyles: { fillColor: [235, 235, 235], textColor: [10, 10, 10], fontStyle: 'bold', halign: 'center' },
          columnStyles: {
            0: { cellWidth: 'auto', fontStyle: 'bold' },
            1: { cellWidth: 60, halign: 'center' },
            2: { cellWidth: 70, halign: 'center' },
            3: { cellWidth: 52, halign: 'center', fontStyle: 'bold' }
          },
          didParseCell(data) {
            if (data.section === 'body' && data.column.index === 3)
              data.cell.styles.textColor = getGradeColorForPDF(data.cell.text[0])
            if (data.section === 'foot' && data.column.index === 1)
              data.cell.styles.halign = 'right'
          }
        })
        drawGradeKey(doc.lastAutoTable.finalY + 14)
        finalisePages('All Classes')

      } else {
        // Single class
        const cg = transcriptResultsByClass[0]
        const classLabel = cg ? `${cg.className}${cg.courseName ? ` — ${cg.courseName}` : ''}` : null
        let yPos = drawHeader(classLabel)
        yPos = drawStudentInfo(yPos, classLabel, rows.length)
        yPos = drawResultsTable(yPos, rows)
        drawGradeKey(yPos)
        finalisePages(classLabel)
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
              onClick={async () =>{
                if (!showTranscriptMenu) {
                  try{
                    const resAll = await api.getMyResults({ show_all: true })
                    const all = Array.isArray(resAll)
                     ? resAll : Array.isArray(resAll?.results)
                      ? resAll.results : []

                      const groups = {}
                      for (const r of all) {
                        const classId = r.class_id
                        if (!groups[classId]) {
                          groups[classId] = {
                            classId,
                            className: r.class_name || 'Unnamed Class',
                            courseName: r.course_name || null,
                            results: []
                          }
                        }
                        groups[classId].results.push(r)
                      
                      }
                      setTranscriptClasses(Object.values(groups))
                  } catch {
                    setTranscriptClasses(resultsByClass

                    )
                  }
                }
                setShowTranscriptMenu(v => !v)
              }}
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
                {(transcriptClasses.length ? transcriptClasses : resultsByClass).filter(g => String(g.classId) !== String(currentClass?.id)).map(classGroup => (
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
                {(transcriptClasses.length || resultsByClass.length) > 1 && (
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
                      const grade = r.percentage != null ? toLetterGrade(r.percentage) : '—'
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
