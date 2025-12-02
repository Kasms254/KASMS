import React, { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'
import api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import { getInstructorDashboard } from '../../lib/api'

export default function InstructorsDashboard() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [uniqueStudentsCount, setUniqueStudentsCount] = useState(0)
  const [pendingGrading, setPendingGrading] = useState(0)
  const [attendanceToday, setAttendanceToday] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [calendarEvents, setCalendarEvents] = useState({})

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
  setPendingGrading(data.pending_grading ?? data.to_grade ?? 0)
  setAttendanceToday(data.attendance_today ?? data.attendance_today_count ?? 0)
      } catch (err) {
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [user])

    // load exams and map to calendar events
    useEffect(() => {
      let mounted = true
      async function loadEvents() {
        if (!user) return
        try {
          const res = await api.getMyExams?.() ?? api.getExams()
          // res might be paginated object or array
          const examsList = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : (res && res.results) ? res.results : [])
          const ev = {}
          const pad = (n) => String(n).padStart(2, '0')
          const toISO = (d) => {
            try {
              const dt = new Date(d)
              if (Number.isNaN(dt.getTime())) return null
              return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
            } catch { return null }
          }
          examsList.forEach(x => {
            const iso = x.exam_date ? toISO(x.exam_date) : null
            if (!iso) return
            // build structured event object so Calendar can style chips
            const subject = x.subject_name || x.subject?.name || null
            const className = x.class_name || x.class_obj?.name || x.class?.name || x.subject?.class_obj?.name || null
            const evt = {
              kind: x.exam_type || 'exam',
              title: x.title || 'Exam',
              subject: subject,
              className: className,
            }
            ev[iso] = ev[iso] || []
            ev[iso].push(evt)
          })

          // also include classes (start_date) as events so they appear on calendar
          if (Array.isArray(classes)) {
            classes.forEach(cl => {
              const iso = cl.start_date ? toISO(cl.start_date) : null
              if (!iso) return
              const evt = {
                kind: 'class',
                title: cl.name || cl.class_name || 'Class',
                className: cl.name || cl.class_name || null,
                course: cl.course?.name || cl.course_name || null,
              }
              ev[iso] = ev[iso] || []
              // avoid duplicate structured events based on title+class
              const exists = ev[iso].some(e => typeof e !== 'string' && e.title === evt.title && (e.className || e.class_name) === (evt.className || evt.class_name))
              if (!exists) ev[iso].push(evt)
            })
          }
          if (mounted) setCalendarEvents(ev)
        } catch (err) {
          // ignore calendar load errors; don't block dashboard
          console.debug('Failed to load exams for calendar', err)
        }
      }
      loadEvents()
      return () => { mounted = false }
  }, [user, classes])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Instructors dashboard</h2>
        <p className="text-sm text-gray-500">Your classes and recent activity</p>
      </header>

      {/* Cards grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card title="My classes" value={loading ? '…' : (classes ? String(classes.length) : '0')} icon="Layers" badge={null} accent="bg-emerald-500" colored={true} />
        <Card title="Pending grading" value={loading ? '…' : String(pendingGrading ?? 0)} icon="CheckSquare" badge={null} accent="bg-sky-500" colored={true} />
        <Card title="Students" value={loading ? '…' : String(uniqueStudentsCount)} icon="Users" badge={null} accent="bg-indigo-500" colored={true} />
        <Card title="Attendance today" value={loading ? '…' : String(attendanceToday ?? 0)} icon="Calendar" badge={null} accent="bg-pink-500" colored={true} />
      </section>

      <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Calendar events={calendarEvents} />
        </div>

        <div className="bg-white rounded-xl p-4 border border-neutral-200">
          <h3 className="text-black font-medium mb-3 ">Notes</h3>
          {loading && <div className="p-2 text-sm text-neutral-500">Loading…</div>}
          {error && <div className="p-2 text-sm text-red-600">Failed to load: {error.message || String(error)}</div>}
          {!loading && !error && (
            <div className="text-sm text-neutral-500">No events yet — use the calendar to track important dates.</div>
          )}
        </div>
      </section>
    </div>
  )
}
