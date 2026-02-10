import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import ClassPerformanceBarChart from '../../components/ClassPerformanceBarChart'
import StudentPerformanceTable from '../../components/StudentPerformanceTable'
import * as Icons from 'lucide-react'

// Loading Skeleton Component
function LoadingSkeleton({ type = 'card' }) {
  if (type === 'card') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-1/2" />
      </div>
    )
  }

  if (type === 'table') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-2">
        <div className="h-4 bg-gray-100 rounded" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-4 bg-gray-100 rounded w-4/6" />
      </div>
    </div>
  )
}

// Enhanced Line Chart for Trends
function LineChart({ data, height = 200 }) {
  if (!data || data.length === 0) return null

  const maxValue = Math.max(...data.map(d => d.value), 100)
  const minValue = Math.min(...data.map(d => d.value), 0)
  const range = maxValue - minValue || 1

  return (
    <div className="relative" style={{ height: `${height}px` }}>
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500 pr-2 text-right">
        <span>{maxValue.toFixed(0)}%</span>
        <span>{((maxValue + minValue) / 2).toFixed(0)}%</span>
        <span>{minValue.toFixed(0)}%</span>
      </div>

      {/* Chart area */}
      <div className="ml-12 h-full relative">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="border-t border-gray-200" />
          ))}
        </div>

        {/* Line path */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path
            d={data.map((point, i) => {
              const x = (i / (data.length - 1)) * 100
              const y = ((maxValue - point.value) / range) * 100
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
            }).join(' ') + ` L 100 100 L 0 100 Z`}
            fill="url(#lineGradient)"
          />

          {/* Line */}
          <path
            d={data.map((point, i) => {
              const x = (i / (data.length - 1)) * 100
              const y = ((maxValue - point.value) / range) * 100
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
            }).join(' ')}
            fill="none"
            stroke="rgb(99, 102, 241)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Points */}
          {data.map((point, i) => {
            const x = (i / (data.length - 1)) * 100
            const y = ((maxValue - point.value) / range) * 100
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r="4"
                fill="white"
                stroke="rgb(99, 102, 241)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        {/* X-axis labels */}
        <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-gray-500">
          {data.map((point, i) => {
            if (i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) {
              return <span key={i}>{point.label}</span>
            }
            return <span key={i} className="invisible">.</span>
          })}
        </div>
      </div>
    </div>
  )
}

// Enhanced Bar Chart with animations
function BarChart({ data, labelKey, valueKey, maxValue, colorClass = 'bg-indigo-500' }) {
  if (!data || data.length === 0) return null
  const max = maxValue || Math.max(...data.map(d => d[valueKey] || 0), 1)

  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="w-32 text-sm text-gray-600 truncate" title={item[labelKey]}>
            {item[labelKey]}
          </div>
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
            <div
              className={`h-full ${colorClass} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
              style={{ width: `${Math.max((item[valueKey] / max) * 100, 5)}%` }}
            >
              <span className="text-xs text-white font-medium">{item[valueKey]?.toFixed?.(1) || item[valueKey]}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Enhanced Grade Distribution with better visuals
function GradeDistribution({ distribution }) {
  if (!distribution) return null

  const grades = ['A', 'B', 'C', 'D', 'F']
  const colors = {
    A: { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
    B: { bg: 'bg-sky-500', text: 'text-sky-700', light: 'bg-sky-50' },
    C: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50' },
    D: { bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-50' },
    F: { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50' }
  }
  const total = grades.reduce((sum, g) => sum + (distribution[g] || 0), 0)

  return (
    <div className="space-y-3">
      {/* Visual bar */}
      <div className="flex h-8 rounded-lg overflow-hidden">
        {grades.map(grade => {
          const count = distribution[grade] || 0
          const pct = total > 0 ? (count / total) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={grade}
              className={`${colors[grade].bg} flex items-center justify-center text-white text-xs font-bold transition-all hover:opacity-90`}
              style={{ width: `${pct}%` }}
              title={`Grade ${grade}: ${count} students (${pct.toFixed(1)}%)`}
            >
              {pct > 8 && grade}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-2">
        {grades.map(grade => {
          const count = distribution[grade] || 0
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0
          return (
            <div key={grade} className={`${colors[grade].light} rounded-lg p-3 text-center`}>
              <div className={`text-2xl font-bold ${colors[grade].text}`}>{grade}</div>
              <div className="text-xs text-gray-600 mt-1">{count} ({pct}%)</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Top performers list with medals
function TopPerformersList({ performers }) {
  if (!performers || performers.length === 0) {
    return <p className="text-sm text-gray-500">No data available</p>
  }

  // Show only top 3 performers
  const topThree = performers.slice(0, 3)

  const getMedalIcon = (rank) => {
    if (rank === 1) return <Icons.Medal className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
    if (rank === 2) return <Icons.Medal className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
    if (rank === 3) return <Icons.Medal className="w-4 h-4 md:w-5 md:h-5 text-orange-400" />
    return null
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs md:text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-1 md:px-2 font-medium text-gray-600">Rank</th>
            <th className="text-left py-2 px-1 md:px-2 font-medium text-gray-600">SVC Number</th>
            <th className="text-left py-2 px-1 md:px-2 font-medium text-gray-600">Student</th>
            <th className="text-right py-2 px-1 md:px-2 font-medium text-gray-600">Score</th>
            <th className="text-right py-2 px-1 md:px-2 font-medium text-gray-600 hidden md:table-cell">Attendance</th>
          </tr>
        </thead>
        <tbody>
          {topThree.map((p, idx) => (
            <tr key={p.student_id || idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-2 px-1 md:px-2">
                <div className="flex items-center gap-0.5 md:gap-1">
                  {getMedalIcon(p.rank || idx + 1)}
                  <span className={`inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full text-xs font-bold ${
                    idx === 0 ? 'bg-amber-100 text-amber-700' :
                    idx === 1 ? 'bg-gray-200 text-gray-700' :
                    idx === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {p.rank || idx + 1}
                  </span>
                </div>
              </td>
              <td className="py-2 px-1 md:px-2 text-gray-600 text-xs md:text-sm">{p.svc_number || '-'}</td>
              <td className="py-2 px-1 md:px-2 font-medium text-gray-800 text-xs md:text-sm">{p.student_name}</td>
              <td className="py-2 px-1 md:px-2 text-right">
                {(() => {
                  const score = p.exam_percentage !== undefined ? p.exam_percentage : 0;
                  let color = 'text-red-600';
                  if (score >= 70) color = 'text-emerald-600';
                  else if (score >= 50) color = 'text-amber-600';
                  return (
                    <span className={`font-semibold text-xs md:text-sm ${color}`}>
                      {score?.toFixed ? score.toFixed(1) : score}%
                    </span>
                  );
                })()}
              </td>
              <td className="py-2 px-1 md:px-2 text-right text-gray-600 text-xs md:text-sm hidden md:table-cell">
                {p.attendance_rate?.toFixed(1) || 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Attendance-Performance Correlation Display
function AttendanceCorrelation({ data }) {
  if (!data || data.message) {
    return <p className="text-sm text-gray-500">{data?.message || 'No correlation data available'}</p>
  }

  const coefficient = data.correlation_coefficient || 0
  const absCoefficient = Math.abs(coefficient)
  const isPositive = coefficient >= 0

  const getCorrelationColor = () => {
    if (absCoefficient >= 0.7) return isPositive ? 'text-emerald-600' : 'text-red-600'
    if (absCoefficient >= 0.4) return isPositive ? 'text-amber-600' : 'text-orange-600'
    return 'text-gray-600'
  }

  const getCorrelationBg = () => {
    if (absCoefficient >= 0.7) return isPositive ? 'bg-emerald-100' : 'bg-red-100'
    if (absCoefficient >= 0.4) return isPositive ? 'bg-amber-100' : 'bg-orange-100'
    return 'bg-gray-100'
  }

  const correlationPoints = data.correlation_data || []
  const maxAttendance = Math.max(...correlationPoints.map(p => p.attendance_rate), 100)
  const maxExam = Math.max(...correlationPoints.map(p => p.exam_percentage), 100)

  return (
    <div className="space-y-4">
      {/* Correlation Coefficient Display */}
      <div className="flex items-center justify-between">
        <div>
          <div className={`text-3xl font-bold ${getCorrelationColor()}`}>
            {coefficient.toFixed(3)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Correlation Coefficient</div>
        </div>
        <div className={`${getCorrelationBg()} px-3 py-2 rounded-lg`}>
          <div className="text-xs font-medium text-gray-700">
            {absCoefficient >= 0.7 ? 'Strong' : absCoefficient >= 0.4 ? 'Moderate' : absCoefficient >= 0.2 ? 'Weak' : 'Very Weak'}
            {' '}{isPositive ? 'Positive' : 'Negative'}
          </div>
        </div>
      </div>

      {/* Interpretation */}
      <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        {data.interpretation}
      </p>

      {/* Scatter Plot Visualization */}
      {correlationPoints.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-500 mb-2">
            Attendance vs Exam Performance ({data.data_points} students)
          </div>
          <div className="relative h-48 bg-gray-50 rounded-lg p-4">
            {/* Y-axis label */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-gray-500 origin-center whitespace-nowrap">
              Exam %
            </div>
            {/* X-axis label */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-gray-500">
              Attendance %
            </div>
            {/* Plot area */}
            <div className="ml-4 mb-4 h-full relative border-l border-b border-gray-300">
              {correlationPoints.slice(0, 50).map((point, idx) => {
                const x = (point.attendance_rate / maxAttendance) * 100
                const y = 100 - (point.exam_percentage / maxExam) * 100
                return (
                  <div
                    key={idx}
                    className="absolute w-2 h-2 bg-indigo-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 hover:bg-indigo-700 hover:w-3 hover:h-3 transition-all cursor-pointer"
                    style={{ left: `${x}%`, top: `${y}%` }}
                    title={`${point.student_name}: Attendance ${point.attendance_rate}%, Exam ${point.exam_percentage}%`}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Enhanced Subject Comparison with better visuals
function SubjectComparison({ subjects }) {
  const [showAll, setShowAll] = useState(false)
  const MAX_VISIBLE = 3

  if (!subjects || subjects.length === 0) {
    return <p className="text-sm text-gray-500">No subjects to compare</p>
  }

  // Sort by average percentage descending
  const sortedSubjects = [...subjects].sort((a, b) => (b.average_percentage || 0) - (a.average_percentage || 0))
  const visibleSubjects = showAll ? sortedSubjects : sortedSubjects.slice(0, MAX_VISIBLE)
  const hiddenCount = sortedSubjects.length - MAX_VISIBLE

  return (
    <div>
      <div className={`space-y-3 ${!showAll && hiddenCount > 0 ? 'max-h-[600px] overflow-hidden' : ''}`}>
        {visibleSubjects.map((subj, idx) => (
          <div key={subj.subject_id || idx} className="bg-gradient-to-r from-gray-50 to-white rounded-lg p-3 md:p-4 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0">
                  {idx + 1}
                </div>
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center ${
                  subj.average_percentage >= 70 ? 'bg-emerald-100' :
                  subj.average_percentage >= 50 ? 'bg-amber-100' :
                  'bg-red-100'
                }`}>
                  <Icons.BookOpen className={`w-4 h-4 md:w-5 md:h-5 ${
                    subj.average_percentage >= 70 ? 'text-emerald-600' :
                    subj.average_percentage >= 50 ? 'text-amber-600' :
                    'text-red-600'
                  }`} />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-gray-800 text-sm md:text-base truncate block" title={subj.subject_name}>{subj.subject_name}</span>
                  {subj.instructor && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                      <Icons.User className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {subj.instructor_rank && <span className="font-medium">{subj.instructor_rank} </span>}
                        {subj.instructor}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <div className={`text-xl md:text-2xl font-bold ${
                  subj.average_percentage >= 70 ? 'text-emerald-600' :
                  subj.average_percentage >= 50 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {subj.average_percentage?.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Class Average</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center p-1.5 bg-white rounded border border-gray-100">
                <div className="text-[10px] text-gray-500">Pass Rate</div>
                <div className="font-semibold text-gray-800 text-sm">{subj.pass_rate?.toFixed(0)}%</div>
              </div>
              <div className="text-center p-1.5 bg-white rounded border border-gray-100">
                <div className="text-[10px] text-gray-500">Exams</div>
                <div className="font-semibold text-gray-800 text-sm">{subj.total_exams || 0}</div>
              </div>
              <div className="text-center p-1.5 bg-white rounded border border-gray-100">
                <div className="text-[10px] text-gray-500">Highest</div>
                <div className="font-semibold text-emerald-600 text-sm">{subj.highest_score?.toFixed(0)}%</div>
              </div>
              <div className="text-center p-1.5 bg-white rounded border border-gray-100">
                <div className="text-[10px] text-gray-500">Lowest</div>
                <div className="font-semibold text-red-600 text-sm">{subj.lowest_score?.toFixed(0)}%</div>
              </div>
            </div>

            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  subj.average_percentage >= 70 ? 'bg-emerald-500' :
                  subj.average_percentage >= 50 ? 'bg-amber-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${subj.average_percentage || 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 w-full py-2 px-4 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {showAll ? (
            <>
              <Icons.ChevronUp className="w-4 h-4" />
              Show less
            </>
          ) : (
            <>
              <Icons.ChevronDown className="w-4 h-4" />
              Show {hiddenCount} more subject{hiddenCount > 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default function PerformanceAnalytics() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Selected filters
  const [selectedClass, setSelectedClass] = useState(searchParams.get('class') || '')
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subject') || '')
  // Instructors default to 'subject' view since they don't have access to class-level analytics
  const [viewMode, setViewMode] = useState(user?.role === 'instructor' ? 'subject' : 'class')

  // Analytics data
  const [classPerformance, setClassPerformance] = useState(null)
  const [subjectPerformance, setSubjectPerformance] = useState(null)
  const [subjectComparison, setSubjectComparison] = useState(null)
  const [classComparison, setClassComparison] = useState(null)
  const [trendData, setTrendData] = useState(null)
  const [correlationData, setCorrelationData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Load classes and subjects on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [classesResp, subjectsResp] = await Promise.all([
          user?.role === 'instructor' ? api.getMyClasses() : api.getAllClasses('is_active=true'),
          user?.role === 'instructor' ? api.getMySubjects() : api.getAllSubjects('is_active=true'),
        ])

        // Handle both direct arrays and paginated responses {count, results}
        const classList = Array.isArray(classesResp) ? classesResp : (classesResp?.results || [])
        const subjectList = Array.isArray(subjectsResp) ? subjectsResp : (subjectsResp?.results || [])

        setClasses(classList)
        setSubjects(subjectList)
      } catch (err) {
        // Silently handle data load error
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user])

  // Filter subjects by selected class
  const filteredSubjects = useMemo(() => {
    if (!selectedClass) return subjects
    return subjects.filter(s =>
      String(s.class_obj) === selectedClass ||
      String(s.class_obj?.id) === selectedClass ||
      String(s.class_id) === selectedClass
    )
  }, [subjects, selectedClass])

  // In Class View, instructors only see classes where they are the class instructor.
  // In Subject/Trends view they see all their classes (so subject filtering still works).
  const selectableClasses = useMemo(() => {
    if (user?.role === 'instructor' && viewMode === 'class') {
      return classes.filter(c => c.instructor === user?.id)
    }
    return classes
  }, [user, viewMode, classes])

  // True if the logged-in instructor is the class instructor of the currently selected class
  const isClassInstructor = useMemo(() => {
    if (user?.role !== 'instructor') return false
    if (!selectedClass) return false
    const cls = classes.find(c => String(c.id) === selectedClass)
    return cls?.instructor === user?.id
  }, [user, selectedClass, classes])

  // True if the instructor is a class instructor for at least one of their classes
  // Used to decide whether to show the Class View button at all
  const hasAnyClassInstructorRole = useMemo(() => {
    if (user?.role !== 'instructor') return false
    return classes.some(c => c.instructor === user?.id)
  }, [user, classes])

  // If instructor has selected a class but is NOT its class instructor, fall back to subject view.
  // Don't reset when no class is selected yet (they should be allowed to stay in class view to pick a class).
  useEffect(() => {
    if (user?.role === 'instructor' && viewMode === 'class' && selectedClass && !isClassInstructor) {
      setViewMode('subject')
    }
  }, [isClassInstructor, user, viewMode, selectedClass])

  // Load analytics when class/subject changes
  useEffect(() => {
    async function loadAnalytics() {
      // Don't load analytics if required filters aren't selected
      if (viewMode === 'class' && !selectedClass) {
        setClassPerformance(null)
        setSubjectComparison(null)
        setClassComparison(null)
        return
      }

      if ((viewMode === 'subject' || viewMode === 'trends') && !selectedSubject) {
        setSubjectPerformance(null)
        setTrendData(null)
        return
      }

      setAnalyticsLoading(true)
      setError(null)

      try {
        if (viewMode === 'class' && selectedClass) {
          const [perf, comparison, correlation] = await Promise.all([
            api.getClassPerformanceSummary(selectedClass).catch(() => null),
            api.compareSubjects(selectedClass).catch(() => null),
            api.getAttendanceCorrelation(selectedClass).catch(() => null),
          ])
          setClassPerformance(perf)
          setSubjectComparison(comparison)
          setCorrelationData(correlation)
        } else if (viewMode === 'subject' && selectedSubject) {
          const perf = await api.getSubjectPerformanceSummary(selectedSubject).catch(() => null)
          setSubjectPerformance(perf)
        } else if (viewMode === 'trends' && selectedSubject) {
          const trends = await api.getSubjectTrendAnalysis(selectedSubject, 90).catch(() => null)
          setTrendData(trends)
        }

        // Also load class comparison for overview when in class view
        if (viewMode === 'class' && selectedClass) {
          const classComp = await api.compareClasses().catch(() => null)
          setClassComparison(classComp)
        }

      } catch (err) {
        // Silently handle analytics load error
        setError(err.message)
      } finally {
        setAnalyticsLoading(false)
      }
    }

    loadAnalytics()
  }, [selectedClass, selectedSubject, viewMode])

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedClass) params.set('class', selectedClass)
    if (selectedSubject) params.set('subject', selectedSubject)
    setSearchParams(params, { replace: true })
  }, [selectedClass, selectedSubject, setSearchParams])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <LoadingSkeleton key={i} type="card" />)}
        </div>
        <LoadingSkeleton type="table" />
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <header>
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Icons.TrendingUp className="w-6 h-6 md:w-7 md:h-7 text-indigo-600" />
          Performance Analytics
        </h1>
        <p className="text-xs md:text-sm text-gray-500 mt-1">
          Comprehensive analysis of student performance across classes and subjects
        </p>
      </header>

      {/* View Mode Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 md:p-2 inline-flex gap-1 w-full sm:w-auto overflow-x-auto">
        {/* Class View - visible to non-instructors, or instructors who are a class instructor for at least one class */}
        {(user?.role !== 'instructor' || hasAnyClassInstructorRole) && (
          <button
            onClick={() => setViewMode('class')}
            className={`flex-1 sm:flex-none px-3 md:px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              viewMode === 'class'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icons.Layers className="w-3 h-3 md:w-4 md:h-4 inline mr-1 md:mr-1.5" />
            <span className="hidden sm:inline">Class View</span>
            <span className="sm:hidden">Class</span>
          </button>
        )}
        <button
          onClick={() => setViewMode('subject')}
          className={`flex-1 sm:flex-none px-3 md:px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
            viewMode === 'subject'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Icons.Book className="w-3 h-3 md:w-4 md:h-4 inline mr-1 md:mr-1.5" />
          <span className="hidden sm:inline">Subject View</span>
          <span className="sm:hidden">Subject</span>
        </button>
        <button
          onClick={() => setViewMode('trends')}
          className={`flex-1 sm:flex-none px-3 md:px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
            viewMode === 'trends'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Icons.LineChart className="w-3 h-3 md:w-4 md:h-4 inline mr-1 md:mr-1.5" />
          <span className="hidden sm:inline">Trend Analysis</span>
          <span className="sm:hidden">Trends</span>
        </button>
      </div>

      {/* Filters */}
      <div className={`bg-white rounded-xl border p-3 md:p-4 shadow-sm transition-all ${
        !selectedClass
          ? 'border-indigo-300 ring-2 ring-indigo-100'
          : 'border-gray-200'
      }`}>
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <label className={`flex items-center gap-1 text-xs md:text-sm font-medium mb-1.5 md:mb-2 ${
              !selectedClass ? 'text-indigo-700' : 'text-gray-700'
            }`}>
              <Icons.School className="w-3 h-3 md:w-4 md:h-4" />
              Select Class
              {!selectedClass && (
                <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full animate-pulse">
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
              className={`w-full px-3 md:px-4 py-2 md:py-2.5 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-white shadow-sm transition-all ${
                !selectedClass
                  ? 'border-indigo-300 ring-1 ring-indigo-100'
                  : 'border-gray-300'
              }`}
            >
              <option value="">Select a class...</option>
              {selectableClasses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.course_name ? `(${c.course_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {(viewMode === 'subject' || viewMode === 'trends') && (
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <label className={`flex items-center gap-1 text-xs md:text-sm font-medium mb-1.5 md:mb-2 ${
                !selectedSubject ? 'text-indigo-700' : 'text-gray-700'
              }`}>
                <Icons.BookOpen className="w-3 h-3 md:w-4 md:h-4" />
                Select Subject
                {!selectedSubject && selectedClass && (
                  <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full animate-pulse">
                    Required
                  </span>
                )}
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={!selectedClass}
                className={`w-full px-3 md:px-4 py-2 md:py-2.5 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 bg-white shadow-sm transition-all ${
                  !selectedClass
                    ? 'bg-gray-100 cursor-not-allowed border-gray-300'
                    : !selectedSubject
                    ? 'border-indigo-300 ring-1 ring-indigo-100'
                    : 'border-gray-300'
                }`}
              >
                <option value="">
                  {!selectedClass ? 'Select a class first...' : 'Select a subject...'}
                </option>
                {filteredSubjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ''}
                  </option>
                ))}
              </select>
              {!selectedClass && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Icons.Info className="w-3 h-3" />
                  Please select a class first
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-start gap-2">
          <Icons.AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Error loading analytics</div>
            <div className="text-sm mt-1">{error}</div>
          </div>
        </div>
      )}

      {analyticsLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <LoadingSkeleton key={i} type="card" />)}
        </div>
      )}

      {/* Class Performance View */}
      {viewMode === 'class' && classPerformance && !analyticsLoading && (
        <>
          {/* Summary Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              title="Total Students"
              value={classPerformance.overall_statistics?.total_students || 0}
              icon="Users"
              accent="bg-indigo-500"
              colored
            />
            <Card
              title="Class Average"
              value={`${classPerformance.overall_statistics?.class_exam_average?.toFixed(1) || 0}%`}
              icon="TrendingUp"
              accent="bg-emerald-500"
              colored
            />
            <Card
              title="Pass Rate"
              value={`${classPerformance.overall_statistics?.exam_pass_rate?.toFixed(1) || 0}%`}
              icon="Award"
              accent="bg-amber-500"
              colored
            />
            <Card
              title="Attendance Rate"
              value={`${classPerformance.overall_statistics?.class_attendance_rate?.toFixed(1) || 0}%`}
              icon="CheckSquare"
              accent="bg-sky-500"
              colored
            />
          </section>

          {/* Grade Distribution & Top Performers */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.PieChart className="w-5 h-5 text-indigo-500" />
                Grade Distribution
              </h3>
              <GradeDistribution distribution={classPerformance.grade_distribution} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.Trophy className="w-5 h-5 text-amber-500" />
                Top 3 Performers
              </h3>
              <TopPerformersList performers={classPerformance.top_performers} />
            </div>
          </section>

          {/* Subject Comparison */}
          {subjectComparison?.subjects && (
            <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.BarChart2 className="w-5 h-5 text-indigo-500" />
                Subject Performance Comparison
              </h3>
              <SubjectComparison subjects={subjectComparison.subjects} />
            </section>
          )}

          {/* Attendance-Performance Correlation */}
          {correlationData && (
            <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.GitBranch className="w-5 h-5 text-purple-500" />
                Attendance-Performance Correlation
              </h3>
              <AttendanceCorrelation data={correlationData} />
            </section>
          )}

          {/* All Students Table */}
          {classPerformance.all_students && classPerformance.all_students.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
              <StudentPerformanceTable students={classPerformance.all_students} />
            </section>
          )}
        </>
      )}

      {/* Subject Performance View */}
      {viewMode === 'subject' && subjectPerformance && !analyticsLoading && (
        <>
          {/* Subject Info */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <Icons.Book className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {subjectPerformance.subject?.name}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {subjectPerformance.subject?.instructor && `Instructor: ${subjectPerformance.subject.instructor}`}
                  {subjectPerformance.subject?.class && ` • Class: ${subjectPerformance.subject.class}`}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              title="Students Enrolled"
              value={subjectPerformance.overall_statistics?.total_students_enrolled || 0}
              icon="Users"
              accent="bg-indigo-500"
              colored
            />
            <Card
              title="Average Score"
              value={`${subjectPerformance.overall_statistics?.exam_average_percentage?.toFixed(1) || 0}%`}
              icon="TrendingUp"
              accent="bg-emerald-500"
              colored
            />
            <Card
              title="Pass Rate"
              value={`${subjectPerformance.overall_statistics?.exam_pass_rate?.toFixed(1) || 0}%`}
              icon="Award"
              accent="bg-amber-500"
              colored
            />
            <Card
              title="Total Exams"
              value={subjectPerformance.overall_statistics?.total_exams || 0}
              icon="Clipboard"
              accent="bg-sky-500"
              colored
            />
          </section>

          {/* Grade Distribution & Top Performers */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.PieChart className="w-5 h-5 text-indigo-500" />
                Grade Distribution
              </h3>
              <GradeDistribution distribution={subjectPerformance.grade_distribution} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.Trophy className="w-5 h-5 text-amber-500" />
                Top Performers
              </h3>
              <TopPerformersList performers={subjectPerformance.top_performers} />
            </div>
          </section>

          {/* Exam Breakdown */}
          {subjectPerformance.exam_breakdown && subjectPerformance.exam_breakdown.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
              <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Icons.FileText className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
                Exam Performance Breakdown
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600">Exam</th>
                      <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600">Type</th>
                      <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden sm:table-cell">Date</th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden md:table-cell">Attempted</th>
                      <th className="text-right py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600">Average</th>
                      <th className="text-right py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden lg:table-cell">Highest</th>
                      <th className="text-right py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden lg:table-cell">Lowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectPerformance.exam_breakdown.map((exam, idx) => (
                      <tr key={exam.exam_id || idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-2 md:py-3 px-2 md:px-3 font-medium text-gray-800">{exam.exam_title}</td>
                        <td className="py-2 md:py-3 px-2 md:px-3">
                          <span className={`inline-flex px-1.5 md:px-2 py-0.5 md:py-1 text-xs font-medium rounded-full ${
                            exam.exam_type === 'final' ? 'bg-red-100 text-red-700' :
                            exam.exam_type === 'midterm' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {exam.exam_type}
                          </span>
                        </td>
                        <td className="py-2 md:py-3 px-2 md:px-3 text-gray-600 hidden sm:table-cell">
                          {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-2 md:py-3 px-2 md:px-3 text-center text-gray-600 hidden md:table-cell">{exam.students_attempted}</td>
                        <td className="py-2 md:py-3 px-2 md:px-3 text-right font-semibold text-indigo-600">
                          {exam.average_percentage?.toFixed(1)}%
                        </td>
                        <td className="py-2 md:py-3 px-2 md:px-3 text-right text-emerald-600 hidden lg:table-cell">{exam.highest_score?.toFixed(1)}%</td>
                        <td className="py-2 md:py-3 px-2 md:px-3 text-right text-red-600 hidden lg:table-cell">{exam.lowest_score?.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Trend Analysis View */}
      {viewMode === 'trends' && trendData && !analyticsLoading && (
        <>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center shadow-md">
                <Icons.LineChart className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Performance Trend Analysis</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {trendData.subject?.name} • {trendData.period?.days} days analysis
                </p>
              </div>
            </div>
          </div>

          {trendData.trend && trendData.trend.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Icons.Activity className="w-5 h-5 text-purple-500" />
                Performance Over Time
              </h3>
              <LineChart
                data={trendData.trend
                  .filter(t => t.type === 'exam' && t.average_percentage != null)
                  .map(t => ({
                    label: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    value: t.average_percentage
                  }))}
                height={250}
              />
              <div className="mt-8">
                <h4 className="font-medium text-gray-800 mb-3">Details</h4>
                <div className="space-y-2">
                  {trendData.trend.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-800">
                          {item.type === 'exam' ? item.exam_title : item.session_title}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(item.date).toLocaleDateString()} • {item.type === 'exam'
                            ? `${item.students_attempted || 0} students attempted`
                            : `${item.students_marked || 0} students marked`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.type === 'exam' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {item.type === 'exam' ? 'Exam' : 'Attendance'}
                        </span>
                        <div className={`text-lg font-bold ${
                          (item.average_percentage ?? item.attendance_rate ?? 0) >= 70 ? 'text-emerald-600' :
                          (item.average_percentage ?? item.attendance_rate ?? 0) >= 50 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          {(item.average_percentage ?? item.attendance_rate ?? 0).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon="LineChart"
              title="No trend data available"
              description="No exams found in the selected period to analyze trends"
            />
          )}
        </>
      )}

      {/* Class Comparison Section - only show in class view */}
      {viewMode === 'class' && classComparison?.classes && classComparison.classes.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Icons.BarChart2 className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
            Class Performance Comparison
          </h3>
          <ClassPerformanceBarChart classes={classComparison.classes} />
        </section>
      )}

      {/* Empty state */}
      {!analyticsLoading && !classPerformance && !subjectPerformance && !trendData && (
        <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl border-2 border-dashed border-indigo-200 p-8 md:p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icons.BarChart2 className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
              {viewMode === 'class' ? 'Select a Class to View Analytics' :
               !selectedClass ? 'Select a Class First' :
               viewMode === 'subject' ? 'Select a Subject to View Performance' :
               'Select a Subject for Trend Analysis'}
            </h3>
            <p className="text-sm md:text-base text-gray-600 mb-6">
              {viewMode === 'class' ? 'Choose a class from the dropdown above to view detailed performance metrics, grade distribution, top performers, and subject comparisons.' :
               !selectedClass ? 'You need to select a class before choosing a subject. Please select a class from the dropdown above to continue.' :
               viewMode === 'subject' ? 'Choose a subject from the dropdown above to view exam breakdowns, student performance, and grade distribution for that subject.' :
               'Choose a subject from the dropdown above to analyze performance trends over time with visual charts and exam history.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500">
              {selectedClass || viewMode === 'class' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Icons.Users className="w-4 h-4 text-indigo-500" />
                    <span>Student Rankings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.PieChart className="w-4 h-4 text-indigo-500" />
                    <span>Grade Distribution</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icons.TrendingUp className="w-4 h-4 text-indigo-500" />
                    <span>Performance Insights</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <Icons.AlertCircle className="w-4 h-4" />
                  <span>Class selection required first</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
