import React, { useState, useEffect, useMemo, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'
import ModernDatePicker from '../../components/ModernDatePicker'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  
  // Filters
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExamType, setSelectedExamType] = useState('')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  
  // Selected exam for detail view
  const [selectedExam, setSelectedExam] = useState(null)
  const [examResults, setExamResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)

  // Pagination state
  const [examListPage, setExamListPage] = useState(1)
  const [resultsPage, setResultsPage] = useState(1)
  const [resultsSearchTerm, setResultsSearchTerm] = useState('')
  const examsPerPage = 10
  const resultsPerPage = 10

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [examsData, classesData, subjectsData] = await Promise.all([
          isAdmin ? api.getExams() : api.getMyExams(),
          isAdmin ? api.getAllClasses() : api.getMyClasses(),
          isAdmin ? api.getAllSubjects() : api.getMySubjects()
        ])

        // Handle both direct arrays and paginated responses {count, results}
        setExams(Array.isArray(examsData) ? examsData : (examsData?.results || []))
        setClasses(Array.isArray(classesData) ? classesData : (classesData?.results || []))
        setSubjects(Array.isArray(subjectsData) ? subjectsData : (subjectsData?.results || []))
      } catch {
        toast?.showError?.('Failed to load exam data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  // Filter exams based on selections
  const filteredExams = useMemo(() => {
    // Don't show any exams if no class is selected
    if (!selectedClass) {
      setExamListPage(1)
      return []
    }

    const filtered = exams.filter(exam => {
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
      return true
    })
    // Reset to page 1 when filters change
    setExamListPage(1)
    return filtered
  }, [exams, selectedClass, selectedSubject, selectedExamType, dateRange, subjects])

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

  // Load exam results when an exam is selected
  useEffect(() => {
    if (!selectedExam) {
      setExamResults([])
      return
    }
    async function loadResults() {
      setLoadingResults(true)
      try {
        const results = await api.getExamResults(selectedExam.id)
        setExamResults(Array.isArray(results) ? results : (results?.results || []))
      } catch {
        toast?.showError?.('Failed to load exam results')
      } finally {
        setLoadingResults(false)
      }
    }
    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExam])

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
    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    percentages.forEach(p => {
      if (p >= 80) grades.A++
      else if (p >= 70) grades.B++
      else if (p >= 60) grades.C++
      else if (p >= 50) grades.D++
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
      A: 'bg-green-100 text-green-800',
      B: 'bg-blue-100 text-blue-800',
      C: 'bg-yellow-100 text-yellow-800',
      D: 'bg-orange-100 text-orange-800',
      F: 'bg-red-100 text-red-800'
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

  // Calculate percentage
  const calcPercentage = useCallback((marks, total) => {
    if (!marks || !total) return 0
    return ((parseFloat(marks) / total) * 100).toFixed(1)
  }, [])

  // Get grade from percentage
  const getGrade = useCallback((pct) => {
    const p = parseFloat(pct)
    if (p >= 80) return 'A'
    if (p >= 70) return 'B'
    if (p >= 60) return 'C'
    if (p >= 50) return 'D'
    return 'F'
  }, [])

  // Export PDF with ranked student results
  const exportResultsPDF = useCallback(() => {
    if (!selectedExam || !sortedResults.length) {
      toast?.showError?.('No graded results to export')
      return
    }

    try {
      const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Student Results Report', pageWidth / 2, 20, { align: 'center' })

    // Exam details
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(`Exam: ${selectedExam.title}`, 14, 35)
    doc.text(`Subject: ${selectedExam.subject_name || 'N/A'}`, 14, 42)
    doc.text(`Date: ${selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString() : 'N/A'}`, 14, 49)
    doc.text(`Total Marks: ${selectedExam.total_marks || 100}`, 14, 56)

    // Statistics
    if (examStats) {
      doc.setFont('helvetica', 'bold')
      doc.text('Statistics:', 14, 68)
      doc.setFont('helvetica', 'normal')
      doc.text(`Total Students: ${examStats.total}  |  Graded: ${examStats.submitted}  |  Pending: ${examStats.pending}`, 14, 75)
      doc.text(`Average: ${examStats.average}%  |  Highest: ${examStats.highest}%  |  Lowest: ${examStats.lowest}%  |  Pass Rate: ${examStats.passRate}%`, 14, 82)

      // Grade distribution
      const gradeText = Object.entries(examStats.grades)
        .map(([grade, count]) => `${grade}: ${count}`)
        .join('  |  ')
      doc.text(`Grade Distribution: ${gradeText}`, 14, 89)
    }

    // Student results table
    const tableData = sortedResults.map((result, idx) => {
      const pct = calcPercentage(result.marks_obtained, selectedExam.total_marks)
      const grade = getGrade(pct)
      return [
        idx + 1,
        result.student_svc_number || 'N/A',
        result.student_rank || 'N/A',
        result.student_name || 'Unknown',
        `${result.marks_obtained} / ${selectedExam.total_marks}`,
        `${pct}%`,
        grade,
        result.remarks || '-'
      ]
    })

    autoTable(doc, {
      startY: examStats ? 98 : 68,
      head: [['S/No', 'SVC Number', 'Student Rank', 'Student Name', 'Marks', 'Percentage', 'Grade', 'Remarks']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 18 },
        6: { halign: 'center', cellWidth: 14 },
        7: { cellWidth: 'auto' }
      }
    })

    // Footer with generation date
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128)
      doc.text(
        `Generated on ${new Date().toLocaleString()} - Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      )
    }

    // Save the PDF
      const fileName = `${selectedExam.title.replace(/[^a-z0-9]/gi, '_')}_Results_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)

      toast?.showSuccess?.('PDF exported successfully')
    } catch (error) {
      console.error('PDF export error:', error)
      toast?.showError?.('Failed to export PDF: ' + (error.message || 'Unknown error'))
    }
  }, [selectedExam, sortedResults, examStats, calcPercentage, getGrade, toast])

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
        {selectedExam && (
          <div className="flex items-center gap-3">
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
          </div>
        )}
      </div>

      {/* Filters - Only show when not viewing exam details */}
      {!selectedExam && (
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
                <option value="">All Types</option>
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
      {!selectedExam && (
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

                      {/* Action Button */}
                      <button
                        onClick={() => setSelectedExam(exam)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
                      >
                        <LucideIcons.Eye className="w-4 h-4" />
                        View Report
                      </button>
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

                      {/* Action Button */}
                      <button
                        onClick={() => setSelectedExam(exam)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
                      >
                        <LucideIcons.Eye className="w-5 h-5" />
                        View Report
                      </button>
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
                          <button
                            onClick={() => setSelectedExam(exam)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"
                          >
                            <LucideIcons.Eye className="w-4 h-4" />
                            View Report
                          </button>
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
                <div className="grid grid-cols-5 gap-2 md:gap-4">
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
                                      parseFloat(pct) >= 80 ? 'bg-green-500' :
                                      parseFloat(pct) >= 60 ? 'bg-blue-500' :
                                      parseFloat(pct) >= 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  ></div>
                                </div>
                                <span className={`text-sm font-bold ${
                                  parseFloat(pct) >= 80 ? 'text-green-600' :
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
                                  parseFloat(pct) >= 80 ? 'text-green-600' :
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
                                        parseFloat(pct) >= 80 ? 'bg-green-500' :
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
    </div>
  )
}
