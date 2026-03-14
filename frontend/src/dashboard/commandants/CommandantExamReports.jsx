import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as LucideIcons from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState'
import Card from '../../components/Card'
import ModernDatePicker from '../../components/ModernDatePicker'
import StudentPerformanceTable from '../../components/StudentPerformanceTable'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const GRADE_COLORS = {
  'A':  { bg: 'bg-emerald-600', text: 'text-emerald-700', light: 'bg-emerald-50' },
  'A-': { bg: 'bg-emerald-400', text: 'text-emerald-600', light: 'bg-emerald-50' },
  'B+': { bg: 'bg-sky-600',     text: 'text-sky-700',     light: 'bg-sky-50' },
  'B':  { bg: 'bg-sky-500',     text: 'text-sky-700',     light: 'bg-sky-50' },
  'B-': { bg: 'bg-sky-400',     text: 'text-sky-600',     light: 'bg-sky-50' },
  'C+': { bg: 'bg-amber-600',   text: 'text-amber-700',   light: 'bg-amber-50' },
  'C':  { bg: 'bg-amber-500',   text: 'text-amber-700',   light: 'bg-amber-50' },
  'C-': { bg: 'bg-amber-400',   text: 'text-amber-600',   light: 'bg-amber-50' },
  'F':  { bg: 'bg-red-500',     text: 'text-red-700',     light: 'bg-red-50' },
}

function _gradeFromPct(pct) {
  const p = parseFloat(pct) || 0
  if (p >= 91) return 'A'
  if (p >= 86) return 'A-'
  if (p >= 81) return 'B+'
  if (p >= 76) return 'B'
  if (p >= 71) return 'B-'
  if (p >= 65) return 'C+'
  if (p >= 60) return 'C'
  if (p >= 50) return 'C-'
  return 'F'
}

const EXAM_TYPES = ['cat', 'final', 'project', 'quiz', 'midterm', 'assignment']

