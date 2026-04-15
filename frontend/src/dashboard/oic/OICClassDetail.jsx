import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import {
  getOICClassDetail,
  getOICClassStudents,
  getOICClassSubjects,
  getOICClassResultsSummary,
  getOICClassAttendanceSummary,
} from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

const TABS = ['Students', 'Subjects', 'Results', 'Attendance']

// Lower index = more senior. Matches backend RANK_CHOICES display values (senior → junior).
const RANK_ORDER = [
  'general',
  'lieutenant general',
  'major general',
  'brigadier',
  'colonel',
  'lieutenant colonel',
  'major',
  'captain',
  'lieutenant',
  'warrant officer i',
  'warrant officer ii',
  'senior sergeant',
  'sergeant',
  'corporal',
  'lance corporal',
  'private',
]

function rankIndex(rank = '') {
  const r = rank.toLowerCase().trim()
  const i = RANK_ORDER.indexOf(r)
  return i === -1 ? RANK_ORDER.length : i
}

function bySeniority(aRank, aSvc, bRank, bSvc) {
  const ri = rankIndex(aRank) - rankIndex(bRank)
  if (ri !== 0) return ri
  // same rank → lower service number is senior
  return (aSvc || '').localeCompare(bSvc || '', undefined, { numeric: true, sensitivity: 'base' })
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(name = '') {
  return name.split(' ').map(s => s[0] || '').slice(0, 2).join('').toUpperCase()
}

function PctBar({ value, colorClass = 'bg-indigo-500' }) {
  const pct = Math.min(parseFloat(value) || 0, 100)
  return (
    <div className="w-full bg-neutral-100 rounded-full h-1.5 mt-1">
      <div className={`${colorClass} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function OICClassDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('Students')
  const [classInfo, setClassInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  // Tab data
  const [students, setStudents] = useState(null)
  const [subjects, setSubjects] = useState(null)
  const [results, setResults] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [tabLoading, setTabLoading] = useState(false)

  // Students pagination + search
  const [studentSearch, setStudentSearch] = useState('')
  const [studentPage, setStudentPage] = useState(1)
  const studentPageSize = 10

  const filteredStudents = useMemo(() => {
    const all = students?.students || []
    const q = studentSearch.trim().toLowerCase()
    const list = q
      ? all.filter(s =>
          s.name?.toLowerCase().includes(q) ||
          s.svc_number?.toLowerCase().includes(q) ||
          s.rank?.toLowerCase().includes(q)
        )
      : [...all]
    return list.sort((a, b) => bySeniority(a.rank, a.svc_number, b.rank, b.svc_number))
  }, [students, studentSearch])
  const totalStudents = filteredStudents.length
  const totalStudentPages = Math.max(1, Math.ceil(totalStudents / studentPageSize))
  const safeStudentPage = Math.min(studentPage, totalStudentPages)
  const pageStudents = filteredStudents.slice((safeStudentPage - 1) * studentPageSize, safeStudentPage * studentPageSize)

  // Subjects pagination + search
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectPage, setSubjectPage] = useState(1)
  const subjectPageSize = 10

  const filteredSubjects = useMemo(() => {
    const all = subjects?.subjects || []
    const q = subjectSearch.trim().toLowerCase()
    const list = q
      ? all.filter(s =>
          s.name?.toLowerCase().includes(q) ||
          s.subject_code?.toLowerCase().includes(q) ||
          s.instructor_name?.toLowerCase().includes(q) ||
          s.instructor_svc_number?.toLowerCase().includes(q) ||
          s.instructor_rank?.toLowerCase().includes(q)
        )
      : [...all]
    return list.sort((a, b) => bySeniority(a.instructor_rank, a.instructor_svc_number, b.instructor_rank, b.instructor_svc_number))
  }, [subjects, subjectSearch])
  const totalSubjects = filteredSubjects.length
  const totalSubjectPages = Math.max(1, Math.ceil(totalSubjects / subjectPageSize))
  const safeSubjectPage = Math.min(subjectPage, totalSubjectPages)
  const pageSubjects = filteredSubjects.slice((safeSubjectPage - 1) * subjectPageSize, safeSubjectPage * subjectPageSize)

  // Results pagination + search
  const [resultSearch, setResultSearch] = useState('')
  const [resultPage, setResultPage] = useState(1)
  const resultPageSize = 10

  const filteredResults = useMemo(() => {
    const all = results?.subject_performance || []
    const q = resultSearch.trim().toLowerCase()
    if (!q) return all
    return all.filter(r =>
      r.subject_name?.toLowerCase().includes(q) ||
      r.instructor?.toLowerCase().includes(q)
    )
  }, [results, resultSearch])
  const totalResults = filteredResults.length
  const totalResultPages = Math.max(1, Math.ceil(totalResults / resultPageSize))
  const safeResultPage = Math.min(resultPage, totalResultPages)
  const pageResults = filteredResults.slice((safeResultPage - 1) * resultPageSize, safeResultPage * resultPageSize)

  // Attendance pagination + search
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [attendancePage, setAttendancePage] = useState(1)
  const attendancePageSize = 10

  const filteredAttendance = useMemo(() => {
    const all = attendance?.student_attendance || []
    const q = attendanceSearch.trim().toLowerCase()
    const list = q
      ? all.filter(s =>
          s.student_name?.toLowerCase().includes(q) ||
          s.svc_number?.toLowerCase().includes(q) ||
          s.rank?.toLowerCase().includes(q)
        )
      : [...all]
    return list.sort((a, b) => bySeniority(a.rank, a.svc_number, b.rank, b.svc_number))
  }, [attendance, attendanceSearch])
  const totalAttendance = filteredAttendance.length
  const totalAttendancePages = Math.max(1, Math.ceil(totalAttendance / attendancePageSize))
  const safeAttendancePage = Math.min(attendancePage, totalAttendancePages)
  const pageAttendance = filteredAttendance.slice((safeAttendancePage - 1) * attendancePageSize, safeAttendancePage * attendancePageSize)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  // Load class info once
  useEffect(() => {
    ;(async () => {
      try {
        const data = await getOICClassDetail(id)
        setClassInfo(data)
      } catch (err) {
        reportError(err?.message || 'Failed to load class')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, reportError])

  // Load tab data lazily
  useEffect(() => {
    if (!id) return

    const alreadyLoaded = {
      Students: students !== null,
      Subjects: subjects !== null,
      Results: results !== null,
      Attendance: attendance !== null,
    }
    if (alreadyLoaded[activeTab]) return

    setTabLoading(true)
    const fetchers = {
      Students: () => getOICClassStudents(id).then(d => setStudents(d)),
      Subjects: () => getOICClassSubjects(id).then(d => setSubjects(d)),
      Results: () => getOICClassResultsSummary(id).then(d => setResults(d)),
      Attendance: () => getOICClassAttendanceSummary(id).then(d => setAttendance(d)),
    }
    fetchers[activeTab]()
      .catch(err => reportError(err?.message || `Failed to load ${activeTab.toLowerCase()}`))
      .finally(() => setTabLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id])

  if (loading) {
    return (
      <div className="p-4">
        <EmptyState icon="Loader2" title="Loading class..." variant="minimal" />
      </div>
    )
  }

  if (!classInfo) {
    return (
      <div className="p-4">
        <EmptyState icon="AlertCircle" title="Class not found" variant="minimal" />
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Back link */}
      <Link to="/oic/classes" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mb-4">
        <Icons.ChevronLeft className="w-4 h-4" /> Back to classes
      </Link>

      {/* Class header */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-black">{classInfo.name}</h2>
            <p className="text-sm text-neutral-500 mt-1">{classInfo.course_name || 'No course'} — {classInfo.class_code || ''}</p>
            {classInfo.department_name && (
              <p className="text-xs text-neutral-400 mt-0.5">{classInfo.department_name}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              classInfo.is_closed ? 'bg-red-100 text-red-700' :
              classInfo.is_active ? 'bg-green-100 text-green-700' :
              'bg-neutral-100 text-neutral-500'
            }`}>
              {classInfo.is_closed ? 'Closed' : classInfo.is_active ? 'Active' : 'Inactive'}
            </span>
            {classInfo.enrollment_status && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-medium capitalize">
                {classInfo.enrollment_status}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Start Date', value: formatDate(classInfo.start_date) },
            { label: 'End Date', value: formatDate(classInfo.end_date) },
            { label: 'Capacity', value: classInfo.capacity ?? '—' },
            { label: 'Enrolled', value: classInfo.current_enrollment ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-neutral-50 rounded-lg p-3">
              <div className="text-xs text-neutral-500">{label}</div>
              <div className="text-sm font-semibold text-black mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-neutral-500 hover:text-black'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabLoading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <EmptyState icon="Loader2" title={`Loading ${activeTab.toLowerCase()}...`} variant="minimal" />
        </div>
      ) : (
        <>
          {/* STUDENTS */}
          {activeTab === 'Students' && (
            <div className="space-y-4">
              {/* Search bar */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <div className="relative flex-1">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      value={studentSearch}
                      onChange={e => { setStudentSearch(e.target.value); setStudentPage(1) }}
                      placeholder="Search by name, service number or rank..."
                      className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  {studentSearch && (
                    <button
                      onClick={() => { setStudentSearch(''); setStudentPage(1) }}
                      className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {!students ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-6">
                  <EmptyState icon="Users" title="No student data" variant="minimal" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-6">
                  <EmptyState icon="Users" title="No students found" description={studentSearch ? `No match for "${studentSearch}"` : 'No students enrolled in this class.'} variant="minimal" />
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  {/* Mobile cards */}
                  <div className="lg:hidden p-4 space-y-3">
                    {pageStudents.map(s => (
                      <div key={s.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                              {initials(s.name || s.svc_number)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-black truncate">{s.name || '—'}</div>
                              <div className="text-xs text-neutral-600">{s.svc_number || '—'}</div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs mt-2">
                          {s.rank && <div className="flex justify-between"><span className="text-neutral-500">Rank</span><span className="text-black">{s.rank}</span></div>}
                          <div className="flex justify-between"><span className="text-neutral-500">Enrolled</span><span className="text-black">{formatDate(s.enrollment_date)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead className="bg-neutral-50">
                        <tr className="text-left">
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">#</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Enrolled</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 bg-white">
                        {pageStudents.map((s, i) => (
                          <tr key={s.id} className="hover:bg-neutral-50 transition">
                            <td className="px-4 py-3 text-sm text-neutral-400">{(safeStudentPage - 1) * studentPageSize + i + 1}</td>
                            <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap font-medium">{s.svc_number || '—'}</td>
                            <td className="px-4 py-3 text-sm text-neutral-700">{s.rank || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                                  {initials(s.name || s.svc_number)}
                                </div>
                                <span className="font-medium text-sm text-black">{s.name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(s.enrollment_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalStudents > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-neutral-600">
                      Showing <span className="font-semibold text-black">{Math.min((safeStudentPage - 1) * studentPageSize + 1, totalStudents)}</span> to{' '}
                      <span className="font-semibold text-black">{Math.min(safeStudentPage * studentPageSize, totalStudents)}</span> of{' '}
                      <span className="font-semibold text-black">{totalStudents}</span> students
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                        disabled={safeStudentPage === 1}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                      </button>

                      {(() => {
                        const pages = []
                        const maxVisible = 5
                        let start = Math.max(1, safeStudentPage - Math.floor(maxVisible / 2))
                        let end = Math.min(totalStudentPages, start + maxVisible - 1)
                        if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                        if (start > 1) {
                          pages.push(<button key={1} onClick={() => setStudentPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                          if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                        }
                        for (let i = start; i <= end; i++) {
                          pages.push(
                            <button key={i} onClick={() => setStudentPage(i)}
                              className={`px-3 py-1.5 text-sm rounded-lg transition ${safeStudentPage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>
                              {i}
                            </button>
                          )
                        }
                        if (end < totalStudentPages) {
                          if (end < totalStudentPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                          pages.push(<button key={totalStudentPages} onClick={() => setStudentPage(totalStudentPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalStudentPages}</button>)
                        }
                        return pages
                      })()}

                      <button
                        onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))}
                        disabled={safeStudentPage >= totalStudentPages}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUBJECTS */}
          {activeTab === 'Subjects' && (
            <div className="space-y-4">
              {/* Search bar */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <div className="relative flex-1">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      value={subjectSearch}
                      onChange={e => { setSubjectSearch(e.target.value); setSubjectPage(1) }}
                      placeholder="Search by subject, code or instructor..."
                      className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  {subjectSearch && (
                    <button
                      onClick={() => { setSubjectSearch(''); setSubjectPage(1) }}
                      className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {!subjects ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-6">
                  <EmptyState icon="BookOpen" title="No subject data" variant="minimal" />
                </div>
              ) : filteredSubjects.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-6">
                  <EmptyState icon="BookOpen" title="No subjects found" description={subjectSearch ? `No match for "${subjectSearch}"` : 'No subjects assigned to this class.'} variant="minimal" />
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  {/* Mobile cards */}
                  <div className="lg:hidden p-4 space-y-3">
                    {pageSubjects.map(s => (
                      <div key={s.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                        <div className="font-medium text-sm text-black mb-1">{s.name}</div>
                        <div className="text-xs text-indigo-600 font-medium mb-2">{s.subject_code || '—'}</div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span className="text-neutral-500">Instr. Svc No</span><span className="text-black font-medium">{s.instructor_svc_number || '—'}</span></div>
                          <div className="flex justify-between"><span className="text-neutral-500">Instr. Rank</span><span className="text-black">{s.instructor_rank || '—'}</span></div>
                          <div className="flex justify-between"><span className="text-neutral-500">Instructor</span><span className="text-black">{s.instructor_name || '—'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="min-w-full table-auto">
                      <thead className="bg-neutral-50">
                        <tr className="text-left">
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">#</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Instr. Svc No</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Instr. Rank</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Subject</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Code</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 bg-white">
                        {pageSubjects.map((s, i) => (
                          <tr key={s.id} className="hover:bg-neutral-50 transition">
                            <td className="px-4 py-3 text-sm text-neutral-400">{(safeSubjectPage - 1) * subjectPageSize + i + 1}</td>
                            <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap font-medium">{s.instructor_svc_number || '—'}</td>
                            <td className="px-4 py-3 text-sm text-neutral-700">{s.instructor_rank || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                                  {initials(s.instructor_name || s.instructor_svc_number || '?')}
                                </div>
                                <span className="text-sm text-black">{s.instructor_name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-black">{s.name}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{s.subject_code || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalSubjects > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-neutral-600">
                      Showing <span className="font-semibold text-black">{Math.min((safeSubjectPage - 1) * subjectPageSize + 1, totalSubjects)}</span> to{' '}
                      <span className="font-semibold text-black">{Math.min(safeSubjectPage * subjectPageSize, totalSubjects)}</span> of{' '}
                      <span className="font-semibold text-black">{totalSubjects}</span> subjects
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSubjectPage(p => Math.max(1, p - 1))}
                        disabled={safeSubjectPage === 1}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                      </button>

                      {(() => {
                        const pages = []
                        const maxVisible = 5
                        let start = Math.max(1, safeSubjectPage - Math.floor(maxVisible / 2))
                        let end = Math.min(totalSubjectPages, start + maxVisible - 1)
                        if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                        if (start > 1) {
                          pages.push(<button key={1} onClick={() => setSubjectPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                          if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                        }
                        for (let i = start; i <= end; i++) {
                          pages.push(
                            <button key={i} onClick={() => setSubjectPage(i)}
                              className={`px-3 py-1.5 text-sm rounded-lg transition ${safeSubjectPage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>
                              {i}
                            </button>
                          )
                        }
                        if (end < totalSubjectPages) {
                          if (end < totalSubjectPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                          pages.push(<button key={totalSubjectPages} onClick={() => setSubjectPage(totalSubjectPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalSubjectPages}</button>)
                        }
                        return pages
                      })()}

                      <button
                        onClick={() => setSubjectPage(p => Math.min(totalSubjectPages, p + 1))}
                        disabled={safeSubjectPage >= totalSubjectPages}
                        className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RESULTS */}
          {activeTab === 'Results' && (
            <div className="space-y-4">
              {!results ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-6">
                  <EmptyState icon="BarChart2" title="No results data" variant="minimal" />
                </div>
              ) : (
                <>
                  {/* Overall stats */}
                  {results.overall_statistics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Results', value: results.overall_statistics.total_results },
                        { label: 'Avg Score', value: results.overall_statistics.average_percentage != null ? `${results.overall_statistics.average_percentage}%` : '—' },
                        { label: 'Pass Rate', value: results.overall_statistics.pass_rate != null ? `${results.overall_statistics.pass_rate}%` : '—' },
                        { label: 'Total Subjects', value: results.subject_performance?.length ?? '—' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white rounded-xl border border-neutral-200 p-3">
                          <div className="text-xs text-neutral-500">{label}</div>
                          <div className="text-lg font-semibold text-black mt-1">{value ?? '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Per-subject breakdown */}
                  <div className="space-y-4">
                    {/* Search */}
                    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                        <div className="relative flex-1">
                          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            value={resultSearch}
                            onChange={e => { setResultSearch(e.target.value); setResultPage(1) }}
                            placeholder="Search by subject or instructor..."
                            className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </div>
                        {resultSearch && (
                          <button
                            onClick={() => { setResultSearch(''); setResultPage(1) }}
                            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition whitespace-nowrap"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {filteredResults.length === 0 ? (
                      <div className="bg-white rounded-xl border border-neutral-200 p-6">
                        <EmptyState icon="BarChart2" title="No results found" description={resultSearch ? `No match for "${resultSearch}"` : 'No subject performance data.'} variant="minimal" />
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-neutral-100">
                          <span className="text-sm font-medium text-black">Subject Performance</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full table-auto">
                            <thead className="bg-neutral-50">
                              <tr className="text-left">
                                {['#', 'Subject', 'Instructor', 'Results', 'Avg %', 'Pass Rate', 'Highest', 'Lowest'].map(h => (
                                  <th key={h} className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 bg-white">
                              {pageResults.map((sp, i) => (
                                <tr key={sp.subject_id || i} className="hover:bg-neutral-50 transition">
                                  <td className="px-4 py-3 text-sm text-neutral-400">{(safeResultPage - 1) * resultPageSize + i + 1}</td>
                                  <td className="px-4 py-3 text-sm font-medium text-black">{sp.subject_name || '—'}</td>
                                  <td className="px-4 py-3 text-sm text-neutral-500">{sp.instructor || '—'}</td>
                                  <td className="px-4 py-3 text-sm text-neutral-600">{sp.total_results ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    <span className={`text-sm font-semibold ${(sp.average_percentage || 0) >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                      {sp.average_percentage != null ? `${sp.average_percentage}%` : '—'}
                                    </span>
                                    <PctBar value={sp.average_percentage} colorClass={(sp.average_percentage || 0) >= 50 ? 'bg-emerald-500' : 'bg-red-400'} />
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`text-sm font-semibold ${(sp.pass_rate || 0) >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                      {sp.pass_rate != null ? `${sp.pass_rate}%` : '—'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-emerald-600">{sp.highest_score != null ? `${sp.highest_score}%` : '—'}</td>
                                  <td className="px-4 py-3 text-sm text-red-500">{sp.lowest_score != null ? `${sp.lowest_score}%` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Pagination */}
                    {totalResults > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="text-sm text-neutral-600">
                            Showing <span className="font-semibold text-black">{Math.min((safeResultPage - 1) * resultPageSize + 1, totalResults)}</span> to{' '}
                            <span className="font-semibold text-black">{Math.min(safeResultPage * resultPageSize, totalResults)}</span> of{' '}
                            <span className="font-semibold text-black">{totalResults}</span> subjects
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setResultPage(p => Math.max(1, p - 1))}
                              disabled={safeResultPage === 1}
                              className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                            </button>
                            {(() => {
                              const pages = []
                              const maxVisible = 5
                              let start = Math.max(1, safeResultPage - Math.floor(maxVisible / 2))
                              let end = Math.min(totalResultPages, start + maxVisible - 1)
                              if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                              if (start > 1) {
                                pages.push(<button key={1} onClick={() => setResultPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                                if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                              }
                              for (let i = start; i <= end; i++) {
                                pages.push(
                                  <button key={i} onClick={() => setResultPage(i)}
                                    className={`px-3 py-1.5 text-sm rounded-lg transition ${safeResultPage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>
                                    {i}
                                  </button>
                                )
                              }
                              if (end < totalResultPages) {
                                if (end < totalResultPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                                pages.push(<button key={totalResultPages} onClick={() => setResultPage(totalResultPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalResultPages}</button>)
                              }
                              return pages
                            })()}
                            <button
                              onClick={() => setResultPage(p => Math.min(totalResultPages, p + 1))}
                              disabled={safeResultPage >= totalResultPages}
                              className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ATTENDANCE */}
          {activeTab === 'Attendance' && (
            <div className="space-y-4">
              {!attendance ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-6">
                  <EmptyState icon="UserCheck" title="No attendance data" variant="minimal" />
                </div>
              ) : (
                <>
                  {/* Summary stats */}
                  {attendance.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Sessions', value: attendance.summary.total_sessions },
                        { label: 'Completed', value: attendance.summary.completed_sessions },
                        { label: 'Attendance Rate', value: attendance.summary.overall_attendance_rate != null ? `${attendance.summary.overall_attendance_rate}%` : '—' },
                        { label: 'Total Students', value: attendance.summary.total_students },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white rounded-xl border border-neutral-200 p-3">
                          <div className="text-xs text-neutral-500">{label}</div>
                          <div className="text-lg font-semibold text-black mt-1">{value ?? '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Search */}
                  <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      <div className="relative flex-1">
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                          value={attendanceSearch}
                          onChange={e => { setAttendanceSearch(e.target.value); setAttendancePage(1) }}
                          placeholder="Search by name, service number or rank..."
                          className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                      {attendanceSearch && (
                        <button
                          onClick={() => { setAttendanceSearch(''); setAttendancePage(1) }}
                          className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition whitespace-nowrap"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per-student attendance */}
                  {filteredAttendance.length === 0 ? (
                    <div className="bg-white rounded-xl border border-neutral-200 p-6">
                      <EmptyState icon="UserCheck" title="No students found" description={attendanceSearch ? `No match for "${attendanceSearch}"` : 'No attendance records.'} variant="minimal" />
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-neutral-100">
                        <span className="text-sm font-medium text-black">Student Attendance Breakdown</span>
                      </div>

                      {/* Mobile cards */}
                      <div className="lg:hidden p-4 space-y-3">
                        {pageAttendance.map(sa => (
                          <div key={sa.student_id} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                                {initials(sa.student_name || sa.svc_number)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-neutral-700">{sa.svc_number || '—'}</div>
                                <div className="text-xs text-neutral-500">{sa.rank || '—'}</div>
                                <div className="font-medium text-sm text-black truncate">{sa.student_name || '—'}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              <div className="flex justify-between"><span className="text-neutral-500">Sessions</span><span className="text-black">{sa.sessions_attended ?? '—'}</span></div>
                              <div className="flex justify-between"><span className="text-neutral-500">Present</span><span className="text-emerald-600 font-medium">{sa.present ?? '—'}</span></div>
                              <div className="flex justify-between"><span className="text-neutral-500">Late</span><span className="text-amber-500">{sa.late ?? '—'}</span></div>
                              <div className="flex justify-between"><span className="text-neutral-500">Absent</span><span className="text-red-500">{sa.absent ?? '—'}</span></div>
                            </div>
                            <div className="mt-2">
                              <span className={`text-xs font-semibold ${(sa.attendance_rate || 0) >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                Rate: {sa.attendance_rate != null ? `${sa.attendance_rate}%` : '—'}
                              </span>
                              <PctBar value={sa.attendance_rate} colorClass={(sa.attendance_rate || 0) >= 75 ? 'bg-emerald-500' : 'bg-red-400'} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop table */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="min-w-full table-auto">
                          <thead className="bg-neutral-50">
                            <tr className="text-left">
                              {['#', 'Svc Number', 'Rank', 'Name', 'Sessions', 'Present', 'Late', 'Absent', 'Rate'].map(h => (
                                <th key={h} className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-200 bg-white">
                            {pageAttendance.map((sa, i) => (
                              <tr key={sa.student_id} className="hover:bg-neutral-50 transition">
                                <td className="px-4 py-3 text-sm text-neutral-400">{(safeAttendancePage - 1) * attendancePageSize + i + 1}</td>
                                <td className="px-4 py-3 text-sm font-medium text-neutral-700 whitespace-nowrap">{sa.svc_number || '—'}</td>
                                <td className="px-4 py-3 text-sm text-neutral-700">{sa.rank || '—'}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                                      {initials(sa.student_name || sa.svc_number)}
                                    </div>
                                    <span className="font-medium text-sm text-black">{sa.student_name || '—'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-600">{sa.sessions_attended ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-emerald-600 font-medium">{sa.present ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-amber-500">{sa.late ?? '—'}</td>
                                <td className="px-4 py-3 text-sm text-red-500">{sa.absent ?? '—'}</td>
                                <td className="px-4 py-3">
                                  <span className={`text-sm font-semibold ${(sa.attendance_rate || 0) >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                    {sa.attendance_rate != null ? `${sa.attendance_rate}%` : '—'}
                                  </span>
                                  <PctBar value={sa.attendance_rate} colorClass={(sa.attendance_rate || 0) >= 75 ? 'bg-emerald-500' : 'bg-red-400'} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Pagination */}
                  {totalAttendance > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-neutral-600">
                          Showing <span className="font-semibold text-black">{Math.min((safeAttendancePage - 1) * attendancePageSize + 1, totalAttendance)}</span> to{' '}
                          <span className="font-semibold text-black">{Math.min(safeAttendancePage * attendancePageSize, totalAttendance)}</span> of{' '}
                          <span className="font-semibold text-black">{totalAttendance}</span> students
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAttendancePage(p => Math.max(1, p - 1))}
                            disabled={safeAttendancePage === 1}
                            className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            <Icons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                          </button>
                          {(() => {
                            const pages = []
                            const maxVisible = 5
                            let start = Math.max(1, safeAttendancePage - Math.floor(maxVisible / 2))
                            let end = Math.min(totalAttendancePages, start + maxVisible - 1)
                            if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                            if (start > 1) {
                              pages.push(<button key={1} onClick={() => setAttendancePage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                              if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                            }
                            for (let i = start; i <= end; i++) {
                              pages.push(
                                <button key={i} onClick={() => setAttendancePage(i)}
                                  className={`px-3 py-1.5 text-sm rounded-lg transition ${safeAttendancePage === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>
                                  {i}
                                </button>
                              )
                            }
                            if (end < totalAttendancePages) {
                              if (end < totalAttendancePages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                              pages.push(<button key={totalAttendancePages} onClick={() => setAttendancePage(totalAttendancePages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalAttendancePages}</button>)
                            }
                            return pages
                          })()}
                          <button
                            onClick={() => setAttendancePage(p => Math.min(totalAttendancePages, p + 1))}
                            disabled={safeAttendancePage >= totalAttendancePages}
                            className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            <Icons.ChevronRight className="w-5 h-5 text-neutral-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
