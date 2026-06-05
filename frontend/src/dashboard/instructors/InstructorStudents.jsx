import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as api from '../../lib/api'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import useAuth from '../../hooks/useAuth'
import { getRankSortIndex, getRankLabel } from '../../lib/rankOrder'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function mapStudent(u, className) {
  const student = u.student || u
  return {
    id: student.id,
    first_name: student.first_name,
    last_name: student.last_name,
    full_name: student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
    name: student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
    svc_number: student.svc_number != null ? String(student.svc_number) : '',
    email: student.email,
    phone_number: student.phone_number,
    rank: student.rank || student.rank_display || '',
    is_active: student.is_active,
    created_at: student.created_at,
    className,
  }
}

export default function InstructorStudents() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('all')

  // ── Classes ──────────────────────────────────────────────────────────────
  const { data: dashboardData } = useQuery({
    queryKey: ['instructor-dashboard'],
    queryFn: api.getInstructorDashboard,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })

  const availableClasses = useMemo(() => {
    const list = Array.isArray(dashboardData?.classes) ? dashboardData.classes : []
    return list.map((c) => ({
      id: c.id,
      name: c.name || c.class_name || c.display_name || c.title || `Class ${c.id}`,
    }))
  }, [dashboardData])

  // ── Students ─────────────────────────────────────────────────────────────
  // Include class IDs in the key so the query re-runs once classes are loaded
  const classIds = availableClasses.map((c) => c.id)

  const {
    data: rawStudents = [],
    isPending: loading,
    error,
  } = useQuery({
    queryKey: ['instructor-students', selectedClass === 'all' ? classIds : selectedClass],
    queryFn: async () => {
      if (selectedClass !== 'all') {
        const res = await api.getClassEnrolledStudents(selectedClass)
        const list = res?.results ?? (Array.isArray(res) ? res : [])
        const className = availableClasses.find((c) => c.id === parseInt(selectedClass))?.name || 'N/A'
        const mapped = list.map((u) => mapStudent(u, className))
        return mapped.sort((a, b) => getRankSortIndex(a.rank) - getRankSortIndex(b.rank))
      }

      // Fetch all classes in parallel
      const settled = await Promise.allSettled(
        availableClasses.map((cls) =>
          api.getClassEnrolledStudents(cls.id).then((res) => {
            const list = res?.results ?? (Array.isArray(res) ? res : [])
            return list.map((u) => mapStudent(u, cls.name))
          })
        )
      )
      const all = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

      // Deduplicate by student id
      const seen = new Set()
      const unique = all.filter((s) => (seen.has(s.id) ? false : seen.add(s.id)))
      return unique.sort((a, b) => getRankSortIndex(a.rank) - getRankSortIndex(b.rank))
    },
    staleTime: 3 * 60 * 1000,
    enabled: selectedClass !== 'all' ? !!selectedClass : classIds.length > 0,
  })

  // ── Derived state ─────────────────────────────────────────────────────────
  const allFilteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return rawStudents
    const q = searchTerm.toLowerCase()
    return rawStudents.filter(
      (st) =>
        (st.name || '').toLowerCase().includes(q) ||
        (st.svc_number || '').toLowerCase().includes(q) ||
        (st.email || '').toLowerCase().includes(q) ||
        (st.rank || '').toLowerCase().includes(q) ||
        (st.className || '').toLowerCase().includes(q)
    )
  }, [rawStudents, searchTerm])

  const totalCount = allFilteredStudents.length

  const students = useMemo(() => {
    const start = (page - 1) * pageSize
    return allFilteredStudents.slice(start, start + pageSize)
  }, [allFilteredStudents, page, pageSize])

  // ── CSV export ────────────────────────────────────────────────────────────
  function downloadCSV() {
    const rows = [['Service No', 'Rank', 'Name', 'Class', 'Email', 'Phone', 'Active']]
    allFilteredStudents.forEach((st) =>
      rows.push([
        st.svc_number || '',
        st.rank || '',
        st.name || '',
        st.className || '',
        st.email || '',
        st.phone_number || '',
        st.is_active ? 'Yes' : 'No',
      ])
    )
    const csv = rows
      .map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my_students.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">My Students</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Students enrolled in classes you teach</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={downloadCSV}
            className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 transition shadow-sm whitespace-nowrap"
          >
            Download CSV
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:gap-6">
        {/* Search and Filter bar */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="relative flex-1">
                <input
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                  placeholder="Search students..."
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="w-full sm:w-64">
                <select
                  value={selectedClass}
                  onChange={(e) => { setSelectedClass(e.target.value); setPage(1) }}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="all">All Classes</option>
                  {availableClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name || `Class ${cls.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPage(1)}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm hover:bg-indigo-700 transition whitespace-nowrap shadow-sm"
              >
                Apply Filters
              </button>
              <button
                onClick={() => { setSearchTerm(''); setSelectedClass('all'); setPage(1) }}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
              >
                Clear All
              </button>
            </div>

            {(searchTerm || selectedClass !== 'all') && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
                <span className="text-xs text-neutral-600">Active filters:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                    Search: "{searchTerm}"
                    <button
                      onClick={() => { setSearchTerm(''); setPage(1) }}
                      className="hover:bg-indigo-100 rounded-full p-0.5"
                    >
                      <LucideIcons.X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {selectedClass !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                    Class: {availableClasses.find((c) => c.id === parseInt(selectedClass))?.name || 'Unknown'}
                    <button
                      onClick={() => { setSelectedClass('all'); setPage(1) }}
                      className="hover:bg-indigo-100 rounded-full p-0.5"
                    >
                      <LucideIcons.X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="p-6 bg-white rounded-xl border border-red-200">
            <EmptyState
              icon="AlertCircle"
              title="Error loading students"
              description={error.message || String(error)}
              variant="minimal"
            />
          </div>
        ) : loading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200">
            <EmptyState icon="Loader2" title="Loading students..." variant="minimal" />
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200">
            <EmptyState
              icon="Users"
              title="No students found"
              description={
                searchTerm
                  ? `No students match "${searchTerm}". Try adjusting your search terms.`
                  : 'No students are enrolled in your classes yet.'
              }
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Mobile Card View */}
            <div className="lg:hidden p-4 space-y-3">
              {students.map((st) => (
                <div key={st.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                        {initials(st.name || st.svc_number)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm sm:text-base text-black truncate">{st.name || '-'}</div>
                        <div className="text-xs text-neutral-600">{st.svc_number || '-'}</div>
                        <div className="text-xs text-neutral-500">{st.className}</div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] sm:text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                        st.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {st.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                    {st.rank && (
                      <div className="flex justify-between gap-2">
                        <span className="text-neutral-600">Rank:</span>
                        <span className="text-black truncate">{getRankLabel(st.rank)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600 flex-shrink-0">Email:</span>
                      <span className="text-black truncate">{st.email || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-600">Phone:</span>
                      <span className="text-black truncate">{st.phone_number || '-'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {students.map((st) => (
                    <tr key={st.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.svc_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{getRankLabel(st.rank) || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                            {initials(st.name || st.svc_number)}
                          </div>
                          <div className="font-medium text-sm text-black">{st.name || '-'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{st.className}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 truncate max-w-[200px]">{st.email || '-'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.phone_number || '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            st.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {st.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Pagination */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-black">
              Showing{' '}
              <span className="font-semibold">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold">{totalCount}</span> students
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = Math.ceil(totalCount / pageSize)
                  const pages = []
                  const maxVisible = 5
                  let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
                  let endPage = Math.min(totalPages, startPage + maxVisible - 1)
                  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1)

                  if (startPage > 1) {
                    pages.push(
                      <button key={1} onClick={() => setPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>
                    )
                    if (startPage > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">...</span>)
                  }
                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition ${
                          page === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }
                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) pages.push(<span key="e2" className="px-2 text-neutral-400">...</span>)
                    pages.push(
                      <button key={totalPages} onClick={() => setPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">{totalPages}</button>
                    )
                  }
                  return pages
                })()}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                disabled={page >= Math.ceil(totalCount / pageSize)}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>

              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-black hidden sm:inline">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
