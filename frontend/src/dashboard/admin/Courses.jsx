import React, { useEffect, useState, useRef, useCallback } from 'react'
import Card from '../../components/Card'
import { getCourses, addCourse } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import useToast from '../../hooks/useToast'

export default function Courses() {
  const [loading, setLoading] = useState(false)
  const [courses, setCourses] = useState([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newCourse, setNewCourse] = useState({ name: '', code: '', description: '' })
  // modal state
  const addModalRef = useRef(null)
  const navigate = useNavigate()
  const toast = useToast()
  // safe toast helpers (fallback to showToast if success/error not available)
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    console.error(msg)
  }, [toast])
  const reportSuccess = useCallback((msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
    console.log(msg)
  }, [toast])
    const [courseErrors, setCourseErrors] = useState({})

  useEffect(() => {
    // load courses on mount
    ;(async () => {
      setLoading(true)
      try {
        const data = await getCourses()
        // API may return an array or a paginated object { count, results }
        setCourses(Array.isArray(data) ? data : (data && data.results) ? data.results : [])
      } catch (err) {
        reportError(err?.message || 'Failed to load courses')
      } finally {
        setLoading(false)
      }
    })()
  }, [reportError])

  async function load() {
    setLoading(true)
    try {
      const data = await getCourses()
        setCourses(Array.isArray(data) ? data : (data && data.results) ? data.results : [])
    } catch (err) {
      reportError(err?.message || 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCourse(e) {
    e.preventDefault()
    setCourseErrors({})
    if (!newCourse.name) return reportError('Course name is required')
    try {
      await addCourse(newCourse)
      reportSuccess('Course added')
      setNewCourse({ name: '', code: '', description: '' })
      setAddModalOpen(false)
      load()
    } catch (err) {
      // map field errors if present
      if (err?.data && typeof err.data === 'object') {
        // some backends return { field: ["error"] } or {detail: 'msg'}
        const d = err.data
        const fieldErrors = {}
        Object.keys(d).forEach((k) => {
          if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' ')
          else if (typeof d[k] === 'string') fieldErrors[k] = d[k]
        })
        if (Object.keys(fieldErrors).length) {
          setCourseErrors(fieldErrors)
          return
        }
      }
      reportError(err?.message || 'Failed to add course')
    }
  }

  // clicking a course navigates to the course detail page
  function openCourseModal(course) {
    navigate(`/list/courses/${course.id}`)
  }

  // class creation now handled on CourseDetail page

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">Courses</h2>
        <div>
          <button
            onClick={() => setAddModalOpen(true)}
            className="bg-blue-600 text-white px-3 py-1 rounded-md"
          >
            Add course
          </button>
        </div>
      </div>
      {/* Add Course Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={addModalRef} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Create course</h4>
                  <p className="text-sm text-neutral-500">Add a new course to the system</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setAddModalOpen(false)} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
              </div>

              <form onSubmit={handleAddCourse} className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    className="p-2 rounded-md bg-white/5 text-black border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Course name"
                    value={newCourse.name}
                    onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  />
                  {courseErrors.name && <div className="text-sm text-rose-500 mt-1">{courseErrors.name}</div>}
                  <input
                    className="p-2 rounded-md bg-white/5 text-black border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Course code"
                    value={newCourse.code}
                    onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                  />
                  {courseErrors.code && <div className="text-sm text-rose-500 mt-1">{courseErrors.code}</div>}
                  <input
                    className="p-2 rounded-md bg-white/5 text-black border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Short description"
                    value={newCourse.description}
                    onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                  />
                  {courseErrors.description && <div className="text-sm text-rose-500 mt-1">{courseErrors.description}</div>}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-md border text-sm bg-red-600">Cancel</button>
                  <button className="bg-green-600 text-white px-3 py-1 rounded-md">Create course</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? (
          <div>Loading...</div>
        ) : courses.length === 0 ? (
          <div className="text-sm text-neutral-400">No courses yet</div>
        ) : (
          // ensure courses is an array before mapping
          (Array.isArray(courses) ? courses : []).map((course) => (
            <div key={course.id}>
              <div onClick={() => openCourseModal(course)} className="cursor-pointer">
                <Card
                  title={course.code || course.name || 'Untitled'}
                  value={course.name}
                  badge={`${course.total_classes ?? course.classes_count ?? 0} classes`}
                  icon="BookOpen"
                  accent="bg-indigo-600"
                  colored={true}
                >
                  <div className="truncate text-xs text-neutral-500">{course.description}</div>
                </Card>
              </div>
            </div>
          ))
        )}

      {/* course detail moved to dedicated page (/list/courses/:id) */}
      </div>
    </div>
  )
}
