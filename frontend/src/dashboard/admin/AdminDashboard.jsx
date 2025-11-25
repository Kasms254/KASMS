import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserCard from '../../components/UserCard'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import AddUser from '../../pages/AddUser'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [metrics, setMetrics] = useState({ students: null, instructors: null, admins: null, subjects: null, active_classes: null })

  async function loadMetrics() {
    try {
      const [studentsResp, instructorsResp, usersResp, subjectsResp, classesResp] = await Promise.all([
        api.getStudents().catch(() => null),
        api.getInstructors().catch(() => null),
        api.getUsers().catch(() => null),
        api.getSubjects().catch(() => null),
        api.getClasses('is_active=true').catch(() => null),
      ])
      const studentsCount = Array.isArray(studentsResp) ? studentsResp.length : (studentsResp?.count ?? null)
      const instructorsCount = Array.isArray(instructorsResp) ? instructorsResp.length : (instructorsResp?.count ?? null)
      const adminsCount = usersResp ? (Array.isArray(usersResp.results) ? usersResp.results.filter(u => u.role === 'admin').length : null) : null
      const subjectsCount = Array.isArray(subjectsResp) ? subjectsResp.length : (subjectsResp?.count ?? null)
      const activeClassesCount = Array.isArray(classesResp) ? classesResp.length : (classesResp?.count ?? null)
      setMetrics({
        students: studentsCount,
        instructors: instructorsCount,
        admins: adminsCount,
        subjects: subjectsCount,
        active_classes: activeClassesCount,
      })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!mounted) return
      await loadMetrics()
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Admin dashboard</h2>
        <p className="text-sm text-gray-500">Overview of school metrics</p>
      </header>

      {/* Cards grid - modern layout */}
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/list/students" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <UserCard type="students" count={metrics.students} />
        </Link>

        <Link to="/list/instructors" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <UserCard type="instructors" count={metrics.instructors} />
        </Link>

        <Link to="/list/subjects" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <UserCard type="subject" count={metrics.subjects} />
        </Link>
        <Card title="Active classes" value={metrics.active_classes} icon="Layers" className="" badge={null} accent="bg-pink-500" colored={true} />
      </section>

      {/* Admin actions - only show for admins */}
      {user && user.role === 'admin' ? (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-black">Admin actions</h3>
            <div>
              <button
                onClick={() => setShowAdd((s) => !s)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded bg-indigo-600 text-white"
              >
                {showAdd ? 'Hide add user' : 'Add user'}
              </button>
            </div>
          </div>

          {showAdd ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <AddUser onSuccess={loadMetrics} />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Calendar + Recent activity area */}
      {/* prepare sample events in a stable way */}
      { /** eventsMemo is stable across renders */ }
      <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Calendar />
        </div>

        <div className="bg-white rounded-xl p-4 border border-neutral-200">
          <h3 className="text-lg font-medium mb-3 text-black">Recent activity</h3>
          <div className="text-sm text-neutral-500">No recent activity</div>
        </div>
      </section>
    </div>
  )
}
