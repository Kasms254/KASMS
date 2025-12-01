import React, { useEffect, useState } from 'react'
import Card from '../../components/Card'
import useAuth from '../../hooks/useAuth'
import { getInstructorDashboard } from '../../lib/api'

export default function InstructorsDashboard() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [uniqueStudentsCount, setUniqueStudentsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) return
      setLoading(true)
      try {
        // Use the backend instructor-dashboard endpoint which returns counts
        // and an array of classes (more efficient than multiple requests)
        const data = await getInstructorDashboard()
        if (!mounted) return
        setClasses(Array.isArray(data.classes) ? data.classes : (data.classes && Array.isArray(data.classes)) ? data.classes : [])
        setUniqueStudentsCount(data.total_students ?? data.students ?? data.total_students_count ?? 0)
      } catch (err) {
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [user])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Instructors dashboard</h2>
        <p className="text-sm text-gray-500">Your classes and recent activity</p>
      </header>

      {/* Cards grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card title="My classes" value={loading ? '…' : (classes ? String(classes.length) : '0')} icon="Layers" badge={null} accent="bg-emerald-500" colored={true} />
        <Card title="Upcoming" value={null} icon="Calendar" badge={null} accent="bg-sky-500" colored={true} />
        <Card title="Students" value={loading ? '…' : String(uniqueStudentsCount)} icon="Users" badge={null} accent="bg-indigo-500" colored={true} />
      </section>

      <section className="mt-4">
        <div className="rounded-xl p-4 bg-white/95 dark:bg-gray-800/80">
          <h3 className="text-lg font-medium mb-3">Assigned classes</h3>
          {loading && <div className="p-4">Loading classes…</div>}
          {error && <div className="p-4 text-red-600">Failed to load: {error.message || String(error)}</div>}
          {!loading && !error && (
            <ul className="divide-y">
              {classes.length === 0 && <li className="py-2">No classes assigned to you.</li>}
              {classes.map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-black">{c.name || c.class_code || c.code || `Class ${c.id}`}</div>
                    <div className="text-sm text-neutral-500">{c.location || c.room || ''}</div>
                  </div>
                  <div className="text-sm text-neutral-600">{c.student_count ? `${c.student_count} students` : '—'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
