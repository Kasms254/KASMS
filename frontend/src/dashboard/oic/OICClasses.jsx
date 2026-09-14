import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import * as LucideIcons from 'lucide-react'
import Card from '../../components/Card'
import { getOICClasses } from '../../lib/api'
import useToast from '../../hooks/useToast'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function OICClasses() {
  const navigate = useNavigate()
  const toast = useToast()
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
      const data = await getOICClasses(params)
      const list = Array.isArray(data) ? data : data?.results ?? []
      setClasses(list)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load classes')
    } finally {
      setLoading(false)
    }
  }, [currentPage, search, reportError])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-fg">My Assigned Classes</h2>
          <p className="text-xs sm:text-sm text-fg-soft mt-1">Classes you are assigned to as OIC. Click to view details.</p>
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
          className="w-40 sm:w-48 p-2 text-sm text-fg rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-edge-indigo-200"
        />
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-fg-muted">
          Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} classes
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full text-sm text-fg-soft">Loading...</div>
        ) : classes.length === 0 ? (
          <div className="col-span-full text-sm text-fg-faint">No assigned classes found.</div>
        ) : (
          classes.map((cls) => (
            <div key={cls.id}>
              <Card
                title={cls.class_code || cls.name}
                value={cls.name}
                badge={cls.course_name || 'No Course'}
                icon="Layers"
                accent={cls.is_closed ? 'bg-surface-5' : cls.is_active ? 'bg-fill-indigo-600' : 'bg-surface-5'}
                colored
              >
                <div className="space-y-1.5">
                  <div className="text-xs text-fg-soft">
                    {formatDate(cls.start_date)} – {formatDate(cls.end_date)}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {cls.current_enrollment != null && (
                      <span className="text-xs bg-fill-indigo-50 text-mark-indigo-600 px-2 py-1 rounded-full font-medium">
                        {cls.current_enrollment} Students
                      </span>
                    )}
                    {cls.subject_count != null && (
                      <span className="text-xs text-fg-soft">
                        <span className="font-medium">Subjects:</span> {cls.subject_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      cls.is_closed ? 'bg-fill-red-100 text-mark-red-700' :
                      cls.is_active ? 'bg-fill-green-100 text-mark-green-700' :
                      'bg-surface-2 text-fg-soft'
                    }`}>
                      {cls.is_closed ? 'Closed' : cls.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => navigate(`/oic/classes/${cls.id}`)}
                      className="px-2 py-1 rounded-md bg-fill-indigo-600 text-white text-xs hover:bg-fill-indigo-700 transition"
                    >
                      <LucideIcons.Eye className="w-3 h-3 inline mr-1" />
                      View
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-fg-muted">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-surface border border-line-strong text-fg-body hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 text-sm rounded-md bg-surface border border-line-strong text-fg-body hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-surface border border-line-strong text-fg-body hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 text-sm rounded-md bg-surface border border-line-strong text-fg-body hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      )}
    </div>
  )
}
