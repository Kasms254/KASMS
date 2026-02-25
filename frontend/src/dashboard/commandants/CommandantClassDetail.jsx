import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { getCommandantClassStudents, getCommandantClassSubjects } from '../../lib/api'
import useToast from '../../hooks/useToast'

const RANK_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'lieutenant_general', label: 'Lieutenant General' },
  { value: 'major_general', label: 'Major General' },
  { value: 'brigadier', label: 'Brigadier' },
  { value: 'colonel', label: 'Colonel' },
  { value: 'lieutenant_colonel', label: 'Lieutenant Colonel' },
  { value: 'major', label: 'Major' },
  { value: 'captain', label: 'Captain' },
  { value: 'lieutenant', label: 'Lieutenant' },
  { value: 'warrant_officer_i', label: 'Warrant Officer I' },
  { value: 'warrant_officer_ii', label: 'Warrant Officer II' },
  { value: 'senior_sergeant', label: 'Senior Sergeant' },
  { value: 'sergeant', label: 'Sergeant' },
  { value: 'corporal', label: 'Corporal' },
  { value: 'lance_corporal', label: 'Lance Corporal' },
  { value: 'private', label: 'Private' },
]

const RANK_MAP = {}
for (const r of RANK_OPTIONS) {
  RANK_MAP[r.value] = r.label
  RANK_MAP[r.label.toLowerCase()] = r.label
}

function getRankDisplay(raw) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  return RANK_MAP[key] || RANK_MAP[raw] || String(raw).replace(/_/g, ' ')
}

function initials(name = '') {
  return name.split(' ').map((s) => s[0] || '').slice(0, 2).join('').toUpperCase()
}

const PAGE_SIZE = 20

