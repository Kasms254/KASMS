import React, { useState, useEffect, useMemo, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useToast from '../../hooks/useToast'
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

export default function CommandantExamReports() {
  const { user } = useAuth()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })

  const [selectedExam, setSelectedExam] = useState(null)
  const [examResults, setExamResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)

  const [showComprehensive, setShowComprehensive] = useState(false)
  const [comprehensiveData, setComprehensiveData] = useState(null)
  const [loadingComprehensive, setLoadingComprehensive] = useState(false)

  const [pendingCount, setPendingCount] = useState(0)
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const [search, setSearch] = useState('')

  const [detailsCache, setDetailsCache] = useState({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [remarkText, setRemarkText] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    async function fetchInitial() {
      setLoading(true)
      try {
        const [examsData, classesData, subjectsData, pendingData] = await Promise.allSettled([
          api.getCommandantExamReports(),
          api.getCommandantClasses(),
          api.getCommandantClassSubjects ? api.getCommandantClassSubjects() : api.getSubjects(),
          api.getCommandantPendingRemarks(),
        ])

        if (examsData.status === 'fulfilled') {
          const d = examsData.value
          setExams(Array.isArray(d) ? d : (d?.results || []))
        }
        if (classesData.status === 'fulfilled') {
          const d = classesData.value
          setClasses(Array.isArray(d) ? d : (d?.results || []))
        }
        if (subjectsData.status === 'fulfilled') {
          const d = subjectsData.value
          setSubjects(Array.isArray(d) ? d : (d?.results || []))
        }
        if (pendingData.status === 'fulfilled') {
          const d = pendingData.value
          setPendingCount(Array.isArray(d) ? d.length : d?.count ?? 0)
        }
      } catch (err) {
        toast?.showError?.('Failed to load exam reports')
      } finally {
        setLoading(false)
      }
    }
    fetchInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredExams = useMemo(() => {
    if (!selectedClass && showPendingOnly === false && !search) return exams
    return exams.filter(exam => {
      if (showPendingOnly && !(exam.remarks_pending)) return false
      if (selectedClass && exam.class_id !== parseInt(selectedClass) && exam.subject_class_id !== parseInt(selectedClass)) return false
      if (selectedSubject && exam.subject !== parseInt(selectedSubject) && exam.subject_id !== parseInt(selectedSubject)) return false
      if (search && !(exam.title || '').toLowerCase().includes(search.toLowerCase())) return false
      if (dateRange.start && new Date(exam.exam_date) < new Date(dateRange.start)) return false
      if (dateRange.end && new Date(exam.exam_date) > new Date(dateRange.end)) return false
      const hasResults = exam.submission_count > 0 || (exam.average_score != null && exam.average_score > 0)
      return hasResults
    })
  }, [exams, selectedClass, selectedSubject, dateRange, search, showPendingOnly])

  const paginatedExams = filteredExams.slice(0, 100)

  useEffect(() => {
    if (!selectedExam) { setExamResults([]); return }
    async function loadResults() {
      setLoadingResults(true)
      try {
        const data = await api.getCommandantExamReportDetail(selectedExam.id)
        const results = data?.results || data?.students || []
        setExamResults(Array.isArray(results) ? results : [])
      } catch (err) {
        toast?.showError?.('Failed to load exam results')
      } finally {
        setLoadingResults(false)
      }
    }
    loadResults()
  }, [selectedExam, toast])

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

  const handleViewReport = useCallback((exam) => {
    const hasResults = exam.submission_count > 0 || (exam.average_score != null && exam.average_score > 0)
    if (!hasResults) return toast?.showError?.('This exam has no results to display')
    setSelectedExam(exam)
  }, [toast])

  const handleViewComprehensive = useCallback(async () => {
    if (!selectedClass) return
    setLoadingComprehensive(true)
    try {
      const data = await api.getClassPerformanceSummary(selectedClass)
      if (data?.all_students) {
        data.all_students = data.all_students.map(student => {
          let totalObtained = 0; let totalPossible = 0
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
      toast?.showError?.('Failed to load comprehensive results')
    } finally {
      setLoadingComprehensive(false)
    }
  }, [selectedClass, toast])

  const exportResultsPDF = useCallback(() => {
    if (!selectedExam || !examResults.length) return toast?.showError?.('No graded results to export')
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Student Results Report', pageWidth / 2, 20, { align: 'center' })
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text(`Exam: ${selectedExam.title}`, 14, 35)
      doc.text(`Subject: ${selectedExam.subject_name || 'N/A'}`, 14, 42)
      doc.text(`Date: ${selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString() : 'N/A'}`, 14, 49)
      doc.text(`Total Marks: ${selectedExam.total_marks || 100}`, 14, 56)
      if (examStats) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('Statistics:', 14, 68)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(`Total Students: ${examStats.total}   Graded: ${examStats.submitted}   Pending: ${examStats.pending}   Pass Rate: ${examStats.passRate}%`, 14, 75)
      }
      const tableData = examResults.map((result, idx) => {
        const pct = ((parseFloat(result.marks_obtained) / (selectedExam.total_marks || 100)) * 100).toFixed(1)
        const grade = _gradeFromPct(pct)
        return [idx + 1, result.student_svc_number || 'N/A', result.student_rank || 'N/A', result.student_name || 'Unknown', `${result.marks_obtained} / ${selectedExam.total_marks}`, `${pct}%`, grade]
      })
      autoTable(doc, {
        startY: examStats ? 98 : 68,
        head: [['S/No', 'SVC Number', 'Rank', 'Student', 'Marks', 'Percentage', 'Grade']],
        body: tableData,
        theme: 'striped',
      })
      const fileName = `${selectedExam.title.replace(/[^a-z0-9]/gi, '_')}_Results_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      toast?.showSuccess?.('PDF exported successfully')
    } catch (err) {
      console.error(err)
      toast?.showError?.('Failed to export PDF')
    }
  }, [selectedExam, examResults, examStats, toast])

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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-black">Exam Reports</h2>
        <p className="text-sm text-gray-500">Comprehensive exam analysis and student performance</p>
      </header>

      {(selectedClass || selectedExam || showComprehensive) && (
        <div className="flex items-center gap-3 flex-wrap">
          {selectedClass && !selectedExam && !showComprehensive && (
            <button onClick={handleViewComprehensive} disabled={loadingComprehensive} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {loadingComprehensive ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <LucideIcons.ClipboardList className="w-4 h-4" />}
              {loadingComprehensive ? 'Loading...' : 'Comprehensive Results'}
            </button>
          )}
          {showComprehensive && (
            <button onClick={() => { setShowComprehensive(false); setComprehensiveData(null) }} className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition">
              <LucideIcons.ArrowLeft className="w-4 h-4" />
              Back to Exams
            </button>
          )}
          {selectedExam && (
            <>
              <button onClick={exportResultsPDF} disabled={!examResults.length} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <LucideIcons.FileDown className="w-4 h-4" />
                Export PDF
              </button>
              <button onClick={() => setSelectedExam(null)} className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition">
                <LucideIcons.ArrowLeft className="w-4 h-4" />
                Back to List
              </button>
            </>
          )}
        </div>
      )}

      {showComprehensive && comprehensiveData && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
          <StudentPerformanceTable students={comprehensiveData.all_students || []} title={(classes.find(c => String(c.id) === selectedClass)?.name) || 'Comprehensive Results'} />
        </section>
      )}

      {!selectedExam && !showComprehensive && (
        <div className={`bg-white rounded-xl shadow-sm border p-4 ${!selectedClass ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-neutral-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <LucideIcons.Filter className="w-5 h-5 text-neutral-500" />
            <h3 className="font-medium text-black">Filters</h3>
            {!selectedClass && (
              <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full animate-pulse">Select a class to view exams</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className={`flex items-center gap-1 text-sm mb-1 ${!selectedClass ? 'text-indigo-700 font-medium' : 'text-neutral-600'}`}><LucideIcons.School className="w-4 h-4" />Class</label>
              <select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedSubject('') }} className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${!selectedClass ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-neutral-200'}`}>
                <option value="">Select a class...</option>
                {classes.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm text-neutral-600 mb-1"><LucideIcons.BookOpen className="w-4 h-4" />Subject</label>
              <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} disabled={!selectedClass} className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${!selectedClass ? 'bg-gray-100 cursor-not-allowed border-neutral-200' : 'border-neutral-200'}`}>
                <option value="">{!selectedClass ? 'Select class first...' : 'All Subjects'}</option>
                {subjects.filter(s => !selectedClass || s.class_obj === parseInt(selectedClass) || s.class_id === parseInt(selectedClass)).map(s => (<option key={s.id} value={s.id}>{s.name} ({s.subject_code || 'N/A'})</option>))}
              </select>
            </div>

            <ModernDatePicker label="From Date" value={dateRange.start} onChange={(v) => setDateRange(prev => ({ ...prev, start: v }))} placeholder="Select start date" />
            <ModernDatePicker label="To Date" value={dateRange.end} onChange={(v) => setDateRange(prev => ({ ...prev, end: v }))} placeholder="Select end date" />
          </div>
        </div>
      )}

      {!selectedExam && !showComprehensive && (
        <>
          {filteredExams.length === 0 ? (
            !selectedClass ? (
              <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl border-2 border-dashed border-indigo-200 p-8 md:p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <LucideIcons.FileText className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" />
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">Select a Class to View Exam Reports</h3>
                  <p className="text-sm md:text-base text-gray-600">Choose a class from the dropdown above to view exam reports, analyze student performance, and generate detailed statistics.</p>
                </div>
              </div>
            ) : (
              <EmptyState icon={LucideIcons.FileText} title="No exams found" description="There are no exams matching your current filters for this class." />
            )
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="lg:hidden">
                <div className="hidden sm:grid sm:grid-cols-2 gap-4 p-4">
                  {paginatedExams.map(exam => (
                    <div key={exam.id} className="bg-white rounded-xl p-4 border border-neutral-200 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700`}>{exam.exam_type?.toUpperCase() || 'N/A'}</span>
                            {exam.average_score != null && (<span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Avg: {parseFloat(exam.average_score).toFixed(1)}%</span>)}
                          </div>
                          <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-1">{exam.title}</h3>
                          <p className="text-sm text-indigo-600 font-medium mt-0.5 line-clamp-1">{exam.subject_name || 'N/A'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                          <div className="text-lg font-bold text-indigo-700">{exam.total_marks || 100}</div>
                          <div className="text-[10px] text-indigo-500 font-medium">marks</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-3 text-sm text-neutral-600">
                        <div className="flex items-center gap-1.5"><LucideIcons.Calendar className="w-4 h-4 text-neutral-400" /> <span>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</span></div>
                      </div>
                      {exam.description && (<p className="text-sm text-neutral-500 mb-3 line-clamp-2">{exam.description}</p>)}
                      <button onClick={() => handleViewReport(exam)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"><LucideIcons.Eye className="w-4 h-4" />View Report</button>
                    </div>
                  ))}
                </div>
                <div className="sm:hidden divide-y divide-neutral-200">
                  {paginatedExams.map(exam => (
                    <div key={exam.id} className="p-4 hover:bg-neutral-50 transition">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700`}>{exam.exam_type?.toUpperCase() || 'N/A'}</span>
                            {exam.average_score != null && (<span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Avg: {parseFloat(exam.average_score).toFixed(1)}%</span>)}
                          </div>
                          <h3 className="font-bold text-gray-900 text-base leading-tight">{exam.title}</h3>
                          <p className="text-sm text-indigo-600 font-medium mt-0.5">{exam.subject_name || 'N/A'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                          <div className="text-lg font-bold text-indigo-700">{exam.total_marks || 100}</div>
                          <div className="text-[10px] text-indigo-500 font-medium">marks</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-3 text-sm text-neutral-600"><div className="flex items-center gap-1.5"><LucideIcons.Calendar className="w-4 h-4 text-neutral-400" /> <span>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</span></div></div>
                      {exam.description && (<p className="text-sm text-neutral-500 mb-3 line-clamp-2">{exam.description}</p>)}
                      <button onClick={() => handleViewReport(exam)} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"><LucideIcons.Eye className="w-5 h-5" />View Report</button>
                    </div>
                  ))}
                </div>
              </div>

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
                        <td className="px-4 py-4"><div className="font-medium text-black text-base">{exam.title}</div>{exam.description && (<div className="text-sm text-neutral-500 truncate max-w-xs">{exam.description}</div>)}</td>
                        <td className="px-4 py-4 text-sm text-neutral-700">{exam.subject_name || 'N/A'}</td>
                        <td className="px-4 py-4"><span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700`}>{exam.exam_type?.toUpperCase() || 'N/A'}</span></td>
                        <td className="px-4 py-4 text-sm text-neutral-700">{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-4 py-4 text-sm text-neutral-700 font-medium hidden lg:table-cell">{exam.total_marks || 100}</td>
                        <td className="px-4 py-4 text-sm">{exam.average_score != null ? (<span className="font-medium text-indigo-600">{parseFloat(exam.average_score).toFixed(1)}%</span>) : (<span className="text-neutral-400">--</span>)}</td>
                        <td className="px-4 py-4 text-right"><button onClick={() => handleViewReport(exam)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"><LucideIcons.Eye className="w-4 h-4" />View Report</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {selectedExam && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-black">{selectedExam.title}</h2>
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{selectedExam.exam_type?.toUpperCase()}</span>
                </div>
                {selectedExam.description && (<p className="text-neutral-600 mb-3">{selectedExam.description}</p>)}
                <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
                  <span className="flex items-center gap-1"><LucideIcons.BookOpen className="w-4 h-4" />{selectedExam.subject_name || 'N/A'}</span>
                  <span className="flex items-center gap-1"><LucideIcons.Calendar className="w-4 h-4" />{selectedExam.exam_date ? new Date(selectedExam.exam_date).toLocaleDateString() : 'N/A'}</span>
                  <span className="flex items-center gap-1"><LucideIcons.Award className="w-4 h-4" />Total Marks: {selectedExam.total_marks || 100}</span>
                </div>
              </div>
            </div>
          </div>

          {loadingResults ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
          ) : examStats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <Card title="Total Students" value={examStats.total}    icon="Users"         accent="bg-indigo-500"  colored />
                <Card title="Graded"         value={examStats.submitted} icon="CheckCircle"   accent="bg-emerald-500" colored />
                <Card title="Pending"        value={examStats.pending}   icon="Clock"         accent="bg-amber-500"   colored />
                <Card title="Average"        value={`${examStats.average}%`}  icon="TrendingUp"    accent="bg-indigo-600"  colored />
                <Card title="Highest"        value={`${examStats.highest}%`}  icon="ArrowUpCircle" accent="bg-emerald-500" colored />
                <Card title="Lowest"         value={`${examStats.lowest}%`}   icon="ArrowDownCircle" accent="bg-pink-500" colored />
                <Card title="Pass Rate"      value={`${examStats.passRate}%`} icon="Award"         accent="bg-sky-500"     colored />
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-4 md:p-6">
                <h3 className="text-base font-semibold text-black mb-4">Grade Distribution</h3>
                {/* Stacked bar */}
                <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                  {Object.entries(examStats.grades).map(([grade, count]) => {
                    const pct = examStats.submitted > 0 ? (count / examStats.submitted) * 100 : 0
                    if (pct === 0) return null
                    const c = GRADE_COLORS[grade] || { bg: 'bg-neutral-400' }
                    return (
                      <div
                        key={grade}
                        className={`${c.bg} flex items-center justify-center text-white text-xs font-bold transition-all hover:opacity-90`}
                        style={{ width: `${pct}%` }}
                        title={`Grade ${grade}: ${count} (${pct.toFixed(1)}%)`}
                      >
                        {pct > 8 && grade}
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="grid grid-cols-5 sm:grid-cols-9 gap-1 md:gap-2">
                  {Object.entries(examStats.grades).map(([grade, count]) => {
                    const total = examStats.submitted
                    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0
                    const c = GRADE_COLORS[grade] || { text: 'text-neutral-700', light: 'bg-neutral-50' }
                    return (
                      <div key={grade} className={`${c.light} rounded-lg p-2 text-center`}>
                        <div className={`text-lg font-bold ${c.text}`}>{grade}</div>
                        <div className="text-xs text-neutral-600 mt-0.5">{count} <span className="hidden sm:inline">({pct}%)</span></div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="p-4 border-b border-neutral-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base md:text-lg font-semibold text-black">Student Results</h3>
                      <p className="text-xs md:text-sm text-neutral-500">Ranked by performance</p>
                    </div>
                  </div>
                  <div className="relative">
                    <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Search by student name or service number..." value={''} onChange={() => {}} className="w-full pl-10 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                  </div>
                </div>

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
                      {examResults.map((result, idx) => {
                        const isGraded = result.is_submitted && result.marks_obtained != null
                        const pct = isGraded ? ((parseFloat(result.marks_obtained) / (selectedExam.total_marks || 100)) * 100).toFixed(1) : 0
                        const grade = isGraded ? _gradeFromPct(pct) : null
                        const serialNumber = idx + 1
                        return (
                          <tr key={result.id} className="hover:bg-neutral-50 transition">
                            <td className="px-4 py-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-neutral-100`}>{serialNumber}</div></td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{result.student_svc_number || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{result.student_rank || 'N/A'}</td>
                            <td className="px-4 py-3"><div className="font-medium text-black text-base">{result.student_name || 'Unknown'}</div></td>
                            <td className="px-4 py-3 text-sm font-medium text-black">{result.marks_obtained} / {selectedExam.total_marks}</td>
                            <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-20 h-2 bg-neutral-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct >= 76 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >=50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }}></div></div><span className="text-sm font-medium text-black">{pct}%</span></div></td>
                            <td className="px-4 py-3"><span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full bg-gray-100`}>{grade}</span></td>
                            <td className="px-4 py-3 text-sm text-neutral-500 max-w-xs truncate hidden lg:table-cell">{result.remarks || '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={LucideIcons.FileText} title="No results yet" description="No exam results have been recorded for this exam." />
          )}
        </div>
      )}
    </div>
  )
}
