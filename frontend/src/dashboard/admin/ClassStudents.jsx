import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'

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

const RANK_LABEL_TO_VALUE = {}
for (const r of RANK_OPTIONS) {
  RANK_LABEL_TO_VALUE[r.label.toLowerCase()] = r.value
  RANK_LABEL_TO_VALUE[r.value] = r.value
}

function normalizeRank(raw) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  return RANK_LABEL_TO_VALUE[key] || key
}

function getRankDisplay(raw) {
  if (!raw) return ''
  const normalized = normalizeRank(raw)
  const found = RANK_OPTIONS.find(r => r.value === normalized)
  return found ? found.label : raw
}

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function ClassStudents() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [students, setStudents] = useState([])
  const [className, setClassName] = useState('')
  const [indexPrefix, setIndexPrefix] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editingStudent, setEditingStudent] = useState(null)
  const [editIndexValue, setEditIndexValue] = useState('')
  const [editIndexSaving, setEditIndexSaving] = useState(false)
  const [editIndexError, setEditIndexError] = useState('')

  function buildFormattedIndex(rawNumber, prefix, serverFormatted) {
    if (serverFormatted) return serverFormatted
    const num = parseInt(rawNumber, 10)
    if (isNaN(num)) return rawNumber || ''
    const padded = String(num).padStart(3, '0')
    return prefix ? `${prefix}/${padded}` : padded
  }

  function mapRoster(data) {
    if (data.class_name) setClassName(data.class_name)
    const prefix = data.index_prefix || ''
    setIndexPrefix(prefix)
    const list = Array.isArray(data.roster) ? data.roster : []
    const mapped = list.map((u) => ({
      id: u.id,
      index_number: u.index_number || '',
      formatted_index: buildFormattedIndex(u.index_number, prefix, u.formatted_index),
      name: u.student_full_name || u.student_name || '',
      svc_number: u.student_svc_number != null ? String(u.student_svc_number) : '',
      rank: normalizeRank(u.student_rank),
      enrollment_date: u.enrollment_date || '',
      is_active: u.is_active,
    }))
    mapped.sort((a, b) => {
      const idxA = parseInt(a.index_number, 10) || 0
      const idxB = parseInt(b.index_number, 10) || 0
      return idxA - idxB
    })
    return mapped
  }

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    async function load() {
      // Assign indexes to any un-indexed students first, then fetch roster
      try { await api.assignClassIndexes(id) } catch {}
      const data = await api.getClassRoster(id)
      if (!mounted) return
      setStudents(mapRoster(data))
    }
    load().catch((err) => {
      if (!mounted) return
      setError(err)
      toast?.error?.('Failed to load students for class')
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [id])

  const filtered = students.filter((s) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      (s.index_number && s.index_number.toLowerCase().includes(term)) ||
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.svc_number && s.svc_number.toLowerCase().includes(term)) ||
      (s.rank && getRankDisplay(s.rank).toLowerCase().includes(term))
    )
  })

  const totalCount = filtered.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedStudents = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1) }, [searchTerm])

  function openEditIndex(st) {
    setEditingStudent(st)
    setEditIndexValue(st.index_number || '')
    setEditIndexError('')
  }

  async function handleEditIndexSubmit(e) {
    e.preventDefault()
    const num = editIndexValue.trim()
    if (!num || isNaN(Number(num)) || Number(num) < 1) {
      setEditIndexError('Enter a valid positive number')
      return
    }
    setEditIndexSaving(true)
    setEditIndexError('')
    try {
      const result = await api.updateStudentIndex(id, editingStudent.id, num)
      setStudents((prev) =>
        prev.map((s) =>
          s.id === editingStudent.id
            ? { ...s, index_number: result.index_number, formatted_index: result.formatted_index }
            : s
        )
      )
      toast?.success?.('Index updated')
      setEditingStudent(null)
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Failed to update index'
      setEditIndexError(msg)
    } finally {
      setEditIndexSaving(false)
    }
  }

  const downloadCSV = useCallback(() => {
    const rows = [['Index No', 'Service No', 'Rank', 'Name']]
    filtered.forEach((st) => rows.push([
      st.formatted_index || '', st.svc_number || '', getRankDisplay(st.rank) || '', st.name || ''
    ]))
    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `class_${id}_students.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered, id])

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => navigate(-1)} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition" title="Back">
              <LucideIcons.ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">{className ? `${className} — Students` : 'Class Students'}</h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500">Students enrolled in this class ({filtered.length}{searchTerm ? ` of ${students.length}` : ''})</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {students.length > 0 && (
            <button onClick={downloadCSV} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition shadow-sm whitespace-nowrap">
              <LucideIcons.Download className="w-4 h-4" />
              Download CSV
            </button>
          )}
        </div>
      </header>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by index number, name, service number, or rank..."
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200">
          <EmptyState icon="AlertCircle" title="Error loading students" description={error.message || String(error)} variant="minimal" />
        </div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Loader2" title="Loading students..." variant="minimal" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200">
          <EmptyState
            icon="Users"
            title="No students found"
            description={searchTerm ? `No students match "${searchTerm}". Try adjusting your search.` : 'No students are enrolled in this class yet.'}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          {/* Mobile Card View */}
          <div className="lg:hidden p-4 space-y-3">
            {paginatedStudents.map((st) => (
              <div key={st.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs sm:text-sm flex-shrink-0">
                    {initials(st.name || st.svc_number)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <div className="font-medium text-sm sm:text-base text-black truncate">{st.name || '-'}</div>
                      {st.formatted_index && (
                        <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">{st.formatted_index}</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-600">{st.svc_number || '-'}</div>
                    {st.rank && <div className="text-xs text-neutral-500">{getRankDisplay(st.rank)}</div>}
                  </div>
                  <button
                    onClick={() => openEditIndex(st)}
                    className="p-1.5 rounded-md text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition flex-shrink-0"
                    title="Edit index number"
                  >
                    <LucideIcons.Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Index No</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rank</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {paginatedStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-indigo-700 whitespace-nowrap">{st.formatted_index || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{st.svc_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{getRankDisplay(st.rank) || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                          {initials(st.name || st.svc_number)}
                        </div>
                        <div className="font-medium text-sm text-black">{st.name || '-'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditIndex(st)}
                        className="p-1.5 rounded-md text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        title="Edit index number"
                      >
                        <LucideIcons.Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> students
            </div>
            <div className="flex items-center gap-2">
              {totalPages > 1 && (
                <>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    aria-label="Previous page"
                  >
                    <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
                  </button>

                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = []
                      const maxVisible = 5
                      let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
                      let endPage = Math.min(totalPages, startPage + maxVisible - 1)
                      if (endPage - startPage < maxVisible - 1) {
                        startPage = Math.max(1, endPage - maxVisible + 1)
                      }
                      if (startPage > 1) {
                        pages.push(
                          <button key={1} onClick={() => setPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">1</button>
                        )
                        if (startPage > 2) pages.push(<span key="e1" className="px-2 text-neutral-400">...</span>)
                      }
                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <button key={i} onClick={() => setPage(i)} className={`px-3 py-1.5 text-sm rounded-lg transition ${page === i ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'}`}>{i}</button>
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
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    aria-label="Next page"
                  >
                    <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
                  </button>
                </>
              )}

              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-neutral-600 hidden sm:inline">Per page:</span>
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
      {/* Edit Index Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingStudent(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-sm">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-base font-medium text-black">Edit Index Number</h4>
                  <p className="text-sm text-neutral-500 mt-0.5">{editingStudent.name || editingStudent.svc_number}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditingStudent(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <form onSubmit={handleEditIndexSubmit}>
                <label className="text-sm text-neutral-600 mb-1 block">
                  New index number
                  {indexPrefix && <span className="ml-1 text-neutral-400">(will display as {indexPrefix}/NNN)</span>}
                </label>
                <input
                  type="number"
                  min={1}
                  autoFocus
                  value={editIndexValue}
                  onChange={(e) => { setEditIndexValue(e.target.value); setEditIndexError('') }}
                  className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${editIndexError ? 'border-rose-500' : 'border-neutral-200'}`}
                  placeholder="e.g. 5"
                />
                {editIndexError && <p className="text-xs text-rose-600 mt-1">{editIndexError}</p>}
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setEditingStudent(null)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editIndexSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {editIndexSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
