import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import { getCommandantDepartments } from '../../lib/api'
import useToast from '../../hooks/useToast'

export default function CommandantDepartments() {
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState([])
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
      const data = await getCommandantDepartments(params)
      const list = Array.isArray(data) ? data : data?.results ?? []
      setDepartments(list)
      if (data?.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load departments')
    } finally {
      setLoading(false)
    }
  }, [currentPage, search, reportError])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Departments</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">All departments in this school</p>
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
          Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} departments
        </div>
      )}

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="text-sm text-neutral-400">No Departments Found</div>
        ) : (
          departments.map((dept) => (
            <div key={dept.id}>
              <Card
                title={dept.code || dept.name || 'Untitled'}
                value={dept.name}
                badge={`${dept.course_count ?? 0} Courses • ${dept.class_count ?? 0} Classes`}
                icon="Building"
                accent={dept.is_active ? 'bg-indigo-600' : 'bg-neutral-400'}
                colored
              >
                <div className="space-y-1.5">
                  {dept.hod_name && (
                    <div className="text-xs text-neutral-500 truncate">
                      <span className="font-medium">HOD:</span> {dept.hod_name}
                      {dept.hod_svc_number && <span className="text-neutral-400 ml-1">({dept.hod_svc_number})</span>}
                    </div>
                  )}
                  {dept.description && (
                    <div className="line-clamp-2 text-xs text-neutral-400" title={dept.description}>{dept.description}</div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${dept.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => navigate(`/commandant/departments/${dept.id}`)}
                      className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition"
                    >
                      View Details
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
