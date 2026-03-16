import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import Card from '../../components/Card'
import { getCommandantClasses, getCommandantClassStudents } from '../../lib/api'
import useToast from '../../hooks/useToast'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CommandantClasses() {
  const navigate = useNavigate()
  const toast = useToast()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState([])
  const [search, setSearch] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 12

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let params = `page=${currentPage}&page_size=${pageSize}`
      if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
      // allow filtering by course via query param: /commandant/classes?course=<id>
      const qs = new URLSearchParams(location.search)
      const courseFilter = qs.get('course')
      if (courseFilter) params += `&course=${encodeURIComponent(courseFilter)}`
      const data = await getCommandantClasses(params)
      const list = Array.isArray(data) ? data : data?.results ?? []

      // Normalize student count fields from various possible API keys
      const initialMapped = list.map((cl) => ({ ...cl, student_count: cl.student_count ?? cl.students_count ?? cl.current_enrollment ?? cl.enrollment_count ?? null }))
      setClasses(initialMapped)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }

      // For any classes missing a student_count, fetch per-class student list
      const toFetch = initialMapped.reduce((acc, cl, idx) => {
        if (cl.student_count == null) acc.push({ id: cl.id, idx })
        return acc
      }, [])

      if (toFetch.length > 0) {
        try {
          const counts = await Promise.allSettled(toFetch.map((t) => getCommandantClassStudents(t.id).catch(() => null)))
          const mapped = [...initialMapped]
          toFetch.forEach((t, i) => {
            const res = counts[i]
            let studentsCount = null
            if (res && res.status === 'fulfilled' && res.value) {
              const v = res.value
              studentsCount = Array.isArray(v) ? v.length : (v?.count ?? null)
            }
            mapped[t.idx] = { ...mapped[t.idx], student_count: studentsCount }
          })
          setClasses(mapped)
        } catch {
          // ignore per-class failures
        }
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load classes')
    } finally {
      setLoading(false)
    }
  }, [currentPage, search, reportError, location.search])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Classes</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">All classes in this school</p>
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
          className="w-40 sm:w-48 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} classes
        </div>
      )}

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : classes.length === 0 ? (
          <div className="text-sm text-neutral-400">No Classes Found</div>
        ) : (
          classes.map((cls) => (
            <div key={cls.id}>
              <Card
                title={cls.class_code || cls.name}
                value={cls.name}
                badge={cls.course_name || 'No Course'}
                icon="Layers"
                accent={cls.is_closed ? 'bg-neutral-400' : cls.is_active ? 'bg-indigo-600' : 'bg-neutral-400'}
                colored
              >
                <div className="space-y-1.5">
                  <div className="text-xs text-neutral-500">
                    {formatDate(cls.start_date)} – {formatDate(cls.end_date)}
                  </div>
                  <div className="flex gap-3 items-center">
                    {cls.student_count != null ? (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-medium">{cls.student_count} Students</span>
                    ) : (
                      <span className="text-xs bg-neutral-100 text-neutral-500 px-2 py-1 rounded-full">— Students</span>
                    )}
                    {cls.subject_count != null && (
                      <span className="text-xs text-neutral-500"><span className="font-medium">Subjects:</span> {cls.subject_count}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cls.is_closed ? 'bg-red-100 text-red-700' : cls.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      {cls.is_closed ? 'Closed' : cls.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => navigate(`/commandant/classes/${cls.id}`)}
                      className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition"
                    >
                      <LucideIcons.Users className="w-3 h-3 inline mr-1" />
                      View
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      )}
    </div>
  )
}