export default function CommandantExamReports() {
  const toast = useToast()
  const { user } = useAuth()

  // ── Filters ───────────────────────────────────────────────────────────────
  const [selectedClass,    setSelectedClass]    = useState('')
  const [selectedSubject,  setSelectedSubject]  = useState('')
  const [selectedExamType, setSelectedExamType] = useState('')
  const [dateRange,        setDateRange]        = useState({ start: '', end: '' })

  // ── Data ──────────────────────────────────────────────────────────────────
  const [classes,         setClasses]         = useState([])
  const [subjects,        setSubjects]        = useState([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [exams,           setExams]           = useState([])
  const [loadingExams,    setLoadingExams]    = useState(false)

  // ── Selected exam detail ──────────────────────────────────────────────────
  const [selectedExam,      setSelectedExam]      = useState(null)
  const [examDetail,        setExamDetail]        = useState(null)   // { exam, results, submitted, pending }
  const [loadingDetail,     setLoadingDetail]     = useState(false)
  const [resultsSearch,     setResultsSearch]     = useState('')
  const [resultsPage,       setResultsPage]       = useState(1)
  const resultsPerPage = 10

  // ── Comprehensive results ─────────────────────────────────────────────────
  const [showComprehensive,    setShowComprehensive]    = useState(false)
  const [comprehensiveData,    setComprehensiveData]    = useState(null)
  const [loadingComprehensive, setLoadingComprehensive] = useState(false)

  // ── Exam Reports & Remarks ────────────────────────────────────────────────
  const [examReports,        setExamReports]        = useState({})  // Map exam IDs to reports
  const [remarksModalOpen,   setRemarksModalOpen]   = useState(false)
  const remarksModalOpenRef = useRef(false)

  const [currentRemarksData, setCurrentRemarksData] = useState(null)
  const [newRemark,          setNewRemark]          = useState('')
  const [remarksLoading,     setRemarksLoading]     = useState(false)
  const [remarkSubmitting,   setRemarkSubmitting]   = useState(false)

  // ── Load classes on mount ─────────────────────────────────────────────────
  useEffect(() => {
    api.getCommandantClasses('page_size=1000')
      .then(d => setClasses(Array.isArray(d) ? d : (d?.results || [])))
      .catch(() => toast?.error?.('Failed to load classes'))
  }, [toast])

  // ── Load subjects when class changes ──────────────────────────────────────
  useEffect(() => {
    if (!selectedClass) { setSubjects([]); return }
    setLoadingSubjects(true)
    api.getCommandantClassSubjects(selectedClass)
      .then(d => setSubjects(d?.subjects || []))
      .catch(() => toast?.error?.('Failed to load subjects'))
      .finally(() => setLoadingSubjects(false))
  }, [selectedClass, toast])

  // ── Load exams when class/subject changes ─────────────────────────────────
  useEffect(() => {
    if (!selectedClass) { setExams([]); return }
    setLoadingExams(true)
    const params = selectedSubject
      ? `subject=${selectedSubject}&page_size=1000`
      : `subject__class_obj=${selectedClass}&page_size=1000`
    api.getExams(params)
      .then(d => setExams(Array.isArray(d) ? d : (d?.results || [])))
      .catch(() => toast?.error?.('Failed to load exams'))
      .finally(() => setLoadingExams(false))
  }, [selectedClass, selectedSubject, toast])

  // ── Load exam reports when class/subject changes ──────────────────────────
  useEffect(() => {
    if (!selectedClass) { setExamReports({}); return }
    setRemarksLoading(true)
    const params = selectedSubject
      ? `subject=${selectedSubject}&page_size=1000`
      : `class_obj=${selectedClass}&page_size=1000`
    api.getCommandantExamReports(params)
      .then(d => {
        const reports = Array.isArray(d) ? d : (d?.results || [])
        const reportsMap = {}
        reports.forEach(report => {
          // Map each exam ID in the report to the report
          if (report.exam_ids && Array.isArray(report.exam_ids)) {
            report.exam_ids.forEach(examId => {
              reportsMap[examId] = report
            })
          }
        })
        setExamReports(reportsMap)
      })
      .catch(() => {
        setExamReports({})
      })
      .finally(() => setRemarksLoading(false))
  }, [selectedClass, selectedSubject])

  // ── Reset comprehensive view when class changes ───────────────────────────

  // ── Load exam results when an exam is selected ────────────────────────────
  // Keep ref in sync so the exam-detail useEffect can check it without adding it to deps
  useEffect(() => { remarksModalOpenRef.current = remarksModalOpen }, [remarksModalOpen])

  useEffect(() => {
    if (!selectedExam) {
      setExamDetail(null)
      // Don't clear remarks data while the modal is open — that would close it mid-session
      if (!remarksModalOpenRef.current) setCurrentRemarksData(null)
      return
    }
    setLoadingDetail(true)
    
    // Load exam results
    api.getExamResults(selectedExam.id)
      .then(d => setExamDetail(d))
      .catch(() => toast?.error?.('Failed to load exam results'))
      .finally(() => setLoadingDetail(false))
    
    // Load exam report if it exists
    const report = examReports[selectedExam.id]
    if (report) {
      api.getCommandantExamReportDetail(report.id)
        .then(d => setCurrentRemarksData(d.report))
        .catch(() => {
          // Report exists but couldn't load details, use basic data
          setCurrentRemarksData(report)
        })
    } else {
      setCurrentRemarksData(null)
    }
  }, [selectedExam?.id, examReports, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset pagination/search when exam changes ─────────────────────────────
  useEffect(() => {
    setResultsPage(1)
    setResultsSearch('')
  }, [selectedExam])

  // Refresh remarks from the server each time the modal opens so remarks added
  // by the chief instructor (or anyone) are always visible to the commandant.
  // NOTE: do NOT call setExamReports here — that triggers another useEffect
  // (which depends on examReports) that resets currentRemarksData to null
  // when selectedExam is null, instantly closing the modal.
  useEffect(() => {
    if (!remarksModalOpen || !currentRemarksData?.id) return
    api.getCommandantExamReportDetail(currentRemarksData.id).then(d => {
      if (!d?.report) return
      setCurrentRemarksData(d.report)
    }).catch(() => {/* keep cached data on error */})
  }, [remarksModalOpen, currentRemarksData?.id])

  // ── Filter exams client-side by type + date ───────────────────────────────
  const filteredExams = useMemo(() => {
    return exams.filter(ex => {
      if (selectedExamType && ex.exam_type !== selectedExamType) return false
      if (dateRange.start && new Date(ex.exam_date) < new Date(dateRange.start)) return false
      if (dateRange.end   && new Date(ex.exam_date) > new Date(dateRange.end))   return false
      return ex.submission_count > 0 || (ex.average_score != null && ex.average_score > 0)
    })
  }, [exams, selectedExamType, dateRange])

  // ── Exams that have a report but no remark from the current user's role ───
  const myRole = user?.role || 'commandant'
  const pendingRemarkExams = useMemo(() =>
    filteredExams.filter(ex => {
      const report = examReports[ex.id]
      if (!report) return false
      return !report.remarks_list?.some(r => r.author_role === myRole)
    }),
    [filteredExams, examReports, myRole]
  )

  // ── Exam results processing ───────────────────────────────────────────────
  const examResults = useMemo(
    () => examDetail?.results || [],
    [examDetail]
  )

  const examStats = useMemo(() => {
    if (!examResults.length) return null
    const submitted = examResults.filter(r => r.is_submitted && r.marks_obtained != null)
    if (!submitted.length) return {
      total: examResults.length, submitted: 0, pending: examResults.length,
      average: '0.0', highest: '0.0', lowest: '0.0', passRate: '0.0',
      grades: { A: 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, F: 0 },
    }
    const totalMarks = selectedExam?.total_marks || 100
    const pcts = submitted.map(r =>
      r.percentage != null ? parseFloat(r.percentage) : (parseFloat(r.marks_obtained) / totalMarks) * 100
    )
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length
    const grades = { A: 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, F: 0 }
    pcts.forEach(p => { const g = _gradeFromPct(p); grades[g] = (grades[g] || 0) + 1 })
    return {
      total:    examResults.length,
      submitted: submitted.length,
      pending:  examResults.length - submitted.length,
      average:  avg.toFixed(1),
      highest:  Math.max(...pcts).toFixed(1),
      lowest:   Math.min(...pcts).toFixed(1),
      passRate: ((pcts.filter(p => p >= 50).length / submitted.length) * 100).toFixed(1),
      grades,
    }
  }, [examResults, selectedExam])

  // Graded results sorted by marks desc, then pending
  const sortedResults = useMemo(() => {
    const totalMarks = selectedExam?.total_marks || 100
    const submitted = examResults
      .filter(r => r.is_submitted && r.marks_obtained != null)
      .sort((a, b) => parseFloat(b.marks_obtained) - parseFloat(a.marks_obtained))
    const pending = examResults.filter(r => !r.is_submitted || r.marks_obtained == null)
    // Apply search
    const q = resultsSearch.toLowerCase()
    const filterFn = r =>
      !q ||
      (r.student_name || '').toLowerCase().includes(q) ||
      (r.student_svc_number || '').toLowerCase().includes(q)
    const allFiltered = [...submitted.filter(filterFn), ...pending.filter(filterFn)]
    return allFiltered.map(r => ({
      ...r,
      _pct: r.percentage != null ? parseFloat(r.percentage) : (parseFloat(r.marks_obtained) / totalMarks) * 100,
    }))
  }, [examResults, selectedExam, resultsSearch])

  const totalResultsPages = Math.ceil(sortedResults.length / resultsPerPage)
  const paginatedResults = useMemo(() => {
    const start = (resultsPage - 1) * resultsPerPage
    return sortedResults.slice(start, start + resultsPerPage)
  }, [sortedResults, resultsPage, resultsPerPage])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleViewReport = useCallback((exam) => {
    setSelectedExam(exam)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedExam(null)
  }, [])

  const handleViewRemarks = useCallback(async (examId) => {
    // Find the report for this exam
    const report = examReports[examId]
    if (!report) {
      toast?.error?.('No exam report found')
      return
    }
    
    setCurrentRemarksData(report)
    setRemarksModalOpen(true)
    setNewRemark('')
  }, [examReports, toast])

  const handleAddRemark = useCallback(async () => {
    if (!newRemark.trim()) {
      toast?.error?.('Remark cannot be empty')
      return
    }

    if (!currentRemarksData?.id) {
      toast?.error?.('Report not found')
      return
    }

    setRemarkSubmitting(true)
    try {
      await api.addCommandantExamReportRemark(currentRemarksData.id, newRemark)
      toast?.success?.('Remark added successfully')
      setNewRemark('')

      // Reload the current remarks
      const updatedReport = await api.getCommandantExamReportDetail(currentRemarksData.id)
      const report = updatedReport.report
      setCurrentRemarksData(report)
      // Sync back into examReports map so pending indicators update
      if (report?.exam_ids) {
        setExamReports(prev => {
          const next = { ...prev }
          report.exam_ids.forEach(id => { next[id] = report })
          return next
        })
      }
    } catch (err) {
      // Extract field-level errors (e.g. {"remark": ["..."]}) for a specific message
      const fieldError = err?.data?.remark
      const message = fieldError
        ? (Array.isArray(fieldError) ? fieldError[0] : fieldError)
        : (err?.message || 'Failed to add remark')
      toast?.error?.(message)
    } finally {
      setRemarkSubmitting(false)
    }
  }, [newRemark, currentRemarksData, toast])

  const handleViewComprehensive = useCallback(async () => {
    if (!selectedClass) return
    setLoadingComprehensive(true)
    try {
      const data = await api.getClassPerformanceSummary(selectedClass)
      if (data?.all_students) {
        data.all_students = data.all_students.map(student => {
          let totalObtained = 0, totalPossible = 0
          const mappedBreakdown = (student.subject_breakdown || []).map(subj => {
            totalObtained += subj.marks_obtained ?? 0
            totalPossible += subj.total_possible  ?? 0
            return subj
          })
          const finalObtained = student.total_marks_obtained ?? totalObtained
          const finalPossible = student.total_marks_possible ?? totalPossible
          const overallPct    = finalPossible > 0 ? (finalObtained / finalPossible) * 100 : 0
          return {
            ...student,
            subject_breakdown:    mappedBreakdown,
            total_marks_obtained: finalObtained,
            total_marks_possible: finalPossible,
            total_grade:          _gradeFromPct(overallPct),
            total_percentage:     overallPct,
          }
        })
      }
      setComprehensiveData(data)
      setShowComprehensive(true)
    } catch {
      toast?.error?.('Failed to load comprehensive results')
    } finally {
      setLoadingComprehensive(false)
    }
  }, [selectedClass, toast])

  const exportPDF = useCallback(() => {
    if (!selectedExam || !examResults.length) return toast?.error?.('No results to export')
    const totalMarks = selectedExam?.total_marks || 100
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const margin = 14
      let y = margin

      const checkPage = (needed = 10) => {
        if (y + needed > ph - 16) { doc.addPage(); y = margin }
      }

      // ── Header: clean white with bottom rule ────────────────────────────
      doc.setFillColor(248, 248, 250)
      doc.rect(0, 0, pw, 32, 'F')
      doc.setDrawColor(30, 30, 30); doc.setLineWidth(1.2)
      doc.line(margin, 32, pw - margin, 32)

      doc.setTextColor(15, 15, 15)
      doc.setFontSize(17); doc.setFont('helvetica', 'bold')
      doc.text('EXAM PERFORMANCE REPORT', pw / 2, 13, { align: 'center' })

      const reportTitle = currentRemarksData?.title || `${selectedExam.title || selectedExam.exam_type} Report`
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
      doc.text(reportTitle, pw / 2, 23, { align: 'center' })

      const reportDate = currentRemarksData?.report_date
        ? new Date(currentRemarksData.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      doc.setFontSize(7.5); doc.setTextColor(120, 120, 120)
      doc.text(reportDate, pw - margin, 23, { align: 'right' })
      y = 40

      // ── Prepared by (instructor) ─────────────────────────────────────────
      if (currentRemarksData?.created_by_name) {
        const rank   = currentRemarksData.created_by_rank       || 'N/A'
        const name   = currentRemarksData.created_by_name       || 'N/A'
        const svcNum = currentRemarksData.created_by_svc_number || 'N/A'
        doc.setFillColor(242, 242, 246); doc.setDrawColor(210, 210, 220); doc.setLineWidth(0.3)
        doc.roundedRect(margin, y, pw - margin * 2, 22, 2, 2, 'FD')
        // section label
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 110)
        doc.text('PREPARED BY', margin + 4, y + 9)
        // vertical divider
        doc.setDrawColor(200, 200, 210); doc.setLineWidth(0.3)
        doc.line(margin + 26, y + 2, margin + 26, y + 20)
        // three fields: SVC · Rank · Name
        const fields = [
          ['SVC No.', svcNum],
          ['Rank',    rank],
          ['Name',    name],
        ]
        const colW = (pw - margin * 2 - 28) / 3
        fields.forEach(([lbl, val], i) => {
          const fx = margin + 29 + i * colW
          doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 110)
          doc.text(lbl, fx, y + 8)
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15)
          doc.text(val, fx, y + 15)
        })
        y += 28
      }

      // ── Two-column exam info ─────────────────────────────────────────────
      const c1 = margin, c2 = pw / 2 + 4
      const infoLeft = [
        ['Exam:',      selectedExam.title || `${selectedExam.exam_type} — ${selectedExam.subject_name}`],
        ['Subject:',   selectedExam.subject_name || 'N/A'],
        ['Exam Date:', selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString() : 'N/A'],
      ]
      const infoRight = [
        ['Class:',       selectedExam.class_name || 'N/A'],
        ['Type:',        (selectedExam.exam_type || '').toUpperCase()],
        ['Total Marks:', String(totalMarks)],
      ]
      infoLeft.forEach(([lbl, val], i) => {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
        doc.text(lbl, c1, y + i * 6)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20)
        doc.text(val, c1 + 22, y + i * 6)
      })
      infoRight.forEach(([lbl, val], i) => {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
        doc.text(lbl, c2, y + i * 6)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20)
        doc.text(val, c2 + 20, y + i * 6)
      })
      y += infoLeft.length * 6 + 3

      // divider
      doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.3)
      doc.line(margin, y, pw - margin, y); y += 6

      // ── Stats row ────────────────────────────────────────────────────────
      if (examStats) {
        const stats = [
          { label: 'Total Students', value: examStats.total },
          { label: 'Submitted',      value: examStats.submitted },
          { label: 'Pass Rate',      value: `${examStats.passRate}%` },
          { label: 'Class Average',  value: `${examStats.average}%` },
        ]
        const boxW = (pw - margin * 2 - 6) / 4
        stats.forEach((s, i) => {
          const bx = margin + i * (boxW + 2)
          doc.setFillColor(245, 245, 248); doc.setDrawColor(210, 210, 220); doc.setLineWidth(0.3)
          doc.roundedRect(bx, y, boxW, 15, 2, 2, 'FD')
          doc.setTextColor(15, 15, 15)
          doc.setFontSize(12); doc.setFont('helvetica', 'bold')
          doc.text(String(s.value), bx + boxW / 2, y + 9, { align: 'center' })
          doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
          doc.text(s.label, bx + boxW / 2, y + 13.5, { align: 'center' })
        })
        y += 21
      }

      // ── Results table ────────────────────────────────────────────────────
      doc.setTextColor(15, 15, 15); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text('Student Results', margin, y); y += 2

      const tableData = examResults
        .filter(r => r.is_submitted && r.marks_obtained != null)
        .sort((a, b) => parseFloat(b.marks_obtained) - parseFloat(a.marks_obtained))
        .map((r, i) => {
          const pct = r.percentage != null ? parseFloat(r.percentage) : (parseFloat(r.marks_obtained) / totalMarks) * 100
          return [
            i + 1,
            r.student_svc_number || 'N/A',
            r.student_rank || 'N/A',
            r.student_name || 'Unknown',
            `${parseFloat(r.marks_obtained).toFixed(1)} / ${totalMarks}`,
            `${pct.toFixed(1)}%`,
            r.grade || _gradeFromPct(pct),
          ]
        })

      autoTable(doc, {
        startY: y,
        head: [['#', 'SVC No.', 'Rank', 'Name', 'Marks', '%', 'Grade']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 8,  halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return
          if (data.column.index === 6) {
            const g = data.cell.raw
            if (g === 'A' || g === 'A-') data.cell.styles.textColor = [5, 150, 105]
            else if (g === 'F')          data.cell.styles.textColor = [220, 38, 38]
          }
          if (data.column.index === 0) {
            const pos = parseInt(data.cell.raw)
            if (pos === 1)      data.cell.styles.textColor = [161, 98, 7]
            else if (pos === 2) data.cell.styles.textColor = [100, 116, 139]
            else if (pos === 3) data.cell.styles.textColor = [120, 53, 15]
          }
        },
        margin: { left: margin, right: margin },
      })
      y = doc.lastAutoTable.finalY + 10

      // ── Remarks section ──────────────────────────────────────────────────
      const roleOrder = { commandant: 0, chief_instructor: 1, instructor: 2 }
      const remarks = [...(currentRemarksData?.remarks_list || [])]
        .sort((a, b) => (roleOrder[a.author_role] ?? 3) - (roleOrder[b.author_role] ?? 3))
      if (remarks.length > 0) {
        checkPage(24)

        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15)
        doc.text('Official Remarks', margin, y)
        doc.setDrawColor(15, 15, 15); doc.setLineWidth(0.6)
        doc.line(margin, y + 2, pw - margin, y + 2)
        y += 8

        const roleAccent = {
          commandant:       [30,  30,  30],
          chief_instructor: [60,  60,  60],
          instructor:       [100, 100, 100],
        }
        const roleBg = {
          commandant:       [20,  20,  20],
          chief_instructor: [55,  55,  55],
          instructor:       [90,  90,  90],
        }

        remarks.forEach((remark) => {
          const rankAndName = [remark.author_rank, remark.author_name].filter(Boolean).join(' ')
          const svcLine = remark.author_svc_number ? `SVC: ${remark.author_svc_number}` : ''
          const lines = doc.splitTextToSize(remark.remark || '', pw - margin * 2 - 10)
          const cardH = 8 + 6 + lines.length * 4.5 + 5
          checkPage(cardH + 4)

          const rc  = roleAccent[remark.author_role] || [90, 90, 90]
          const bgc = roleBg[remark.author_role]     || [90, 90, 90]

          // card bg
          doc.setFillColor(250, 250, 252); doc.setDrawColor(215, 215, 225); doc.setLineWidth(0.25)
          doc.roundedRect(margin, y, pw - margin * 2, cardH, 2, 2, 'FD')
          // left accent
          doc.setFillColor(...rc)
          doc.rect(margin, y, 3, cardH, 'F')

          // rank + name (bold, dark)
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15)
          doc.text(rankAndName || 'Unknown', margin + 7, y + 6.5)

          // role badge (dark pill)
          const roleLabel = remark.author_role_display || remark.author_role || ''
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold')
          const badgeW = doc.getTextWidth(roleLabel) + 6
          doc.setFillColor(...bgc)
          doc.roundedRect(pw - margin - badgeW, y + 2.5, badgeW, 5.5, 1.5, 1.5, 'F')
          doc.setTextColor(255, 255, 255)
          doc.text(roleLabel, pw - margin - badgeW / 2, y + 6.3, { align: 'center' })

          // svc + date (muted row)
          doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130)
          const datePart = new Date(remark.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          const meta = [svcLine, datePart].filter(Boolean).join('   ·   ')
          doc.text(meta, margin + 7, y + 12.5)

          // remark body
          doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(35, 35, 35)
          doc.text(lines, margin + 6, y + 19)

          y += cardH + 4
        })
      }

      // ── Signature block ──────────────────────────────────────────────────
      checkPage(36)
      y += 6
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3)
      doc.line(margin, y, pw - margin, y)
      y += 8
      const sigX = [margin, pw / 2 + 4]
      const sigLabels = ["Commandant's Signature", "Chief Instructor's Signature"]
      sigX.forEach((x, i) => {
        doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3)
        doc.line(x, y + 12, x + 62, y + 12)
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
        doc.text(sigLabels[i], x, y + 17)
        doc.text('Date: _______________', x, y + 23)
      })

      // ── Page footer ──────────────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p)
        doc.setFontSize(7); doc.setTextColor(160, 160, 160); doc.setFont('helvetica', 'normal')
        doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2)
        doc.line(margin, ph - 10, pw - margin, ph - 10)
        doc.text(`Generated: ${new Date().toLocaleString()}`, margin, ph - 6)
        doc.text(`Page ${p} of ${totalPages}`, pw - margin, ph - 6, { align: 'right' })
      }

      const fileName = (selectedExam.title || `${selectedExam.exam_type}_${selectedExam.subject_name}`)
        .replace(/[^a-z0-9]/gi, '_')
      doc.save(`${fileName}_Report_${new Date().toISOString().split('T')[0]}.pdf`)
      toast?.success?.('PDF exported successfully')
    } catch (err) {
      console.error(err)
      toast?.error?.('Failed to export PDF')
    }
  }, [selectedExam, examResults, examStats, currentRemarksData, toast])

  const clearFilters = useCallback(() => {
    setSelectedSubject('')
    setSelectedExamType('')
    setDateRange({ start: '', end: '' })
  }, [])

  // ─────────────────────────────────────────────────────────────────────────

  // ── Comprehensive view ────────────────────────────────────────────────────
  if (showComprehensive && comprehensiveData) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-black">Exam Reports</h2>
        </header>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowComprehensive(false); setComprehensiveData(null) }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition"
          >
            <LucideIcons.ArrowLeft className="w-4 h-4" />Back to Reports
          </button>
        </div>
        <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
          <StudentPerformanceTable
            students={comprehensiveData.all_students || []}
            title={classes.find(c => String(c.id) === selectedClass)?.name || 'Comprehensive Results'}
          />
        </section>
      </div>
    )
  }

  // ── Exam detail view ──────────────────────────────────────────────────────
  if (selectedExam) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition"
            >
              <LucideIcons.ArrowLeft className="w-4 h-4" />Back to Exams
            </button>
            <h2 className="text-2xl font-semibold text-black">Exam Results</h2>
          </div>
          <button
            onClick={exportPDF}
            disabled={!examResults.length}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            <LucideIcons.FileDown className="w-4 h-4" />Export PDF
          </button>
        </header>

        {/* Exam header */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full capitalize ${
              selectedExam.exam_type === 'final' ? 'bg-purple-100 text-purple-700' :
              selectedExam.exam_type === 'cat'   ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>{selectedExam.exam_type || 'Exam'}</span>
          </div>
          {selectedExam.title && (
            <h3 className="text-lg font-bold text-black mb-1">{selectedExam.title}</h3>
          )}
          {selectedExam.description && (
            <p className="text-neutral-600 text-sm mb-3">{selectedExam.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
            <span className="flex items-center gap-1"><LucideIcons.BookOpen className="w-4 h-4" />{selectedExam.subject_name || 'N/A'}</span>
            <span className="flex items-center gap-1"><LucideIcons.School className="w-4 h-4" />{selectedExam.class_name || 'N/A'}</span>
            <span className="flex items-center gap-1"><LucideIcons.Calendar className="w-4 h-4" />
              {selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString() : 'N/A'}
            </span>
            <span className="flex items-center gap-1"><LucideIcons.Hash className="w-4 h-4" />
              Total Marks: {selectedExam.total_marks ?? '—'}
            </span>
          </div>
        </div>

        {loadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : examStats ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <Card title="Total"     value={examStats.total}              icon="Users"           accent="bg-indigo-500"  colored />
              <Card title="Submitted" value={examStats.submitted}          icon="CheckCircle"     accent="bg-emerald-500" colored />
              <Card title="Pending"   value={examStats.pending}            icon="Clock"           accent="bg-amber-500"   colored />
              <Card title="Average"   value={`${examStats.average}%`}      icon="TrendingUp"      accent="bg-indigo-600"  colored />
              <Card title="Highest"   value={`${examStats.highest}%`}      icon="ArrowUpCircle"   accent="bg-emerald-500" colored />
              <Card title="Lowest"    value={`${examStats.lowest}%`}       icon="ArrowDownCircle" accent="bg-pink-500"    colored />
              <Card title="Pass Rate" value={`${examStats.passRate}%`}     icon="Award"           accent="bg-sky-500"     colored />
            </div>

            {/* Grade distribution bar */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4 md:p-6">
              <h3 className="text-base font-semibold text-black mb-4">Grade Distribution</h3>
              <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                {Object.entries(examStats.grades).map(([grade, count]) => {
                  const pct = examStats.submitted > 0 ? (count / examStats.submitted) * 100 : 0
                  if (pct === 0) return null
                  const c = GRADE_COLORS[grade] || { bg: 'bg-neutral-400' }
                  return (
                    <div key={grade} className={`${c.bg} flex items-center justify-center text-white text-xs font-bold`}
                      style={{ width: `${pct}%` }} title={`${grade}: ${count} (${pct.toFixed(1)}%)`}>
                      {pct > 8 && grade}
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-9 gap-1 md:gap-2">
                {Object.entries(examStats.grades).map(([grade, count]) => {
                  const pct = examStats.submitted > 0 ? ((count / examStats.submitted) * 100).toFixed(1) : 0
                  const c   = GRADE_COLORS[grade] || { text: 'text-neutral-700', light: 'bg-neutral-50' }
                  return (
                    <div key={grade} className={`${c.light} rounded-lg p-2 text-center`}>
                      <div className={`text-lg font-bold ${c.text}`}>{grade}</div>
                      <div className="text-xs text-neutral-600 mt-0.5">{count} <span className="hidden sm:inline">({pct}%)</span></div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Results table */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="p-4 border-b border-neutral-200 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-base font-semibold text-black">Student Results</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">{examStats.submitted} submitted · {examStats.pending} pending</p>
                </div>
                <div className="relative w-64">
                  <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={resultsSearch}
                    onChange={e => { setResultsSearch(e.target.value); setResultsPage(1) }}
                    placeholder="Search by name or SVC…"
                    className="w-full pl-10 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">S/No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">SVC Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Marks</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Percentage</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Grade</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {paginatedResults.map((r, idx) => {
                      const submitted = r.is_submitted && r.marks_obtained != null
                      const pct = submitted ? r._pct.toFixed(1) : null
                      const grade = r.grade || (submitted ? _gradeFromPct(r._pct) : null)
                      const gradeColor = GRADE_COLORS[grade] || {}
                      const rowNum = (resultsPage - 1) * resultsPerPage + idx + 1
                      return (
                        <tr key={idx} className={`hover:bg-neutral-50 transition ${!submitted ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3 text-sm text-neutral-500">{submitted ? rowNum : '—'}</td>
                          <td className="px-4 py-3 text-sm text-neutral-600">{r.student_svc_number || 'N/A'}</td>
                          <td className="px-4 py-3 text-sm text-neutral-600">{r.student_rank || 'N/A'}</td>
                          <td className="px-4 py-3 font-medium text-black">{r.student_name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-black">
                            {submitted ? `${parseFloat(r.marks_obtained).toFixed(1)} / ${selectedExam.total_marks || '—'}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {submitted ? (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-neutral-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${r._pct >= 76 ? 'bg-green-500' : r._pct >= 60 ? 'bg-blue-500' : r._pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min(r._pct, 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-black">{pct}%</span>
                              </div>
                            ) : <span className="text-neutral-400 text-sm">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {grade
                              ? <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full ${gradeColor.light || 'bg-gray-100'} ${gradeColor.text || 'text-gray-700'}`}>{grade}</span>
                              : <span className="text-neutral-400 text-sm">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {r.is_submitted
                              ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><LucideIcons.CheckCircle className="w-3 h-3" />Submitted</span>
                              : <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><LucideIcons.Clock className="w-3 h-3" />Pending</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-neutral-200">
                {paginatedResults.map((r, idx) => {
                  const submitted = r.is_submitted && r.marks_obtained != null
                  const pct = submitted ? r._pct.toFixed(1) : null
                  const grade = r.grade || (submitted ? _gradeFromPct(r._pct) : null)
                  const gradeColor = GRADE_COLORS[grade] || {}
                  return (
                    <div key={idx} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-medium text-black text-sm">{r.student_name}</div>
                          <div className="text-xs text-neutral-500">{r.student_rank} · {r.student_svc_number}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {grade && <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full ${gradeColor.light || 'bg-gray-100'} ${gradeColor.text || 'text-gray-700'}`}>{grade}</span>}
                          {r.is_submitted
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><LucideIcons.CheckCircle className="w-3 h-3" />Done</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><LucideIcons.Clock className="w-3 h-3" />Pending</span>}
                        </div>
                      </div>
                      {submitted ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r._pct >= 76 ? 'bg-green-500' : r._pct >= 60 ? 'bg-blue-500' : r._pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(r._pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-black w-32 text-right">
                            {parseFloat(r.marks_obtained).toFixed(1)} / {selectedExam.total_marks} ({pct}%)
                          </span>
                        </div>
                      ) : <p className="text-xs text-neutral-400">No results recorded</p>}
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalResultsPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-neutral-200 flex-wrap gap-3">
                  <p className="text-sm text-neutral-700">
                    Showing <span className="font-semibold text-black">{(resultsPage - 1) * resultsPerPage + 1}</span>–<span className="font-semibold text-black">{Math.min(resultsPage * resultsPerPage, sortedResults.length)}</span> of <span className="font-semibold text-black">{sortedResults.length}</span> results
                  </p>
                  <nav className="inline-flex items-center gap-1">
                    {/* Prev */}
                    <button
                      onClick={() => setResultsPage(p => Math.max(1, p - 1))}
                      disabled={resultsPage === 1}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <LucideIcons.ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Page numbers */}
                    {(() => {
                      const pages = []
                      const delta = 1 // siblings on each side
                      const left  = Math.max(2, resultsPage - delta)
                      const right = Math.min(totalResultsPages - 1, resultsPage + delta)

                      // Always first page
                      pages.push(1)
                      if (left > 2) pages.push('...')
                      for (let i = left; i <= right; i++) pages.push(i)
                      if (right < totalResultsPages - 1) pages.push('...')
                      if (totalResultsPages > 1) pages.push(totalResultsPages)

                      return pages.map((page, i) =>
                        page === '...' ? (
                          <span key={`dots-${i}`} className="inline-flex items-center justify-center w-8 h-8 text-sm text-neutral-500">…</span>
                        ) : (
                          <button
                            key={page}
                            onClick={() => setResultsPage(page)}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-md border text-sm font-medium transition ${
                              resultsPage === page
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-white border-neutral-300 text-neutral-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700'
                            }`}
                          >
                            {page}
                          </button>
                        )
                      )
                    })()}

                    {/* Next */}
                    <button
                      onClick={() => setResultsPage(p => Math.min(totalResultsPages, p + 1))}
                      disabled={resultsPage === totalResultsPages}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <LucideIcons.ChevronRight className="w-4 h-4" />
                    </button>
                  </nav>
                </div>
              )}
            </div>

            {/* Remarks Section */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="p-4 md:p-6 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <LucideIcons.MessageSquare className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-semibold text-black">Exam Remarks</h3>
                  {currentRemarksData?.remarks_list && currentRemarksData.remarks_list.length > 0 && (
                    <span className="ml-auto bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full">
                      {currentRemarksData.remarks_list.length}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mt-1">
                  {currentRemarksData ? 'Add remarks or view previous annotations' : 'No exam report created yet'}
                </p>
              </div>

              {currentRemarksData ? (
                <div className="p-4 md:p-6 space-y-4">
                  {/* Existing Remarks */}
                  {currentRemarksData.remarks_list && currentRemarksData.remarks_list.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-700 mb-3">Previous Remarks</h4>
                      <div className="space-y-3 mb-6 max-h-64 overflow-y-auto border border-neutral-100 rounded-lg p-3 bg-neutral-50">
                        {currentRemarksData.remarks_list.map((remark, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-neutral-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="font-medium text-sm text-black">{remark.author_name}</div>
                                  {remark.author_rank && <div className="text-xs text-neutral-500">{remark.author_rank}</div>}
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                remark.author_role === 'commandant' ? 'bg-purple-100 text-purple-700' :
                                remark.author_role === 'chief_instructor' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {remark.author_role_display || remark.author_role}
                              </span>
                            </div>
                            <p className="text-sm text-neutral-600 mb-2 whitespace-pre-wrap">{remark.remark}</p>
                            <div className="text-xs text-neutral-500">
                              {new Date(remark.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add Remark Form */}
                  <div className="border-t border-neutral-200 pt-4">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Add New Remark</label>
                    <textarea
                      value={newRemark}
                      onChange={(e) => setNewRemark(e.target.value)}
                      placeholder="Enter your remark about this exam…"
                      rows={4}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-black"
                    />
                    <div className="flex gap-3 justify-end mt-3">
                      <button
                        onClick={handleAddRemark}
                        disabled={remarkSubmitting || !newRemark.trim() || !currentRemarksData}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {remarkSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <LucideIcons.Send size={16} />
                            Submit Remark
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 md:p-6 text-center">
                  <div className="bg-neutral-50 rounded-lg p-4">
                    <LucideIcons.AlertCircle className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                    <p className="text-sm text-neutral-600">
                      A report must be created for this exam before remarks can be added.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : examDetail ? (
          <EmptyState icon={LucideIcons.ClipboardList} title="No submissions yet" description="No students have submitted results for this exam." />
        ) : null}
      </div>
    )
  }

  // ── Main list view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-black">Exam Reports</h2>
          <p className="text-sm text-gray-500">Comprehensive exam analysis and student performance</p>
        </div>
        {selectedClass && (
          <button
            onClick={handleViewComprehensive}
            disabled={loadingComprehensive}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {loadingComprehensive
              ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              : <LucideIcons.ClipboardList className="w-4 h-4" />}
            {loadingComprehensive ? 'Loading…' : 'Comprehensive Results'}
          </button>
        )}
      </header>

      {/* Filters */}
      <div className={`bg-white rounded-xl shadow-sm border p-4 ${!selectedClass ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-neutral-200'}`}>
        <div className="flex items-center gap-2 mb-4">
          <LucideIcons.Filter className="w-5 h-5 text-neutral-500" />
          <h3 className="font-medium text-black">Filters</h3>
          {(selectedSubject || selectedExamType || dateRange.start || dateRange.end) && (
            <button onClick={clearFilters} className="ml-auto text-xs text-indigo-600 hover:underline">
              Clear all filters
            </button>
          )}
          {!selectedClass && (
            <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full animate-pulse">
              Select a class to view exams
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Class */}
          <div>
            <label className={`flex items-center gap-1 text-sm mb-1 ${!selectedClass ? 'text-indigo-700 font-medium' : 'text-neutral-600'}`}>
              <LucideIcons.School className="w-4 h-4" />Class
            </label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setSelectedSubject(''); setSelectedExamType('') }}
              className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 ${!selectedClass ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-neutral-200'}`}
            >
              <option value="">Select a class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {/* Subject */}
          <div>
            <label className="flex items-center gap-1 text-sm text-neutral-600 mb-1">
              <LucideIcons.BookOpen className="w-4 h-4" />Subject
            </label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              disabled={!selectedClass || loadingSubjects}
              className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 ${!selectedClass ? 'bg-gray-100 cursor-not-allowed' : ''} border-neutral-200`}
            >
              <option value="">
                {!selectedClass ? 'Select class first…' : loadingSubjects ? 'Loading…' : 'All Subjects'}
              </option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.subject_code || 'N/A'})</option>
              ))}
            </select>
          </div>
          {/* Exam Type */}
          <div>
            <label className="flex items-center gap-1 text-sm text-neutral-600 mb-1">
              <LucideIcons.Tag className="w-4 h-4" />Exam Type
            </label>
            <select
              value={selectedExamType}
              onChange={e => setSelectedExamType(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Types</option>
              {EXAM_TYPES.map(t => (
                <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          {/* Date range */}
          <ModernDatePicker label="From Date" value={dateRange.start} onChange={v => setDateRange(p => ({ ...p, start: v }))} placeholder="Select start date" />
          <ModernDatePicker label="To Date"   value={dateRange.end}   onChange={v => setDateRange(p => ({ ...p, end: v }))}   placeholder="Select end date" />
        </div>
      </div>

      {/* Exam list */}
      {!selectedClass ? (
        <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl border-2 border-dashed border-indigo-200 p-8 md:p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LucideIcons.FileText className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">Select a Class to View Exam Reports</h3>
            <p className="text-sm md:text-base text-gray-600">
              Choose a class from the dropdown above to view exams, analyse student performance, and generate detailed reports.
            </p>
          </div>
        </div>
      ) : loadingExams ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : filteredExams.length === 0 ? (
        <EmptyState icon={LucideIcons.FileText} title="No exams found" description="No exams with results match your current filters." />
      ) : (
        <>
        {pendingRemarkExams.length > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
              <LucideIcons.AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {pendingRemarkExams.length} exam{pendingRemarkExams.length > 1 ? 's' : ''} pending your remark
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Reports have been submitted but you have not yet added your remark.
              </p>
            </div>
            <span className="flex-shrink-0 bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {pendingRemarkExams.length}
            </span>
          </div>
        )}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-neutral-200">
            {filteredExams.map(ex => {
              const isPending = pendingRemarkExams.some(p => p.id === ex.id)
              const report = examReports[ex.id]
              return (
              <div key={ex.id} className={`p-4 transition ${isPending ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-neutral-50'}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                        ex.exam_type === 'final' ? 'bg-purple-100 text-purple-700' :
                        ex.exam_type === 'cat'   ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{ex.exam_type || 'Exam'}</span>
                      {ex.average_score != null && (
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          Avg: {parseFloat(ex.average_score).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    {ex.title && <p className="font-semibold text-black text-sm">{ex.title}</p>}
                    <p className="text-sm text-neutral-600">{ex.subject_name || 'N/A'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-lg font-bold text-indigo-700">{ex.total_marks ?? '—'}</div>
                    <div className="text-[10px] text-indigo-500 font-medium">marks</div>
                  </div>
                </div>
                <div className="text-sm text-neutral-600 mb-2 flex items-center gap-3">
                  <span className="flex items-center gap-1"><LucideIcons.Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    {ex.exam_date ? new Date(ex.exam_date).toLocaleDateString() : 'N/A'}
                  </span>
                  <span className="text-neutral-400">·</span>
                  <span>{ex.submission_count ?? 0} submitted</span>
                </div>
                {/* Remarks status row */}
                <div className="mb-3">
                  {report ? (
                    isPending ? (
                      <button
                        onClick={() => handleViewRemarks(ex.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg border border-amber-300"
                      >
                        <LucideIcons.AlertCircle className="w-3.5 h-3.5" />
                        Pending Remark
                      </button>
                    ) : (
                      <button
                        onClick={() => handleViewRemarks(ex.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200"
                      >
                        <LucideIcons.CheckCircle className="w-3.5 h-3.5" />
                        {report.remarks_list?.length || 0} Remarks
                      </button>
                    )
                  ) : (
                    <span className="text-neutral-400 text-xs italic">No report yet</span>
                  )}
                </div>
                <button
                  onClick={() => handleViewReport(ex)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition shadow-sm"
                >
                  <LucideIcons.Eye className="w-4 h-4" />View Report
                </button>
              </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Exam</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Marks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Avg Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Remarks</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredExams.map(ex => (
                  <tr key={ex.id} className={`transition ${pendingRemarkExams.some(p => p.id === ex.id) ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-neutral-50'}`}>
                    <td className="px-4 py-4">
                      {ex.title && <div className="font-medium text-black">{ex.title}</div>}
                      {ex.description && <div className="text-xs text-neutral-500 truncate max-w-xs">{ex.description}</div>}
                      {!ex.title && <div className="text-neutral-500 text-sm capitalize">{ex.exam_type} exam</div>}
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-700">{ex.subject_name || 'N/A'}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${
                        ex.exam_type === 'final' ? 'bg-purple-100 text-purple-700' :
                        ex.exam_type === 'cat'   ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{ex.exam_type || '—'}</span>
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-700">
                      {ex.exam_date ? new Date(ex.exam_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-black">{ex.total_marks ?? '—'}</td>
                    <td className="px-4 py-4 text-sm">
                      {ex.average_score != null
                        ? <span className="font-medium text-indigo-600">{parseFloat(ex.average_score).toFixed(1)}%</span>
                        : <span className="text-neutral-400">--</span>}
                    </td>
                    <td className="px-4 py-4">
                      {examReports[ex.id] ? (
                        pendingRemarkExams.some(p => p.id === ex.id) ? (
                          <button
                            onClick={() => handleViewRemarks(ex.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100 transition border border-amber-300"
                          >
                            <LucideIcons.AlertCircle className="w-3.5 h-3.5" />
                            Pending Remark
                          </button>
                        ) : (
                          <button
                            onClick={() => handleViewRemarks(ex.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition border border-emerald-200"
                          >
                            <LucideIcons.CheckCircle className="w-3.5 h-3.5" />
                            {examReports[ex.id].remarks_list?.length || 0} Remarks
                          </button>
                        )
                      ) : (
                        <span className="text-neutral-400 text-xs italic">No report yet</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => handleViewReport(ex)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
                      >
                        <LucideIcons.Eye className="w-4 h-4" />View Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Remarks Modal */}
      {remarksModalOpen && currentRemarksData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setRemarksModalOpen(false); setCurrentRemarksData(null) }} />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-black">Exam Remarks</h2>
              <button
                onClick={() => { setRemarksModalOpen(false); setCurrentRemarksData(null) }}
                className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition"
                aria-label="Close"
              >
                <LucideIcons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Report Info */}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 mb-4">
                <h3 className="text-sm font-semibold text-neutral-700 mb-3">Report Context</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-neutral-600 mb-1">Subject</div>
                    <div className="text-sm font-semibold text-black">{currentRemarksData.subject_name}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-neutral-600 mb-1">Class</div>
                    <div className="text-sm font-semibold text-black">{currentRemarksData.class_name}</div>
                  </div>
                </div>
              </div>

              {/* Existing Remarks */}
              <div>
                <h4 className="font-semibold text-black mb-3">Remarks History</h4>
                {currentRemarksData.remarks_list && currentRemarksData.remarks_list.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {currentRemarksData.remarks_list.map((remark, idx) => (
                      <div key={idx} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                        <div className="flex items-start justify-between mb-1">
                          <div className="font-medium text-sm text-black">{remark.author_name}</div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            remark.author_role === 'commandant' ? 'bg-purple-100 text-purple-700' :
                            remark.author_role === 'chief_instructor' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {remark.author_role_display || remark.author_role}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mb-2">{remark.remark}</p>
                        <div className="text-xs text-neutral-500">
                          {new Date(remark.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500 py-4 text-center">No remarks yet</p>
                )}
              </div>

              {/* Add Remark Form */}
              <div className="border-t border-neutral-200 pt-4 mt-4">
                <label className="block text-sm font-medium text-neutral-700 mb-2">Add New Remark</label>
                <textarea
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  placeholder="Enter your remark..."
                  rows={4}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-black"
                />
                <div className="flex gap-3 justify-end mt-3">
                  <button
                    onClick={() => { setRemarksModalOpen(false); setCurrentRemarksData(null) }}
                    disabled={remarkSubmitting}
                    className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-medium hover:bg-neutral-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleAddRemark}
                    disabled={remarkSubmitting || !newRemark.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {remarkSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <LucideIcons.Send size={16} />
                        Submit Remark
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
