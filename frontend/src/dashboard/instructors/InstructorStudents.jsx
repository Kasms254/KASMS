import React, { useEffect, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import { getClasses, getClassEnrolledStudents, getMyClasses } from '../../lib/api'

export default function InstructorStudents() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) return
      setLoading(true)
      try {
        // Prefer a dedicated server-side endpoint for the current user's
        // classes (avoid permission errors) — try `/api/classes/mine/` first.
        let classes = []
        try {
          const mine = await getMyClasses()
          classes = Array.isArray(mine) ? mine : (mine && mine.results) ? mine.results : []
        } catch {
          // If `/mine/` isn't available or returns 403, try common filter params
          try {
            let data = await getClasses(`instructor=${user.id}`)
            classes = Array.isArray(data) ? data : (data && data.results) ? data.results : []
          } catch {
            try {
              const data = await getClasses(`instructor_id=${user.id}`)
              classes = Array.isArray(data) ? data : (data && data.results) ? data.results : []
            } catch {
              // Fallback: fetch all classes and filter locally (if the API allows list)
              const all = await getClasses()
              const list = Array.isArray(all) ? all : (all && all.results) ? all.results : []
              classes = list.filter((c) => {
                if (!c) return false
                if (typeof c.instructor === 'object') return String(c.instructor.id) === String(user.id)
                if (c.instructor === user.id || String(c.instructor) === String(user.id)) return true
                if (c.instructor_id === user.id || String(c.instructor_id) === String(user.id)) return true
                if (c.instructor_name && (c.instructor_name === user.full_name || (user.username && c.instructor_name.includes(user.username)))) return true
                return false
              })
            }
          }
        }

        // For each class, fetch enrolled students and aggregate unique students
        const promises = classes.map((c) => getClassEnrolledStudents(c.id).catch(() => null))
        const results = await Promise.all(promises)
        const map = {}
        classes.forEach((cl, idx) => {
          const res = results[idx]
          if (!res) return
          const arr = Array.isArray(res) ? res : (res && res.results) ? res.results : []
          arr.forEach((s) => {
            const id = s && (s.id || s.student_id || (s.student && (s.student.id || s.student.student_id)))
            if (!id) return
            // merge student data; prefer name/svc from nested student object when present
            const studentObj = s.student && typeof s.student === 'object' ? s.student : s
            map[id] = {
              id,
              full_name: studentObj.full_name || `${studentObj.first_name || ''} ${studentObj.last_name || ''}`.trim() || studentObj.username || '',
              svc_number: studentObj.svc_number || studentObj.svc || s.svc_number || '',
              username: studentObj.username || '',
              className: cl.name || cl.class_code || s.className || '',
            }
          })
        })

        if (mounted) setStudents(Object.values(map))
      } catch (err) {
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [user])

  if (loading) return <div className="p-4">Loading students…</div>
  if (error) return <div className="p-4 text-red-600">Failed to load students: {error.message || String(error)}</div>
  if (!students || students.length === 0) return <div className="p-4">No students found for your classes.</div>

  return (
    <div className="max-w-7xl mx-auto px-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">My students</h2>
          <p className="text-sm text-neutral-500">Students enrolled in classes you teach</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {students.map((s) => (
          <div key={s.id} className="bg-white rounded-xl p-4 border border-neutral-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-black">{s.full_name || `${(s.first_name || '')} ${(s.last_name || '')}`.trim() || s.username || 'Unnamed'}</div>
                <div className="text-sm text-neutral-500">{s.svc_number || s.username || ''}</div>
              </div>
              <div className="text-sm text-neutral-400">{s.className || '—'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
