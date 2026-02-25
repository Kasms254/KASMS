import React, { useEffect, useState, useCallback } from 'react'
import Card from '../../components/Card'
import { getCommandantCourses, getCommandantClasses } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import useToast from '../../hooks/useToast'

export default function CommandantCourses() {
  const [loading, setLoading] = useState(false)
  const [courses, setCourses] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(12)
  const navigate = useNavigate()
  const toast = useToast()

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = `page=${currentPage}&page_size=${pageSize}`
      const data = await getCommandantCourses(params)
      const list = Array.isArray(data) ? data : data?.results ?? []

      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }

      // Fetch active classes per course using the commandant classes endpoint
      const counts = await Promise.allSettled(list.map((course) => getCommandantClasses(`course=${course.id}&is_active=true`).catch(() => null)))
      const mapped = list.map((course, idx) => {
        const res = counts[idx]
        let active = null
        if (res && res.status === 'fulfilled' && res.value) {
          const v = res.value
          active = Array.isArray(v) ? v.length : (v?.count ?? null)
        }
        return { ...course, active_classes: active }
      })
      setCourses(mapped)
    } catch (err) {
      reportError(err?.message || 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, reportError])

  useEffect(() => { load() }, [load])

  function openCourse(course) {
    // Navigate to commandant classes filtered by course
    navigate(`/commandant/classes?course=${course.id}`)
  }

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Courses</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Course analytics for Commandant — Active class counts and overview.</p>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} courses
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="text-sm text-neutral-500">Loading...</div>
        ) : courses.length === 0 ? (
          <div className="text-sm text-neutral-400">No Courses Found</div>
        ) : (
          courses.map((course) => (
            <div key={course.id} className="cursor-pointer" onClick={() => openCourse(course)}>
              <Card
                title={course.code || course.name}
                value={course.name}
                badge={`${course.active_classes ?? 0} Active • ${course.total_classes ?? course.classes_count ?? 0} Classes`}
                icon="BookOpen"
                accent="bg-indigo-600"
                colored
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="line-clamp-2 text-xs text-neutral-500 flex-1 min-w-0" title={course.description}>{course.description}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); openCourse(course) }} className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition">Open</button>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

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
