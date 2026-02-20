import React, { useEffect, useState, useCallback } from 'react'
import Card from '../../components/Card'
import { getDepartments, getDepartmentCourses, getDepartmentClasses, getDepartmentStudents, getDepartmentPendingEditRequests } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import useToast from '../../hooks/useToast'

export default function HODDashboard() {
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState([])
  const [selectedDept, setSelectedDept] = useState(null)
  const [stats, setStats] = useState({ courses: [], classes: [], students: [], pendingRequests: [] })
  const [statsLoading, setStatsLoading] = useState(false)
  const navigate = useNavigate()

  const toast = useToast()
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getDepartments()
        const list = Array.isArray(data) ? data : []
        setDepartments(list)
        if (list.length > 0) setSelectedDept(list[0])
      } catch (err) {
        reportError(err?.message || 'Failed to load departments')
      } finally {
        setLoading(false)
      }
    })()
  }, [reportError])

  useEffect(() => {
    if (!selectedDept) return
    ;(async () => {
      setStatsLoading(true)
      try {
        const [courses, classes, students, pendingRequests] = await Promise.allSettled([
          getDepartmentCourses(selectedDept.id),
          getDepartmentClasses(selectedDept.id),
          getDepartmentStudents(selectedDept.id),
          getDepartmentPendingEditRequests(selectedDept.id),
        ])
        const unwrap = (r) => {
          if (r.status === 'fulfilled') {
            const v = r.value
            if (Array.isArray(v)) return v
            if (v && Array.isArray(v.results)) return v.results
            return []
          }
          return []
        }
        setStats({
          courses: unwrap(courses),
          classes: unwrap(classes),
          students: unwrap(students),
          pendingRequests: unwrap(pendingRequests),
        })
      } catch {
        // individual errors handled by Promise.allSettled
      } finally {
        setStatsLoading(false)
      }
    })()
  }, [selectedDept])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-sm text-neutral-500">Loading...</div>
      </div>
    )
  }

  if (departments.length === 0) {
    return (
      <div>
        <header className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-black">HOD Dashboard</h2>
        </header>
        <p className="text-sm text-neutral-500">You are not assigned as HOD to any department.</p>
      </div>
    )
  }

  const hasPending = stats.pendingRequests.length > 0

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">HOD Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">Overview of your department</p>
        </div>
        {departments.length > 1 && (
          <select
            value={selectedDept?.id || ''}
            onChange={(e) => {
              const d = departments.find((dep) => dep.id === e.target.value)
              if (d) setSelectedDept(d)
            }}
            className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        )}
      </header>

      {/* Department info */}
      {selectedDept && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
          <h3 className="text-base font-semibold text-black">{selectedDept.name}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Code: {selectedDept.code}</p>
          {selectedDept.description && (
            <p className="text-sm text-neutral-600 mt-2">{selectedDept.description}</p>
          )}
        </div>
      )}

      {/* Metric cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card
          title="Courses"
          value={statsLoading ? '…' : stats.courses.length}
          icon="BookOpen"
          accent="bg-indigo-600"
          colored={true}
        />
        <Card
          title="Classes"
          value={statsLoading ? '…' : stats.classes.length}
          icon="Layers"
          accent="bg-emerald-500"
          colored={true}
        />
        <Card
          title="Students"
          value={statsLoading ? '…' : stats.students.length}
          icon="Users"
          accent="bg-sky-500"
          colored={true}
        />
        <div onClick={() => navigate('/list/edit-requests')} className="cursor-pointer">
          <Card
            title="Pending Edit Requests"
            value={statsLoading ? '…' : stats.pendingRequests.length}
            icon="ClipboardList"
            accent={hasPending ? 'bg-amber-500' : 'bg-neutral-400'}
            colored={true}
          />
        </div>
      </section>

      {/* Pending edit requests preview */}
      {hasPending && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-black">Pending Edit Requests</h3>
            <button
              onClick={() => navigate('/list/edit-requests')}
              className="text-sm text-indigo-600 hover:text-indigo-700 transition"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {stats.pendingRequests.slice(0, 5).map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-black truncate">
                    {req.requested_by_name || 'Unknown'}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                    {req.reason?.slice(0, 80)}{req.reason?.length > 80 ? '…' : ''}
                  </div>
                </div>
                <span className="ml-3 shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom panels: courses + classes side by side */}
      {!statsLoading && (stats.courses.length > 0 || stats.classes.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stats.courses.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-base font-semibold text-black mb-3">Department Courses</h3>
              <div className="space-y-2">
                {stats.courses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-black truncate">{c.name}</div>
                      {c.code && <div className="text-xs text-neutral-500">{c.code}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.classes.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="text-base font-semibold text-black mb-3">Department Classes</h3>
              <div className="space-y-2">
                {stats.classes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-black truncate">{c.name}</div>
                      {c.course_name && <div className="text-xs text-neutral-500">{c.course_name}</div>}
                    </div>
                    <span className={`ml-3 shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${
                      c.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
                    }`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
