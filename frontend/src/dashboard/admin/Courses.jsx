import React, { useEffect, useState, useRef, useCallback } from 'react'
import Card from '../../components/Card'
import { getCoursesPaginated, addCourse, updateCourse, deleteCourse, getClasses, getDepartments } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import useToast from '../../hooks/useToast'

// Sanitize text input by removing script tags, HTML tags, and control characters
function sanitizeInput(value, trimSpaces = false) {
  if (typeof value !== 'string') return value
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
  const cleaned = value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(controlChars, '')

  // Only trim if explicitly requested (for final form submission)
  return trimSpaces ? cleaned.trim() : cleaned
}

export default function Courses() {
  const [loading, setLoading] = useState(false)
  const [courses, setCourses] = useState([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newCourse, setNewCourse] = useState({ name: '', code: '', description: '', department: '' })
  const [editingCourse, setEditingCourse] = useState(null)
  const [editCourseModalOpen, setEditCourseModalOpen] = useState(false)
  const [editCourseForm, setEditCourseForm] = useState({ name: '', code: '', description: '', is_active: true, department: '' })
  const [departments, setDepartments] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(12)
  // modal state
  const addModalRef = useRef(null)
  const navigate = useNavigate()
  const toast = useToast()
  // safe toast helpers (fallback to showToast if success/error not available)
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])
  const reportSuccess = useCallback((msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }, [toast])
    const [courseErrors, setCourseErrors] = useState({})
  // delete confirmation modal state
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => {})
  }, [])

  useEffect(() => {
    // load courses on mount and fetch active class counts per course
    ;(async () => {
      setLoading(true)
      try {
        const params = `page=${currentPage}&page_size=${pageSize}`
        const data = await getCoursesPaginated(params)
        const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []

        // Update pagination metadata
        if (data && data.count !== undefined) {
          setTotalCount(data.count)
          setTotalPages(Math.ceil(data.count / pageSize))
        }

        // For each course fetch number of active classes. Use Promise.allSettled to avoid single failure breaking everything.
        const counts = await Promise.allSettled(list.map((course) => getClasses(`course=${course.id}&is_active=true`).catch(() => null)))
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
    })()
  }, [reportError, currentPage, pageSize])

  async function load() {
    setLoading(true)
    try {
      const params = `page=${currentPage}&page_size=${pageSize}`
      const data = await getCoursesPaginated(params)
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []

      // Update pagination metadata
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }

      // fetch active class counts per course
      const counts = await Promise.allSettled(list.map((course) => getClasses(`course=${course.id}&is_active=true`).catch(() => null)))
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
  }

  async function handleAddCourse(e) {
    e.preventDefault()
    setCourseErrors({})
    if (!newCourse.name) return reportError('Course Name Is Required')
    try {
      await addCourse({ ...newCourse, department: newCourse.department || null })
      reportSuccess('Course Added')
      setNewCourse({ name: '', code: '', description: '', department: '' })
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Courses</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Manage Courses — Create, Edit, and View Course Details and Their Active Classes.</p>
        </div>
        <div>
          <button
            onClick={() => setAddModalOpen(true)}
            className="w-full sm:w-auto bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition"
          >
            Add Course
          </button>
        </div>
      </div>
      {/* Add Course Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div ref={addModalRef} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Create Course</h4>
                  <p className="text-sm text-neutral-500">Add a New Course to the System</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setAddModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={handleAddCourse}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Course Name *</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${courseErrors.name ? 'border-rose-500' : 'border-neutral-200'}`}
                      placeholder="e.g. Cybersecurity"
                      value={newCourse.name}
                      maxLength={50}
                      onChange={(e) => setNewCourse({ ...newCourse, name: sanitizeInput(e.target.value).slice(0, 50) })}
                    />
                    {courseErrors.name && <div className="text-xs text-rose-600 mt-1">{courseErrors.name}</div>}
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Course Code</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${courseErrors.code ? 'border-rose-500' : 'border-neutral-200'}`}
                      placeholder="e.g. CS101"
                      value={newCourse.code}
                      maxLength={15}
                      onChange={(e) => setNewCourse({ ...newCourse, code: sanitizeInput(e.target.value).slice(0, 15) })}
                    />
                    {courseErrors.code && <div className="text-xs text-rose-600 mt-1">{courseErrors.code}</div>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Description</label>
                    <input
                      className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${courseErrors.description ? 'border-rose-500' : 'border-neutral-200'}`}
                      placeholder="Short description of the course"
                      value={newCourse.description}
                      maxLength={150}
                      onChange={(e) => setNewCourse({ ...newCourse, description: sanitizeInput(e.target.value).slice(0, 150) })}
                    />
                    {courseErrors.description && <div className="text-xs text-rose-600 mt-1">{courseErrors.description}</div>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Department</label>
                    <select
                      className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={newCourse.department}
                      onChange={(e) => setNewCourse({ ...newCourse, department: e.target.value })}
                    >
                      <option value="">— No Department —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                    {courseErrors.department && <div className="text-xs text-rose-600 mt-1">{courseErrors.department}</div>}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Create Course</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {totalCount > 0 && (
        <div className="mb-3 text-sm text-neutral-600">
          Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} courses
        </div>
      )}

      {/* Edit Course Modal */}
      {editCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditCourseModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit Course</h4>
                  <p className="text-sm text-neutral-500">Update Course Information</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditCourseModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!editingCourse) return
                try {
                  const payload = { name: editCourseForm.name, code: editCourseForm.code, description: editCourseForm.description, department: editCourseForm.department || null }
                  await updateCourse(editingCourse.id, payload)
                  reportSuccess('Course Updated')
                  setEditCourseModalOpen(false)
                  load()
                } catch (err) {
                  reportError(err?.message || 'Failed to update course')
                }
              }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Course Name *</label>
                    <input className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. Cybersecurity" value={editCourseForm.name} maxLength={50} onChange={(e) => setEditCourseForm({ ...editCourseForm, name: sanitizeInput(e.target.value).slice(0, 50) })} />
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Course Code</label>
                    <input className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. CS101" value={editCourseForm.code} maxLength={15} onChange={(e) => setEditCourseForm({ ...editCourseForm, code: sanitizeInput(e.target.value).slice(0, 15) })} />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Description</label>
                    <input className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Short description of the course" value={editCourseForm.description} maxLength={150} onChange={(e) => setEditCourseForm({ ...editCourseForm, description: sanitizeInput(e.target.value).slice(0, 150) })} />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Department</label>
                    <select
                      className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={editCourseForm.department}
                      onChange={(e) => setEditCourseForm({ ...editCourseForm, department: e.target.value })}
                    >
                      <option value="">— No Department —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between gap-2 mt-4">
                  <button type="button" onClick={() => setConfirmDeleteCourse(editingCourse)} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditCourseModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                    <button className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Save Changes</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Course Modal */}
      {confirmDeleteCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteCourse(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                    <span className="text-red-600 text-lg">!</span>
                  </div>
                  <h4 className="text-lg font-medium text-black">Delete Course</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDeleteCourse(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">Are you sure you want to delete <strong>{confirmDeleteCourse.name || confirmDeleteCourse.code}</strong>? This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDeleteCourse(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button
                  onClick={async () => {
                    setIsDeleting(true)
                    try {
                      await deleteCourse(confirmDeleteCourse.id)
                      reportSuccess('Course Deleted')
                      setConfirmDeleteCourse(null)
                      setEditCourseModalOpen(false)
                      load()
                    } catch (err) {
                      reportError(err?.message || 'Failed to delete course')
                    } finally {
                      setIsDeleting(false)
                    }
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div>Loading...</div>
        ) : courses.length === 0 ? (
          <div className="text-sm text-neutral-400">No Courses Yet</div>
        ) : (
          // ensure courses is an array before mapping
          (Array.isArray(courses) ? courses : []).map((course) => (
            <div
              key={course.id}
              onClick={() => openCourseModal(course)}
              className="cursor-pointer group"
            >
              <Card
                title={course.code || course.name || 'Untitled'}
                value={course.name}
                badge={`${course.active_classes ?? 0} Active • ${course.total_classes ?? course.classes_count ?? 0} Classes`}
                icon="BookOpen"
                accent="bg-indigo-600"
                colored={true}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="line-clamp-2 text-xs text-neutral-500 flex-1 min-w-0" title={course.description}>{course.description}</div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCourse(course);
                        setEditCourseForm({
                          name: course.name || '',
                          code: course.code || '',
                          description: course.description || '',
                          is_active: !!course.is_active,
                          department: course.department || '',
                        });
                        setEditCourseModalOpen(true);
                      }}
                      className="px-2 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
                      aria-label={`Edit ${course.name || course.code || 'course'}`}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}

      {/* course detail moved to dedicated page (/list/courses/:id) */}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
