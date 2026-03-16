import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as LucideIcons from 'lucide-react'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'
import ModernDatePicker from '../../components/ModernDatePicker'
import StudentPerformanceTable from '../../components/StudentPerformanceTable'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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

/**
 * Pagination Component
 */
function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const getPageNumbers = () => {
    const pages = []
    const showPages = 5 // Number of page buttons to show

    if (totalPages <= showPages) {
      // Show all pages if total is less than showPages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      let startPage = Math.max(2, currentPage - 1)
      let endPage = Math.min(totalPages - 1, currentPage + 1)

      // Adjust if at the start
      if (currentPage <= 3) {
        startPage = 2
        endPage = showPages - 1
      }

      // Adjust if at the end
      if (currentPage >= totalPages - 2) {
        startPage = totalPages - (showPages - 2)
        endPage = totalPages - 1
      }

      // Add ellipsis after first page if needed
      if (startPage > 2) {
        pages.push('...')
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i)
      }

      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        pages.push('...')
      }

      // Always show last page
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-neutral-200 sm:px-6">
      <div className="flex justify-between items-center w-full sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="relative inline-flex items-center px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-sm text-neutral-700">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="relative inline-flex items-center px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-700">
            Page <span className="font-medium">{currentPage}</span> of{' '}
            <span className="font-medium">{totalPages}</span>
          </p>
        </div>
        <div>
          <nav className="inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-2 py-2 text-neutral-400 rounded-l-md border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LucideIcons.ChevronLeft className="w-5 h-5" />
            </button>

            {getPageNumbers().map((page, idx) => (
              page === '...' ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300"
                >
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`relative inline-flex items-center px-4 py-2 text-sm font-medium border ${
                    currentPage === page
                      ? 'z-10 bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {page}
                </button>
              )
            ))}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-2 py-2 text-neutral-400 rounded-r-md border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LucideIcons.ChevronRight className="w-5 h-5" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  )
}

/**
 * Detailed Exam Reports - Comprehensive exam report views for admins and instructors
 * Features:
 * - Class-based exam overview
 * - Individual exam result analysis
 * - Grade distribution charts
 * - Student performance rankings
 * - Export capabilities
 */
export default function ExamReports() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  // State
  
  // Filters
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExamType, setSelectedExamType] = useState('')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  
  // Selected exam for detail view
  const [selectedExam, setSelectedExam] = useState(null)

  // Comprehensive results
  const [showComprehensive, setShowComprehensive] = useState(false)
  const [comprehensiveData, setComprehensiveData] = useState(null)
  const [loadingComprehensive, setLoadingComprehensive] = useState(false)

  // Pagination state
  const [examListPage, setExamListPage] = useState(1)
  const [resultsPage, setResultsPage] = useState(1)
  const [resultsSearchTerm, setResultsSearchTerm] = useState('')
  const examsPerPage = 10
  const resultsPerPage = 10

  // Exam report (for remarks in the detail view)
  const [examReport, setExamReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [newRemark, setNewRemark] = useState('')
  const [remarkSubmitting, setRemarkSubmitting] = useState(false)

  // Create exam report modal state
  const [showCreateReportModal, setShowCreateReportModal] = useState(false)
  const [creatingReport, setCreatingReport] = useState(false)
  const [selectedExamForReport, setSelectedExamForReport] = useState(null)
  const [reportForm, setReportForm] = useState({
    title: '',
    description: '',
  })

  // Fetch initial data with React Query (cached 5 min)
  const { data: examsQueryData, isPending: loadingExams } = useQuery({
    queryKey: ['exams', isAdmin],
    queryFn: () => isAdmin ? api.getExams() : api.getMyExams(),
  })
  const { data: classesQueryData } = useQuery({
    queryKey: ['classes', 'active', isAdmin],
    queryFn: () => isAdmin ? api.getAllClasses() : api.getMyClasses(),
    staleTime: 10 * 60 * 1000,
  })
  const { data: subjectsQueryData } = useQuery({
    queryKey: ['subjects', 'active', isAdmin],
    queryFn: () => isAdmin ? api.getAllSubjects() : api.getMySubjects(),
    staleTime: 10 * 60 * 1000,
  })

  const loading = loadingExams
  const exams = Array.isArray(examsQueryData) ? examsQueryData : (examsQueryData?.results ?? [])
  const classes = Array.isArray(classesQueryData) ? classesQueryData : (classesQueryData?.results ?? [])
  const subjects = Array.isArray(subjectsQueryData) ? subjectsQueryData : (subjectsQueryData?.results ?? [])

  // Filter exams based on selections
  const filteredExams = useMemo(() => {
    // Don't show any exams if no class is selected
    if (!selectedClass) return []

    return exams.filter(exam => {
      // Class filter is required
      if (exam.subject_class_id !== parseInt(selectedClass) && exam.class_id !== parseInt(selectedClass)) {
        // Try matching via subject
        const subj = subjects.find(s => s.id === exam.subject || s.id === exam.subject_id)
        if (!subj || subj.class_obj !== parseInt(selectedClass)) return false
      }
      if (selectedSubject && exam.subject !== parseInt(selectedSubject) && exam.subject_id !== parseInt(selectedSubject)) return false
      if (selectedExamType && exam.exam_type !== selectedExamType) return false
      if (dateRange.start && new Date(exam.exam_date) < new Date(dateRange.start)) return false
      if (dateRange.end && new Date(exam.exam_date) > new Date(dateRange.end)) return false

      // Only show exams that have results
      return exam.submission_count > 0 || (exam.average_score != null && exam.average_score > 0)
    })
  }, [exams, selectedClass, selectedSubject, selectedExamType, dateRange, subjects])

  // Reset exam list page when filters change (must be outside useMemo)
  useEffect(() => {
    setExamListPage(1)
  }, [selectedClass, selectedSubject, selectedExamType, dateRange])

  // Paginated exams for list view
  const paginatedExams = useMemo(() => {
    const startIndex = (examListPage - 1) * examsPerPage
    const endIndex = startIndex + examsPerPage
    return filteredExams.slice(startIndex, endIndex)
  }, [filteredExams, examListPage, examsPerPage])

  const totalExamPages = Math.ceil(filteredExams.length / examsPerPage)

  // Subjects filtered by selected class
  const filteredSubjects = useMemo(() => {
    if (!selectedClass) return subjects
    return subjects.filter(s => s.class_obj === parseInt(selectedClass) || s.class_id === parseInt(selectedClass))
  }, [subjects, selectedClass])

  // Load exam results when an exam is selected (cached per exam)
  const { data: examResultsData, isPending: loadingResults } = useQuery({
    queryKey: ['exam-results', selectedExam?.id],
    queryFn: () => api.getExamResults(selectedExam.id),
    enabled: !!selectedExam,
    staleTime: 5 * 60 * 1000,
  })
  const examResults = examResultsData
    ? (Array.isArray(examResultsData) ? examResultsData : (examResultsData?.results ?? []))
    : []

  // Calculate statistics for selected exam
  const examStats = useMemo(() => {
    if (!examResults.length) return null
    
    const submittedResults = examResults.filter(r => r.is_submitted && r.marks_obtained != null)
    if (!submittedResults.length) return { total: examResults.length, submitted: 0, pending: examResults.length }
    
    const marks = submittedResults.map(r => parseFloat(r.marks_obtained))
    const totalMarks = selectedExam?.total_marks || 100
    const percentages = marks.map(m => (m / totalMarks) * 100)
    
    const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length
    const highest = Math.max(...percentages)
    const lowest = Math.min(...percentages)
    
    // Grade distribution
    const grades = { A: 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, F: 0 }
    percentages.forEach(p => {
      if (p >= 91) grades.A++
      else if (p >= 86) grades['A-']++
      else if (p >= 81) grades['B+']++
      else if (p >= 76) grades.B++
      else if (p >= 71) grades['B-']++
      else if (p >= 65) grades['C+']++
      else if (p >= 60) grades.C++
      else if (p >= 50) grades['C-']++
      else grades.F++
    })
    
    return {
      total: examResults.length,
      submitted: submittedResults.length,
      pending: examResults.length - submittedResults.length,
      average: avg.toFixed(1),
      highest: highest.toFixed(1),
      lowest: lowest.toFixed(1),
      passRate: ((percentages.filter(p => p >= 50).length / submittedResults.length) * 100).toFixed(1),
      grades
    }
  }, [examResults, selectedExam])

  // Sorted results by marks with search filter
  const sortedResults = useMemo(() => {
    const submitted = examResults.filter(r => r.is_submitted && r.marks_obtained != null)

    // Apply search filter
    const filtered = resultsSearchTerm
      ? submitted.filter(r =>
          r.student_name?.toLowerCase().includes(resultsSearchTerm.toLowerCase()) ||
          r.student_svc_number?.toLowerCase().includes(resultsSearchTerm.toLowerCase())
        )
      : submitted

    return filtered.sort((a, b) => parseFloat(b.marks_obtained) - parseFloat(a.marks_obtained))
  }, [examResults, resultsSearchTerm])

  // Pending results (ungraded students)
  const pendingResults = useMemo(() => {
    return examResults.filter(r => !r.is_submitted || r.marks_obtained == null)
  }, [examResults])

  // Combined results: graded first (ranked), then pending
  const allResults = useMemo(() => {
    return [...sortedResults, ...pendingResults]
  }, [sortedResults, pendingResults])

  // Total pages based on ALL results (graded + pending)
  const totalResultsPages = Math.ceil(allResults.length / resultsPerPage)

  // Paginated results for detail view (from combined list)
  const paginatedResults = useMemo(() => {
    const startIndex = (resultsPage - 1) * resultsPerPage
    const endIndex = startIndex + resultsPerPage
    return allResults.slice(startIndex, endIndex)
  }, [allResults, resultsPage, resultsPerPage])

  // Reset results page and search when exam changes
  useEffect(() => {
    setResultsPage(1)
    setResultsSearchTerm('')
  }, [selectedExam])

  // Get grade color
  const getGradeColor = (grade) => {
    const colors = {
      'A':  'bg-green-100 text-green-800',
      'A-': 'bg-green-100 text-green-700',
      'B+': 'bg-blue-100 text-blue-800',
      'B':  'bg-blue-100 text-blue-700',
      'B-': 'bg-blue-100 text-blue-600',
      'C+': 'bg-yellow-100 text-yellow-800',
      'C':  'bg-yellow-100 text-yellow-700',
      'C-': 'bg-yellow-100 text-yellow-600',
      'F':  'bg-red-100 text-red-800',
    }
    return colors[grade] || 'bg-gray-100 text-gray-800'
  }

  // Get exam type badge color
  const getExamTypeBadge = (type) => {
    const colors = {
      cat: 'bg-blue-100 text-blue-700',
      final: 'bg-purple-100 text-purple-700',
      project: 'bg-green-100 text-green-700'
    }
    return colors[type] || 'bg-gray-100 text-gray-700'
  }

  // Check if exam has any results
  const hasExamResults = useCallback((exam) => {
    return exam.submission_count > 0 || (exam.average_score != null && exam.average_score > 0)
  }, [])

  // Handle viewing an exam report - with validation
  const handleViewReport = useCallback((exam) => {
    if (!hasExamResults(exam)) {
      toast?.error?.('This exam has no results to display')
      return
    }
    setSelectedExam(exam)
    setExamReport(null)
    setNewRemark('')
    setLoadingReport(true)
    api.getExamReportByExam(exam.id)
      .then(d => setExamReport(d))
      .catch(() => setExamReport(null))
      .finally(() => setLoadingReport(false))
  }, [hasExamResults, toast])

  // Handle adding a remark to the exam report
  const handleAddRemark = useCallback(async () => {
    if (!newRemark.trim()) { toast?.error?.('Remark cannot be empty'); return }
    if (!examReport?.id) { toast?.error?.('No report found for this exam'); return }
    setRemarkSubmitting(true)
    try {
      await api.addExamReportRemark(examReport.id, newRemark)
      toast?.success?.('Remark submitted successfully')
      setNewRemark('')
      const updated = await api.getExamReportByExam(selectedExam.id)
      setExamReport(updated)
    } catch (err) {
      const fieldError = err?.data?.remark
      toast?.error?.(fieldError
        ? (Array.isArray(fieldError) ? fieldError[0] : fieldError)
        : (err?.message || 'Failed to submit remark'))
    } finally {
      setRemarkSubmitting(false)
    }
  }, [newRemark, examReport, selectedExam, toast])

  // Calculate percentage
  const calcPercentage = useCallback((marks, total) => {
    if (!marks || !total) return 0
    return ((parseFloat(marks) / total) * 100).toFixed(1)
  }, [])

  // Get grade from percentage
  const getGrade = useCallback((pct) => {
    const p = parseFloat(pct)
    if (p >= 91) return 'A'
    if (p >= 86) return 'A-'
    if (p >= 81) return 'B+'
    if (p >= 76) return 'B'
    if (p >= 71) return 'B-'
    if (p >= 65) return 'C+'
    if (p >= 60) return 'C'
    if (p >= 50) return 'C-'
    return 'F'
  }, [])

  // Reset comprehensive view when class changes
  useEffect(() => {
    setShowComprehensive(false)
    setComprehensiveData(null)
  }, [selectedClass])

  // Load comprehensive results for selected class
  const handleViewComprehensive = useCallback(async () => {
    if (!selectedClass) return
    setLoadingComprehensive(true)
    try {
      const data = await api.getClassPerformanceSummary(selectedClass)
      // Map fields to match StudentPerformanceTable expectations
      if (data?.all_students) {
        data.all_students = data.all_students.map(student => {
          // Compute total marks from subject breakdown
          let totalObtained = 0
          let totalPossible = 0
          const mappedBreakdown = (student.subject_breakdown || []).map(subj => {
            totalObtained += subj.marks_obtained ?? 0
            totalPossible += subj.total_possible ?? 0
            return subj
          })
          const finalObtained = student.total_marks_obtained ?? totalObtained
          const finalPossible = student.total_marks_possible ?? totalPossible
          const overallPct = finalPossible > 0 ? (finalObtained / finalPossible) * 100 : 0
          return {
            ...student,
            subject_breakdown: mappedBreakdown,
            total_marks_obtained: finalObtained,
            total_marks_possible: finalPossible,
            total_grade: _gradeFromPct(overallPct),
            total_percentage: overallPct,
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

  // Open create report modal for specific exam
  const handleOpenCreateReportModal = useCallback((exam) => {
    setSelectedExamForReport(exam)
    setReportForm({
      title: `${exam.title || exam.exam_type} Report`,
      description: '',
    })
    setShowCreateReportModal(true)
  }, [])

  // Handle creating a new exam report
  const handleCreateReport = useCallback(async () => {
    if (!reportForm.title.trim()) {
      toast?.error?.('Report title is required')
      return
    }
    if (!selectedExamForReport) {
      toast?.error?.('Exam not selected')
      return
    }

    setCreatingReport(true)
    try {
      const subject = subjects.find(s => s.id === (selectedExamForReport.subject || selectedExamForReport.subject_id))
      let examClass = classes.find(c => c.id === selectedExamForReport.subject_class_id || c.id === selectedExamForReport.class_id)
      
      // Fallback: find class by name if direct ID lookup fails
      if (!examClass && selectedExamForReport.class_name) {
        examClass = classes.find(c => c.name === selectedExamForReport.class_name)
      }
      
      if (!subject || !examClass) {
        toast?.error?.('Could not determine subject or class')
        return
      }

      const payload = {
        title: reportForm.title.trim(),
        description: reportForm.description.trim(),
        subject: subject.id,
        class_obj: examClass.id,
        exams: [selectedExamForReport.id],
      }
      
      await api.createExamReport(payload)
      toast?.success?.('Exam report created successfully')
      setShowCreateReportModal(false)
      setSelectedExamForReport(null)
      setReportForm({ title: '', description: '' })
    } catch (err) {
      toast?.error?.(err?.message || 'Failed to create exam report')
    } finally {
      setCreatingReport(false)
    }
  }, [reportForm, selectedExamForReport, subjects, classes, toast])

  // Export PDF — polished format matching CommandantExamReports
  const exportResultsPDF = useCallback(() => {
    if (!selectedExam || !sortedResults.length) {
      toast?.error?.('No graded results to export')
      return
    }
    const totalMarks = selectedExam.total_marks || 100
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const margin = 14
      let y = margin

      const checkPage = (needed = 10) => {
        if (y + needed > ph - 16) { doc.addPage(); y = margin }
      }

      // ── Header ──────────────────────────────────────────────────────────────
      doc.setFillColor(248, 248, 250)
      doc.rect(0, 0, pw, 32, 'F')
      doc.setDrawColor(30, 30, 30); doc.setLineWidth(1.2)
      doc.line(margin, 32, pw - margin, 32)

      doc.setTextColor(15, 15, 15)
      doc.setFontSize(17); doc.setFont('helvetica', 'bold')
      doc.text('EXAM PERFORMANCE REPORT', pw / 2, 13, { align: 'center' })

      const reportTitle = examReport?.title || `${selectedExam.title || selectedExam.exam_type} Report`
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
      doc.text(reportTitle, pw / 2, 23, { align: 'center' })

      const reportDate = examReport?.report_date
        ? new Date(examReport.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      doc.setFontSize(7.5); doc.setTextColor(120, 120, 120)
      doc.text(reportDate, pw - margin, 23, { align: 'right' })
      y = 40

      // ── Prepared by ─────────────────────────────────────────────────────────
      const preparedBy = examReport?.created_by_name || user?.full_name || user?.username
      if (preparedBy) {
        const rank   = examReport?.created_by_rank       || 'N/A'
        const name   = preparedBy
        const svcNum = examReport?.created_by_svc_number || 'N/A'
        doc.setFillColor(242, 242, 246); doc.setDrawColor(210, 210, 220); doc.setLineWidth(0.3)
        doc.roundedRect(margin, y, pw - margin * 2, 22, 2, 2, 'FD')
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 110)
        doc.text('PREPARED BY', margin + 4, y + 9)
        doc.setDrawColor(200, 200, 210); doc.setLineWidth(0.3)
        doc.line(margin + 26, y + 2, margin + 26, y + 20)
        const fields = [['SVC No.', svcNum], ['Rank', rank], ['Name', name]]
        const colW = (pw - margin * 2 - 28) / 3
        fields.forEach(([lbl, val], i) => {
          const fx = margin + 29 + i * colW
          doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 110)
          doc.text(lbl, fx, y + 8)
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15)
          doc.text(String(val), fx, y + 15)
        })
        y += 28
      }

      // ── Two-column exam info ─────────────────────────────────────────────────
      const c1 = margin, c2 = pw / 2 + 4
      const infoLeft = [
        ['Exam:',      selectedExam.title || `${selectedExam.exam_type}`],
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

      doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.3)
      doc.line(margin, y, pw - margin, y); y += 6

      // ── Stats row ────────────────────────────────────────────────────────────
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

      // ── Results table ────────────────────────────────────────────────────────
      doc.setTextColor(15, 15, 15); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
      doc.text('Student Results', margin, y); y += 2

      const tableData = sortedResults.map((r, i) => {
        const pct = parseFloat(calcPercentage(r.marks_obtained, totalMarks))
        return [
          i + 1,
          r.student_svc_number || 'N/A',
          r.student_rank || 'N/A',
          r.student_name || 'Unknown',
          `${parseFloat(r.marks_obtained).toFixed(1)} / ${totalMarks}`,
          `${pct.toFixed(1)}%`,
          r.grade || getGrade(pct),
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

      // ── Remarks section ──────────────────────────────────────────────────────
      const roleOrder = { commandant: 0, chief_instructor: 1, instructor: 2 }
      const remarks = [...(examReport?.remarks_list || [])]
        .sort((a, b) => (roleOrder[a.author_role] ?? 3) - (roleOrder[b.author_role] ?? 3))

      if (remarks.length > 0) {
        checkPage(24)
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15)
        doc.text('Official Remarks', margin, y)
        doc.setDrawColor(15, 15, 15); doc.setLineWidth(0.6)
        doc.line(margin, y + 2, pw - margin, y + 2)
        y += 8

        const roleAccent = { commandant: [30, 30, 30], chief_instructor: [60, 60, 60], instructor: [100, 100, 100] }
        const roleBg     = { commandant: [20, 20, 20], chief_instructor: [55, 55, 55], instructor: [90, 90, 90] }

        remarks.forEach((remark) => {
          const rankAndName = [remark.author_rank, remark.author_name].filter(Boolean).join(' ')
          const svcLine = remark.author_svc_number ? `SVC: ${remark.author_svc_number}` : ''
          const lines = doc.splitTextToSize(remark.remark || '', pw - margin * 2 - 10)
          const cardH = 8 + 6 + lines.length * 4.5 + 5
          checkPage(cardH + 4)

          const rc  = roleAccent[remark.author_role] || [90, 90, 90]
          const bgc = roleBg[remark.author_role]     || [90, 90, 90]

          doc.setFillColor(250, 250, 252); doc.setDrawColor(215, 215, 225); doc.setLineWidth(0.25)
          doc.roundedRect(margin, y, pw - margin * 2, cardH, 2, 2, 'FD')
          doc.setFillColor(...rc)
          doc.rect(margin, y, 3, cardH, 'F')

          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 15)
          doc.text(rankAndName || 'Unknown', margin + 7, y + 6.5)

          const roleLabel = remark.author_role_display || remark.author_role || ''
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold')
          const badgeW = doc.getTextWidth(roleLabel) + 6
          doc.setFillColor(...bgc)
          doc.roundedRect(pw - margin - badgeW, y + 2.5, badgeW, 5.5, 1.5, 1.5, 'F')
          doc.setTextColor(255, 255, 255)
          doc.text(roleLabel, pw - margin - badgeW / 2, y + 6.3, { align: 'center' })

          doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130)
          const datePart = new Date(remark.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          const meta = [svcLine, datePart].filter(Boolean).join('   ·   ')
          doc.text(meta, margin + 7, y + 12.5)

          doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(35, 35, 35)
          doc.text(lines, margin + 6, y + 19)

          y += cardH + 4
        })
      }

      // ── Signature block ──────────────────────────────────────────────────────
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

      // ── Page footer ──────────────────────────────────────────────────────────
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
    } catch (error) {
      console.error('PDF export error:', error)
      toast?.error?.('Failed to export PDF: ' + (error.message || 'Unknown error'))
    }
  }, [selectedExam, sortedResults, examStats, examReport, user, calcPercentage, getGrade, toast])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading exam reports...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Exam Reports</h1>
          <p className="text-neutral-600 mt-1">Comprehensive exam analysis and student performance reports</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Comprehensive Results button - visible when class selected, no exam selected, not in comprehensive view */}
          {selectedClass && !selectedExam && !showComprehensive && (() => {
            // Only show for admins/superadmins/commandants, or if instructor is the class instructor
            const cls = classes.find(c => String(c.id) === selectedClass)
            const canViewComprehensive = ['admin', 'superadmin', 'commandant'].includes(user?.role)
              || (cls && cls.instructor === user?.id)
            return canViewComprehensive
          })() && (
            <button
              onClick={handleViewComprehensive}
              disabled={loadingComprehensive || filteredExams.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loadingComprehensive ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <LucideIcons.ClipboardList className="w-4 h-4" />
              )}
              {loadingComprehensive ? 'Loading...' : 'Comprehensive Results'}
            </button>
          )}

          {/* Back from comprehensive view */}
          {showComprehensive && (
            <button
              onClick={() => { setShowComprehensive(false); setComprehensiveData(null) }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition"
            >
              <LucideIcons.ArrowLeft className="w-4 h-4" />
              Back to Exams
            </button>
          )}

          {/* Exam detail view buttons */}
          {selectedExam && (
            <>
              <button
                onClick={exportResultsPDF}
                disabled={!sortedResults.length}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.FileDown className="w-4 h-4" />
                Export PDF
              </button>
              <button
                onClick={() => setSelectedExam(null)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition"
              >
                <LucideIcons.ArrowLeft className="w-4 h-4" />
                Back to List
              </button>
            </>
          )}
        </div>
      </div>

      {/* Comprehensive Results View */}
      {showComprehensive && comprehensiveData && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
          <StudentPerformanceTable
            students={comprehensiveData.all_students || []}
            title={(() => {
              const cls = classes.find(c => String(c.id) === selectedClass)
              if (!cls) return 'Comprehensive Results'
              return cls.course_name
                ? `${cls.name} — ${cls.course_name}`
                : cls.name
            })()}
          />
        </section>
      )}

      {/* Filters - Only show when not viewing exam details or comprehensive */}
      {!selectedExam && !showComprehensive && (
        <div className={`bg-white rounded-xl shadow-sm border p-4 transition-all ${
          !selectedClass
            ? 'border-indigo-300 ring-2 ring-indigo-100'
            : 'border-neutral-200'
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <LucideIcons.Filter className="w-5 h-5 text-neutral-500" />
            <h3 className="font-medium text-black">Filters</h3>
            {!selectedClass && (
              <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full animate-pulse">
                Select a class to view exams
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Class Filter */}
            <div>
              <label className={`flex items-center gap-1 text-sm mb-1 ${
                !selectedClass ? 'text-indigo-700 font-medium' : 'text-neutral-600'
              }`}>
                <LucideIcons.School className="w-4 h-4" />
                Class
                {!selectedClass && (
                  <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                    Required
                  </span>
                )}
              </label>
              <select
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value)
                  setSelectedSubject('')
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                  !selectedClass
                    ? 'border-indigo-300 ring-1 ring-indigo-100'
                    : 'border-neutral-200'
                }`}
              >
                <option value="">Select a class...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Subject Filter */}
            <div>
              <label className="flex items-center gap-1 text-sm text-neutral-600 mb-1">
                <LucideIcons.BookOpen className="w-4 h-4" />
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={!selectedClass}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  !selectedClass
                    ? 'bg-gray-100 cursor-not-allowed border-neutral-200'
                    : 'border-neutral-200'
                }`}
              >
                <option value="">{!selectedClass ? 'Select class first...' : 'All Subjects'}</option>
                {filteredSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.subject_code || 'N/A'})</option>
                ))}
              </select>
              {!selectedClass && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <LucideIcons.Info className="w-3 h-3" />
                  Select a class first
                </p>
              )}
            </div>

            {/* Exam Type Filter */}
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Exam Type</label>
              <select
                value={selectedExamType}
                onChange={(e) => setSelectedExamType(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="final">Final</option>
              </select>
            </div>

            {/* Date Range */}
            <ModernDatePicker
              label="From Date"
              value={dateRange.start}
              onChange={(value) => setDateRange(prev => ({ ...prev, start: value }))}
              placeholder="Select start date"
            />
            <ModernDatePicker
              label="To Date"
              value={dateRange.end}
              onChange={(value) => setDateRange(prev => ({ ...prev, end: value }))}
              placeholder="Select end date"
            />
          </div>
          
          {/* Clear filters */}
          {(selectedClass || selectedSubject || selectedExamType || dateRange.start || dateRange.end) && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <button
                onClick={() => {
                  setSelectedClass('')
                  setSelectedSubject('')
                  setSelectedExamType('')
                  setDateRange({ start: '', end: '' })
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Exam List View */}
      {!selectedExam && !showComprehensive && (
        <>
          {filteredExams.length === 0 ? (
            !selectedClass ? (
              <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl border-2 border-dashed border-indigo-200 p-8 md:p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <LucideIcons.FileText className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" />
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
                    Select a Class to View Exam Reports
                  </h3>
                  <p className="text-sm md:text-base text-gray-600">
                    Choose a class from the dropdown above to view exam reports, analyze student performance, and generate detailed statistics.
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={LucideIcons.FileText}
                title="No exams found"
                description="There are no exams matching your current filters for this class."
              />
            )
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              {/* Mobile & Tablet Card View */}
              <div className="lg:hidden">
                {/* Tablet: 2-column grid */}
                <div className="hidden sm:grid sm:grid-cols-2 gap-4 p-4">
                  {paginatedExams.map(exam => (
                    <div key={exam.id} className="bg-white rounded-xl p-4 border border-neutral-200 hover:shadow-md transition-shadow">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getExamTypeBadge(exam.exam_type)}`}>
                              {exam.exam_type?.toUpperCase() || 'N/A'}
                            </span>
                            {exam.average_score != null && (
                              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                Avg: {parseFloat(exam.average_score).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-1">{exam.title}</h3>
                          <p className="text-sm text-indigo-600 font-medium mt-0.5 line-clamp-1">
                            {exam.subject_name || subjects.find(s => s.id === (exam.subject || exam.subject_id))?.name || 'N/A'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                          <div className="text-lg font-bold text-indigo-700">{exam.total_marks || 100}</div>
                          <div className="text-[10px] text-indigo-500 font-medium">marks</div>
                        </div>
                      </div>

                      {/* Info Row */}
                      <div className="flex items-center gap-4 mb-3 text-sm text-neutral-600">
                        <div className="flex items-center gap-1.5">
                          <LucideIcons.Calendar className="w-4 h-4 text-neutral-400" />
                          <span>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>

                      {exam.description && (
                        <p className="text-sm text-neutral-500 mb-3 line-clamp-2">{exam.description}</p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleOpenCreateReportModal(exam)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition shadow-sm"
                        >
                          <LucideIcons.Plus className="w-4 h-4" />
                          Create Report
                        </button>
                        <button
                          onClick={() => handleViewReport(exam)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
                        >
                          <LucideIcons.Eye className="w-4 h-4" />
                          View Report
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mobile: Single column list */}
                <div className="sm:hidden divide-y divide-neutral-200">
                  {paginatedExams.map(exam => (
                    <div key={exam.id} className="p-4 hover:bg-neutral-50 transition">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getExamTypeBadge(exam.exam_type)}`}>
                              {exam.exam_type?.toUpperCase() || 'N/A'}
                            </span>
                            {exam.average_score != null && (
                              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                Avg: {parseFloat(exam.average_score).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-gray-900 text-base leading-tight">{exam.title}</h3>
                          <p className="text-sm text-indigo-600 font-medium mt-0.5">
                            {exam.subject_name || subjects.find(s => s.id === (exam.subject || exam.subject_id))?.name || 'N/A'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                          <div className="text-lg font-bold text-indigo-700">{exam.total_marks || 100}</div>
                          <div className="text-[10px] text-indigo-500 font-medium">marks</div>
                        </div>
                      </div>

                      {/* Info Row */}
                      <div className="flex items-center gap-4 mb-3 text-sm text-neutral-600">
                        <div className="flex items-center gap-1.5">
                          <LucideIcons.Calendar className="w-4 h-4 text-neutral-400" />
                          <span>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>

                      {exam.description && (
                        <p className="text-sm text-neutral-500 mb-3 line-clamp-2">{exam.description}</p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleOpenCreateReportModal(exam)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-base font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition shadow-sm"
                        >
                          <LucideIcons.Plus className="w-5 h-5" />
                          Create Report
                        </button>
                        <button
                          onClick={() => handleViewReport(exam)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
                        >
                          <LucideIcons.Eye className="w-5 h-5" />
                          View Report
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Exam</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Total Marks</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Avg Score</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {paginatedExams.map(exam => (
                      <tr key={exam.id} className="hover:bg-neutral-50 transition">
                        <td className="px-4 py-4">
                          <div className="font-medium text-black text-base">{exam.title}</div>
                          {exam.description && (
                            <div className="text-sm text-neutral-500 truncate max-w-xs">{exam.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-neutral-700">
                          {exam.subject_name || subjects.find(s => s.id === (exam.subject || exam.subject_id))?.name || 'N/A'}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getExamTypeBadge(exam.exam_type)}`}>
                            {exam.exam_type?.toUpperCase() || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-neutral-700">
                          {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-4 text-sm text-neutral-700 font-medium hidden lg:table-cell">
                          {exam.total_marks || 100}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {exam.average_score != null ? (
                            <span className="font-medium text-indigo-600">{parseFloat(exam.average_score).toFixed(1)}%</span>
                          ) : (
                            <span className="text-neutral-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center gap-2 justify-end flex-wrap">
                            <button
                              onClick={() => handleOpenCreateReportModal(exam)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                              title="Create exam report for this exam"
                            >
                              <LucideIcons.Plus className="w-4 h-4" />
                              Create Report
                            </button>
                            <button
                              onClick={() => handleViewReport(exam)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"
                            >
                              <LucideIcons.Eye className="w-4 h-4" />
                              View Report
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination for Exam List */}
              <Pagination
                currentPage={examListPage}
                totalPages={totalExamPages}
                onPageChange={setExamListPage}
              />
            </div>
          )}
        </>
      )}

      {/* Exam Detail View */}
      {selectedExam && (
        <div className="space-y-6">
          {/* Exam Header Card */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-black">{selectedExam.title}</h2>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getExamTypeBadge(selectedExam.exam_type)}`}>
                    {selectedExam.exam_type?.toUpperCase()}
                  </span>
                </div>
                {selectedExam.description && (
                  <p className="text-neutral-600 mb-3">{selectedExam.description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
                  <span className="flex items-center gap-1">
                    <LucideIcons.BookOpen className="w-4 h-4" />
                    {selectedExam.subject_name || 'N/A'}
                  </span>
                  <span className="flex items-center gap-1">
                    <LucideIcons.Calendar className="w-4 h-4" />
                    {selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString() : 'N/A'}
                  </span>
                  <span className="flex items-center gap-1">
                    <LucideIcons.Award className="w-4 h-4" />
                    Total Marks: {selectedExam.total_marks || 100}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {loadingResults ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : examStats ? (
            <>
              {/* Stats Cards - Scrollable on mobile */}
              <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
                <div className="flex md:grid md:grid-cols-3 lg:grid-cols-7 gap-3 md:gap-4 min-w-max md:min-w-0">
                  <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center md:hidden">
                        <LucideIcons.Users className="w-4 h-4 text-neutral-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Total Students</div>
                        <div className="text-xl md:text-2xl font-bold text-black">{examStats.total}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center md:hidden">
                        <LucideIcons.CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Graded</div>
                        <div className="text-xl md:text-2xl font-bold text-green-600">{examStats.submitted}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center md:hidden">
                        <LucideIcons.Clock className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Pending</div>
                        <div className="text-xl md:text-2xl font-bold text-amber-600">{examStats.pending}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center md:hidden">
                        <LucideIcons.TrendingUp className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Average</div>
                        <div className="text-xl md:text-2xl font-bold text-indigo-600">{examStats.average}%</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center md:hidden">
                        <LucideIcons.ArrowUp className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Highest</div>
                        <div className="text-xl md:text-2xl font-bold text-green-600">{examStats.highest}%</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center md:hidden">
                        <LucideIcons.ArrowDown className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Lowest</div>
                        <div className="text-xl md:text-2xl font-bold text-red-600">{examStats.lowest}%</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4 min-w-[120px] md:min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center md:hidden">
                        <LucideIcons.Percent className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-neutral-500">Pass Rate</div>
                        <div className="text-xl md:text-2xl font-bold text-blue-600">{examStats.passRate}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grade Distribution */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 md:p-6">
                <h3 className="text-base md:text-lg font-semibold text-black mb-4">Grade Distribution</h3>
                <div className="grid grid-cols-5 sm:grid-cols-9 gap-2 md:gap-3">
                  {Object.entries(examStats.grades).map(([grade, count]) => {
                    const total = examStats.submitted
                    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0
                    return (
                      <div key={grade} className="text-center">
                        <div className={`w-full h-16 md:h-24 rounded-lg flex items-end justify-center ${getGradeColor(grade)}`} style={{ opacity: 0.3 + (count / total) * 0.7 }}>
                          <div
                            className={`w-full rounded-lg ${getGradeColor(grade)}`}
                            style={{ height: `${Math.max(20, pct)}%` }}
                          ></div>
                        </div>
                        <div className={`mt-2 inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full font-bold text-sm md:text-base ${getGradeColor(grade)}`}>
                          {grade}
                        </div>
                        <div className="text-xs md:text-sm text-neutral-600 mt-1">{count} <span className="hidden sm:inline">({pct}%)</span></div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Results Table */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="p-4 border-b border-neutral-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base md:text-lg font-semibold text-black">Student Results</h3>
                      <p className="text-xs md:text-sm text-neutral-500">Ranked by performance</p>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by student name or service number..."
                      value={resultsSearchTerm}
                      onChange={(e) => {
                        setResultsSearchTerm(e.target.value)
                        setResultsPage(1)
                      }}
                      className="w-full pl-10 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {resultsSearchTerm && (
                      <button
                        onClick={() => {
                          setResultsSearchTerm('')
                          setResultsPage(1)
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <LucideIcons.X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Results Info */}
                  {resultsSearchTerm && (
                    <div className="text-sm text-gray-600 mt-2">
                      Found <span className="font-semibold text-gray-900">{sortedResults.length}</span> of{' '}
                      <span className="font-semibold text-gray-900">{examResults.filter(r => r.is_submitted && r.marks_obtained != null).length}</span> results
                    </div>
                  )}
                </div>
                {/* Mobile & Tablet Card View for Results */}
                <div className="lg:hidden">
                  {/* Tablet: 2-column grid */}
                  <div className="hidden sm:grid sm:grid-cols-2 gap-4 p-4">
                    {paginatedResults.map((result, idx) => {
                      const isGraded = result.is_submitted && result.marks_obtained != null
                      const pct = isGraded ? calcPercentage(result.marks_obtained, selectedExam.total_marks) : 0
                      const grade = isGraded ? getGrade(pct) : null
                      const serialNumber = (resultsPage - 1) * resultsPerPage + idx + 1
                      const overallRank = sortedResults.findIndex(r => r.id === result.id) + 1

                      if (isGraded) {
                        return (
                          <div key={result.id} className="bg-white rounded-xl border border-neutral-200 p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                                  overallRank === 1 ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-300' :
                                  overallRank === 2 ? 'bg-gray-200 text-gray-700 ring-2 ring-gray-300' :
                                  overallRank === 3 ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-300' :
                                  'bg-neutral-100 text-neutral-600'
                                }`}>
                                  {serialNumber}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900 text-sm truncate">{result.student_name || 'Unknown'}</div>
                                  <div className="text-xs text-neutral-500">SVC: {result.student_svc_number || 'N/A'}</div>
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 text-xs font-bold rounded-lg flex-shrink-0 ${getGradeColor(grade)}`}>
                                {grade}
                              </span>
                            </div>
                            <div className="bg-neutral-50 rounded-lg p-2.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-neutral-600">Marks</span>
                                <span className="text-sm font-bold text-gray-900">{result.marks_obtained} / {selectedExam.total_marks}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      parseFloat(pct) >= 76 ? 'bg-green-500' :
                                      parseFloat(pct) >= 60 ? 'bg-blue-500' :
                                      parseFloat(pct) >= 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  ></div>
                                </div>
                                <span className={`text-sm font-bold ${
                                  parseFloat(pct) >= 76 ? 'text-green-600' :
                                  parseFloat(pct) >= 60 ? 'text-blue-600' :
                                  parseFloat(pct) >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>{pct}%</span>
                              </div>
                            </div>
                          </div>
                        )
                      } else {
                        return (
                          <div key={result.id} className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 text-amber-600 font-bold text-sm">
                                {serialNumber}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 text-sm truncate">{result.student_name || 'Unknown'}</div>
                                <div className="text-xs text-neutral-500">SVC: {result.student_svc_number || 'N/A'}</div>
                              </div>
                              <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-100 text-amber-700 flex-shrink-0">
                                Pending
                              </span>
                            </div>
                          </div>
                        )
                      }
                    })}
                  </div>

                  {/* Mobile: Single column list */}
                  <div className="sm:hidden divide-y divide-neutral-200">
                    {paginatedResults.map((result, idx) => {
                      const isGraded = result.is_submitted && result.marks_obtained != null
                      const pct = isGraded ? calcPercentage(result.marks_obtained, selectedExam.total_marks) : 0
                      const grade = isGraded ? getGrade(pct) : null
                      const serialNumber = (resultsPage - 1) * resultsPerPage + idx + 1
                      const overallRank = sortedResults.findIndex(r => r.id === result.id) + 1

                      if (isGraded) {
                        return (
                          <div key={result.id} className="p-4 hover:bg-neutral-50 transition">
                            {/* Header with rank and grade */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base ${
                                  overallRank === 1 ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-300' :
                                  overallRank === 2 ? 'bg-gray-200 text-gray-700 ring-2 ring-gray-300' :
                                  overallRank === 3 ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-300' :
                                  'bg-neutral-100 text-neutral-600'
                                }`}>
                                  {serialNumber}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 text-base">{result.student_name || 'Unknown'}</div>
                                  <div className="text-sm text-neutral-500">SVC: {result.student_svc_number || 'N/A'}</div>
                                </div>
                              </div>
                              <span className={`px-3 py-1.5 text-sm font-bold rounded-lg ${getGradeColor(grade)}`}>
                                {grade}
                              </span>
                            </div>

                            {/* Score Info */}
                            <div className="bg-neutral-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-neutral-600">Marks</span>
                                <span className="text-base font-bold text-gray-900">{result.marks_obtained} / {selectedExam.total_marks}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2.5 bg-neutral-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      parseFloat(pct) >= 80 ? 'bg-green-500' :
                                      parseFloat(pct) >= 60 ? 'bg-blue-500' :
                                      parseFloat(pct) >= 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  ></div>
                                </div>
                                <span className={`text-base font-bold ${
                                  parseFloat(pct) >= 76 ? 'text-green-600' :
                                  parseFloat(pct) >= 60 ? 'text-blue-600' :
                                  parseFloat(pct) >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>{pct}%</span>
                              </div>
                            </div>

                            {result.remarks && (
                              <div className="mt-2 text-sm text-neutral-500 italic">
                                {result.remarks}
                              </div>
                            )}
                          </div>
                        )
                    } else {
                      return (
                        <div key={result.id} className="p-4 bg-amber-50/50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 text-amber-600 font-bold text-base">
                              {serialNumber}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 text-base">{result.student_name || 'Unknown'}</div>
                              <div className="text-sm text-neutral-500">SVC: {result.student_svc_number || 'N/A'}</div>
                            </div>
                            <span className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-100 text-amber-700">
                              Pending
                            </span>
                          </div>
                        </div>
                      )
                    }
                  })}
                </div>

                </div>

                {/* Desktop Table View for Results */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">S/No</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">SVC Number</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Rank</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Student</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Marks</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Percentage</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Grade</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {paginatedResults.map((result, idx) => {
                        const isGraded = result.is_submitted && result.marks_obtained != null
                        const pct = isGraded ? calcPercentage(result.marks_obtained, selectedExam.total_marks) : 0
                        const grade = isGraded ? getGrade(pct) : null
                        const serialNumber = (resultsPage - 1) * resultsPerPage + idx + 1
                        const overallRank = sortedResults.findIndex(r => r.id === result.id) + 1

                        if (isGraded) {
                          return (
                            <tr key={result.id} className="hover:bg-neutral-50 transition">
                              <td className="px-4 py-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                  overallRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                  overallRank === 2 ? 'bg-gray-100 text-gray-700' :
                                  overallRank === 3 ? 'bg-orange-100 text-orange-700' :
                                  'bg-neutral-100 text-neutral-600'
                                }`}>
                                  {serialNumber}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-600">
                                {result.student_svc_number || 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-600">
                                {result.student_rank || 'N/A'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-black text-base">{result.student_name || 'Unknown'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-black">
                                {result.marks_obtained} / {selectedExam.total_marks}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-2 bg-neutral-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        parseFloat(pct) >= 76 ? 'bg-green-500' :
                                        parseFloat(pct) >= 60 ? 'bg-blue-500' :
                                        parseFloat(pct) >= 50 ? 'bg-yellow-500' :
                                        'bg-red-500'
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-sm font-medium text-black">{pct}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full ${getGradeColor(grade)}`}>
                                  {grade}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-500 max-w-xs truncate hidden lg:table-cell">
                                {result.remarks || '-'}
                              </td>
                            </tr>
                          )
                        } else {
                          return (
                            <tr key={result.id} className="bg-amber-50/50">
                              <td className="px-4 py-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-100 text-amber-600 font-bold text-sm">
                                  {serialNumber}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-600">
                                {result.student_svc_number || 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-600">
                                {result.student_rank || 'N/A'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-black text-base">{result.student_name || 'Unknown'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-amber-600 font-medium" colSpan={4}>
                                Pending Grading
                              </td>
                            </tr>
                          )
                        }
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination for Student Results */}
                {totalResultsPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50 border-t border-neutral-200 rounded-b-lg p-3">
                    <div className="text-sm text-gray-600">
                      Showing <span className="font-semibold text-gray-900">{(resultsPage - 1) * resultsPerPage + 1}</span> to{' '}
                      <span className="font-semibold text-gray-900">{Math.min(resultsPage * resultsPerPage, allResults.length)}</span> of{' '}
                      <span className="font-semibold text-gray-900">{allResults.length}</span> students
                      {pendingResults.length > 0 && (
                        <span className="text-amber-600 ml-1">({pendingResults.length} pending)</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setResultsPage(1)}
                        disabled={resultsPage === 1}
                        className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="First page"
                      >
                        <LucideIcons.ChevronsLeft className="w-4 h-4 text-black" />
                      </button>

                      <button
                        onClick={() => setResultsPage(p => Math.max(1, p - 1))}
                        disabled={resultsPage === 1}
                        className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Previous page"
                      >
                        <LucideIcons.ChevronLeft className="w-4 h-4 text-black" />
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalResultsPages) }, (_, i) => {
                          let pageNum
                          if (totalResultsPages <= 5) {
                            pageNum = i + 1
                          } else if (resultsPage <= 3) {
                            pageNum = i + 1
                          } else if (resultsPage >= totalResultsPages - 2) {
                            pageNum = totalResultsPages - 4 + i
                          } else {
                            pageNum = resultsPage - 2 + i
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setResultsPage(pageNum)}
                              className={`min-w-[2rem] px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                resultsPage === pageNum
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white border border-gray-300 text-black hover:bg-gray-50'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>

                      <button
                        onClick={() => setResultsPage(p => Math.min(totalResultsPages, p + 1))}
                        disabled={resultsPage === totalResultsPages}
                        className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Next page"
                      >
                        <LucideIcons.ChevronRight className="w-4 h-4 text-black" />
                      </button>

                      <button
                        onClick={() => setResultsPage(totalResultsPages)}
                        disabled={resultsPage === totalResultsPages}
                        className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Last page"
                      >
                        <LucideIcons.ChevronsRight className="w-4 h-4 text-black" />
                      </button>
                    </div>
                  </div>
                )}

                {examResults.length === 0 && (
                  <div className="p-8 text-center text-neutral-500">
                    <LucideIcons.FileX className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                    <p>No results found for this exam</p>
                  </div>
                )}
              </div>

              {/* Exam Report Remarks Section */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-200 flex items-center gap-3">
                  <LucideIcons.MessageSquare className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-semibold text-black">Exam Report Remarks</h3>
                  {loadingReport && (
                    <div className="ml-auto animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent" />
                  )}
                </div>

                <div className="p-6 space-y-4">
                  {/* Report Context */}
                  {examReport ? (
                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                      <h4 className="text-sm font-semibold text-neutral-700 mb-3">Report Context</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-medium text-neutral-600 mb-1">Subject</div>
                          <div className="text-sm font-semibold text-black">{examReport.subject_name || selectedExam.subject_name || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-neutral-600 mb-1">Class</div>
                          <div className="text-sm font-semibold text-black">{examReport.class_name || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  ) : !loadingReport ? (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-sm text-amber-700">
                      No report exists for this exam yet. Create one using the <strong>Create Report</strong> button to enable remarks.
                    </div>
                  ) : null}

                  {/* Remarks History */}
                  {examReport && (
                    <>
                      <div>
                        <h4 className="font-semibold text-black mb-3">Remarks History</h4>
                        {examReport.remarks_list && examReport.remarks_list.length > 0 ? (
                          <div className="space-y-3 max-h-60 overflow-y-auto">
                            {examReport.remarks_list.map((remark, idx) => (
                              <div key={idx} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                                <div className="flex items-start justify-between mb-1">
                                  <div className="font-medium text-sm text-black">{remark.author_name}</div>
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    remark.author_role === 'commandant' ? 'bg-purple-100 text-purple-700' :
                                    remark.author_role === 'chief_instructor' ? 'bg-blue-100 text-blue-700' :
                                    remark.author_role === 'instructor' ? 'bg-green-100 text-green-700' :
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
                      <div className="border-t border-neutral-200 pt-4">
                        <label className="block text-sm font-medium text-neutral-700 mb-2">Add New Remark</label>
                        <textarea
                          value={newRemark}
                          onChange={(e) => setNewRemark(e.target.value)}
                          placeholder="Enter your remark (minimum 10 characters)..."
                          rows={4}
                          className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-black"
                        />
                        <div className="flex gap-3 justify-end mt-3">
                          <button
                            onClick={handleAddRemark}
                            disabled={remarkSubmitting || !newRemark.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {remarkSubmitting ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                <LucideIcons.Send className="w-4 h-4" />
                                Submit Remark
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={LucideIcons.FileText}
              title="No results yet"
              description="No exam results have been recorded for this exam."
            />
          )}
        </div>
      )}

      {/* Create Exam Report Modal */}
      {showCreateReportModal && selectedExamForReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowCreateReportModal(false)} />
          <div className="relative z-10 w-full max-w-xl bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-black">Create Exam Report</h2>
                <p className="text-sm text-neutral-600 mt-1">Generate a new exam report for analysis and remarks</p>
              </div>
              <button
                onClick={() => setShowCreateReportModal(false)}
                disabled={creatingReport}
                aria-label="Close"
                className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition disabled:opacity-50"
              >
                <LucideIcons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Exam Info - Read Only */}
              <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                <h3 className="text-sm font-semibold text-black mb-3">Exam Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Exam:</span>
                    <span className="font-medium text-black">{selectedExamForReport.title || selectedExamForReport.exam_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subject:</span>
                    <span className="font-medium text-black">
                      {selectedExamForReport.subject_name || subjects.find(s => s.id === (selectedExamForReport.subject || selectedExamForReport.subject_id))?.name || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Class:</span>
                    <span className="font-medium text-black">
                      {(() => {
                        let classId = selectedExamForReport.subject_class_id || selectedExamForReport.class_id
                        let classObj = classes.find(c => c.id === classId)
                        
                        // Fallback: find by name if ID lookup fails
                        if (!classObj && selectedExamForReport.class_name) {
                          classObj = classes.find(c => c.name === selectedExamForReport.class_name)
                        }
                        
                        if (classObj) return classObj.name
                        
                        // Fallback: try to find via subject
                        const subject = subjects.find(s => s.id === (selectedExamForReport.subject || selectedExamForReport.subject_id))
                        if (subject?.class_obj) {
                          const classViaSubject = classes.find(c => c.id === subject.class_obj)
                          if (classViaSubject) return classViaSubject.name
                        }
                        
                        return 'N/A'
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Report Title *</label>
                <input
                  type="text"
                  value={reportForm.title}
                  onChange={(e) => setReportForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Final Exam Analysis"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Description</label>
                <textarea
                  value={reportForm.description}
                  onChange={(e) => setReportForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional notes about this report"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-black"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateReportModal(false)}
                disabled={creatingReport}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateReport}
                disabled={creatingReport}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingReport ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <LucideIcons.Plus className="w-4 h-4" />
                    Create Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