export default function CommandantClassDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('students')

  // Students state
  const [students, setStudents] = useState(null)
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [studentPage, setStudentPage] = useState(1)

  // Subjects state
  const [subjects, setSubjects] = useState(null)
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [subjectPage, setSubjectPage] = useState(1)

  // Class info
  const [className, setClassName] = useState('')
  const [courseName, setCourseName] = useState('')

  // Search
  const [search, setSearch] = useState('')

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  // Load students on mount
  // Response: { class: {name, course_name, ...}, students: [{student_name, svc_number, rank, index_number}], total_students }
  useEffect(() => {
    setStudentsLoading(true)
    ;(async () => {
      try {
        const data = await getCommandantClassStudents(id)
        const cls = data?.class || {}
        setClassName(cls.name || data?.class_name || '')
        setCourseName(cls.course_name || data?.course_name || '')
        const list = Array.isArray(data?.students) ? data.students
          : Array.isArray(data) ? data : []
        const mapped = list.map((u) => ({
          id: u.enrollment_id || u.student_id || u.id,
          name: u.student_name || u.student_full_name || u.full_name
            || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          svc_number: u.svc_number != null ? String(u.svc_number) : '',
          rank: u.rank || '',   // backend sends display string via get_rank_display()
          unit: u.unit || '',
          index_number: u.index_number != null ? String(u.index_number) : '',
        }))
        mapped.sort((a, b) => (parseInt(a.index_number, 10) || 0) - (parseInt(b.index_number, 10) || 0))
        setStudents(mapped)
      } catch (err) {
        reportError(err?.message || 'Failed to load students')
        setStudents([])
      } finally {
        setStudentsLoading(false)
      }
    })()
  }, [id, reportError])

  // Load subjects lazily
  // Response: { class: {...}, subjects: [{name, instructor_name, instructor_rank (raw), instructor_svc_number}] }
  async function loadSubjects() {
    if (subjects !== null) return
    setSubjectsLoading(true)
    try {
      const data = await getCommandantClassSubjects(id)
      const list = Array.isArray(data?.subjects) ? data.subjects
        : Array.isArray(data) ? data : data?.results ?? []
      setSubjects(list)
    } catch (err) {
      reportError(err?.message || 'Failed to load subjects')
      setSubjects([])
    } finally {
      setSubjectsLoading(false)
    }
  }

  async function switchTab(tab) {
    setActiveTab(tab)
    setSearch('')
    if (tab === 'subjects') await loadSubjects()
  }

  // Derived values
  const loading = activeTab === 'students' ? studentsLoading : subjectsLoading
  const rawRows = activeTab === 'students' ? (students ?? []) : (subjects ?? [])
  const page = activeTab === 'students' ? studentPage : subjectPage
  const setPage = activeTab === 'students' ? setStudentPage : setSubjectPage

  const filteredRows = search.trim()
    ? rawRows.filter((r) => {
        const term = search.toLowerCase()
        if (activeTab === 'students') {
          return (
            r.name.toLowerCase().includes(term) ||
            r.svc_number.toLowerCase().includes(term) ||
            r.index_number.includes(term) ||
            getRankDisplay(r.rank).toLowerCase().includes(term) ||
            r.unit.toLowerCase().includes(term)
          )
        }
        return (
          (r.name || '').toLowerCase().includes(term) ||
          (r.instructor_name || '').toLowerCase().includes(term)
        )
      })
    : rawRows

  const totalCount = filteredRows.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset pages when search changes
  useEffect(() => { setStudentPage(1); setSubjectPage(1) }, [search])

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition"
              title="Back"
            >
              <LucideIcons.ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">
              {className || 'Class Detail'}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500">
            {courseName}
            {students !== null && (
              <> · <span className="font-medium">{students.length}</span> student{students.length !== 1 ? 's' : ''}</>
            )}
            {subjects !== null && (
              <>, <span className="font-medium">{subjects.length}</span> subject{subjects.length !== 1 ? 's' : ''}</>
            )}
          </p>
        </div>
      </header>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'students'
                ? 'Search by index no., name, service number, or rank...'
                : 'Search by subject or instructor...'}
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tabs + Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-neutral-200 bg-neutral-50">
          {['students', 'subjects'].map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-6 py-3 text-sm font-medium capitalize border-b-2 transition -mb-px ${
                activeTab === t
                  ? 'border-indigo-600 text-indigo-700 bg-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t}
              {t === 'students' && students !== null && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{students.length}</span>
              )}
              {t === 'subjects' && subjects !== null && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{subjects.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-6">
            <EmptyState icon="Loader2" title={`Loading ${activeTab}...`} variant="minimal" />
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={activeTab === 'students' ? 'Users' : 'BookOpen'}
            title={`No ${activeTab} found`}
            description={search ? `No ${activeTab} match "${search}".` : `No ${activeTab} in this class.`}
          />
        ) : activeTab === 'students' ? (
          <>
            {/* Mobile */}
            <div className="lg:hidden p-4 space-y-3">
              {pageRows.map((st) => (
                <div key={st.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                      {initials(st.name || st.svc_number)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-medium text-sm text-black">{st.name || '—'}</span>
                        {st.index_number && (
                          <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">{st.index_number}</span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600">{st.svc_number || '—'}</p>
                      {st.rank && <p className="text-xs text-neutral-500">{getRankDisplay(st.rank)}</p>}
                      {st.unit && <p className="text-xs text-neutral-400">{st.unit}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Index No</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {pageRows.map((st) => (
                    <tr key={st.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3 text-sm font-medium text-indigo-700 whitespace-nowrap">
                        {st.index_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.svc_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{getRankDisplay(st.rank) || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                            {initials(st.name || st.svc_number)}
                          </div>
                          <span className="text-sm font-medium text-black">{st.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{st.unit || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* Subjects */
          <>
            {/* Mobile */}
            <div className="lg:hidden p-4 space-y-3">
              {pageRows.map((s) => (
                <div key={s.id} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                  <p className="text-sm font-medium text-black">{s.name}</p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    {getRankDisplay(s.instructor_rank) ? `${getRankDisplay(s.instructor_rank)} · ` : ''}{s.instructor_name || '—'}
                  </p>
                  {s.instructor_svc_number && (
                    <p className="text-xs text-neutral-400 mt-0.5">{s.instructor_svc_number}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Instructor Rank</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Instructor</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Svc No.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {pageRows.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3 text-sm font-medium text-black">{s.name}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{getRankDisplay(s.instructor_rank) || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{s.instructor_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{s.instructor_svc_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Showing{' '}
              <span className="font-semibold text-black">{Math.min((page - 1) * PAGE_SIZE + 1, totalCount)}</span>
              {' '}to{' '}
              <span className="font-semibold text-black">{Math.min(page * PAGE_SIZE, totalCount)}</span>
              {' '}of{' '}
              <span className="font-semibold text-black">{totalCount}</span>{' '}
              {activeTab}
              {search && rawRows.length !== totalCount && (
                <span className="text-neutral-400"> (filtered from {rawRows.length})</span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                </button>
                {(() => {
                  const pages = []
                  const maxVisible = 5
                  let start = Math.max(1, page - Math.floor(maxVisible / 2))
                  let end = Math.min(totalPages, start + maxVisible - 1)
                  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
                  if (start > 1) {
                    pages.push(<button key={1} onClick={() => setPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>)
                    if (start > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">…</span>)
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <button key={i} onClick={() => setPage(i)} className={`px-3 py-1.5 text-sm rounded-lg transition ${page === i ? 'bg-indigo-600 text-white font-semibold' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>{i}</button>
                    )
                  }
                  if (end < totalPages) {
                    if (end < totalPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">…</span>)
                    pages.push(<button key={totalPages} onClick={() => setPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalPages}</button>)
                  }
                  return pages
                })()}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
