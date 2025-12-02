import React, { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'
import useAuth from '../../hooks/useAuth'
import * as api from '../../lib/api'

export default function StudentsDashboard() {
  const { user } = useAuth()
  const [classesCount, setClassesCount] = useState(null)
  const [gpa, setGpa] = useState(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [calendarEvents, setCalendarEvents] = useState({})

  useEffect(() => {
    let mounted = true
    async function loadMetrics() {
      setLoadingMetrics(true)
      try {
        // Try to fetch enrollments for the current user; fall back to my classes
        let count = null
        if (user && user.id) {
          try {
            const enrolls = await api.getUserEnrollments(user.id).catch(() => null)
            if (Array.isArray(enrolls)) count = enrolls.length
          } catch {
            // ignore
          }
        }
        if (count === null) {
          try {
            const myClasses = await api.getMyClasses().catch(() => null)
            if (Array.isArray(myClasses)) count = myClasses.length
          } catch {
            // ignore
          }
        }

        if (mounted) {
          setClassesCount(count ?? 0)
          // If user object contains GPA use it; otherwise leave null
          setGpa(user?.gpa ?? null)
        }
      } finally {
        if (mounted) setLoadingMetrics(false)
      }
    }
    loadMetrics()
    return () => { mounted = false }
  }, [user])

  // Load student-specific calendar events (exams, class notices).
  // We poll periodically so that when an instructor posts an exam the student's
  // calendar picks it up shortly after.
  useEffect(() => {
    let mounted = true
    let timer = null

    const pad = (n) => String(n).padStart(2, '0')
    const toISO = (d) => {
      try {
        const dt = new Date(d)
        if (Number.isNaN(dt.getTime())) return null
        return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
      } catch { return null }
    }

    async function loadEvents() {
      try {
        // Fetch student's enrollments to be able to filter global exams
        let enrolls = []
        try {
          if (user && user.id) {
            const r = await api.getUserEnrollments(user.id).catch(() => null)
            enrolls = Array.isArray(r) ? r : (r && Array.isArray(r.results) ? r.results : [])
          }
        } catch { /* ignore */ }

        // Build sets of class ids from enrollments. Enrollment model uses `class_obj`.
        const classIds = new Set()
        enrolls.forEach(e => {
          // Support multiple shapes: class_obj, class_obj.id, class, class_id
          if (e.class_obj) {
            classIds.add(typeof e.class_obj === 'object' ? (e.class_obj.id || e.class_obj.pk || e.class_obj._id) : e.class_obj)
          } else if (e.class || e.class_id) {
            classIds.add(e.class || e.class_id)
          }
        })

        // Derive subject IDs by fetching class subjects for each enrolled class.
        const subjectIds = new Set()
        if (classIds.size) {
          try {
            const classIdArr = Array.from(classIds).filter(Boolean)
            const subjLists = await Promise.all(classIdArr.map(id => api.getClassSubjects(String(id)).catch(() => [])))
            subjLists.forEach(list => {
              const arr = Array.isArray(list) ? list : (list && Array.isArray(list.results) ? list.results : [])
              arr.forEach(s => {
                if (!s) return
                if (s.id) subjectIds.add(s.id)
                else if (s.subject_id) subjectIds.add(s.subject_id)
                else if (s._id) subjectIds.add(s._id)
              })
            })
          } catch (err) {
            // ignore subject lookup errors; continue with whatever we have
            console.debug('Failed to load class subjects for enrollments', err)
          }
        }

        // Try to get exams targeted at the current user first
        let examsResp = await api.getMyExams().catch(() => null)
        // If none returned, fall back to fetching all exams and filter by enrollments
        if (!examsResp || (Array.isArray(examsResp) && examsResp.length === 0) || (examsResp && Array.isArray(examsResp.results) && examsResp.results.length === 0)) {
          const allExams = await api.getExams().catch(() => [])
          examsResp = Array.isArray(allExams) ? allExams : (allExams && Array.isArray(allExams.results) ? allExams.results : [])
          // Filter exams by matching fields (common API shapes)
          examsResp = examsResp.filter(x => {
            // Accept if exam explicitly lists enrolled students or matches enrollment classes/subjects
            if (!x) return false
            if (Array.isArray(x.students) && user && x.students.find(s => String(s.id || s) === String(user.id))) return true
            const examClass = x.class || x.class_id || x.classId || (x.target && x.target.class)
            if (examClass && classIds.size && classIds.has(examClass)) return true
            const examSubject = x.subject || x.subject_id || x.subjectId || x.subject_name || (x.subject && x.subject.id)
            if (examSubject && subjectIds.size && (subjectIds.has(examSubject) || subjectIds.has(String(examSubject)))) return true
            // If exam has no targeting info, skip it for students
            return false
          })
        }

        const noticesResp = await api.getMyClassNotices().catch(() => null)

        const ev = {}

        const exams = Array.isArray(examsResp) ? examsResp : (examsResp && Array.isArray(examsResp.results) ? examsResp.results : [])
        exams.forEach(x => {
          const iso = x?.exam_date ? toISO(x.exam_date) : (x?.date ? toISO(x.date) : null)
          if (!iso) return
          const label = `${x.title || 'Exam'}${x.subject_name ? ` — ${x.subject_name}` : x.subject?.name ? ` — ${x.subject.name}` : ''}`
          ev[iso] = ev[iso] || []
          ev[iso].push(label)
        })

        const notices = Array.isArray(noticesResp) ? noticesResp : (noticesResp && Array.isArray(noticesResp.results) ? noticesResp.results : [])
        notices.forEach(n => {
          const date = n?.date || n?.notice_date || n?.created || n?.published_at
          const iso = date ? toISO(date) : null
          const label = n?.title || n?.message || n?.body || 'Notice'
          if (!iso) return
          ev[iso] = ev[iso] || []
          ev[iso].push(`Notice: ${label}`)
        })

        if (mounted) setCalendarEvents(ev)
      } catch (err) {
        console.debug('Failed to load student calendar events', err)
      }
    }

    // Initial load and poll every 60s for updates (so instructor posts appear quickly)
    loadEvents()
    timer = setInterval(() => loadEvents(), 60 * 1000)

    return () => { mounted = false; if (timer) clearInterval(timer) }
  }, [user])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Students dashboard</h2>
        <p className="text-sm text-gray-500">Your classes, assignments and progress</p>
      </header>

      {/* Top cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card title="Enrolled" value={loadingMetrics ? '…' : `${classesCount ?? 0} courses`} icon="BookOpen" badge={null} accent="bg-indigo-500" colored={true} />
        <Card title="GPA" value={gpa ?? '—'} icon="BarChart2" badge={null} accent="bg-amber-500" colored={true} />
        <Card title="Assignments" value={'—'} icon="Clipboard" badge={null} accent="bg-sky-500" colored={true} />
        <Card title="Notifications" value={'—'} icon="Bell" badge={null} accent="bg-pink-500" colored={true} />
      </section>

      {/* Calendar and activity */}
      <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Calendar events={calendarEvents} />
        </div>

        <div className="bg-white rounded-xl p-4 border border-neutral-200">
          <h3 className="text-lg font-medium mb-3 text-black">Upcoming assignments</h3>
          {/* Placeholder - if you have an assignments endpoint, populate here */}
          <ul className="divide-y">
            <li className="py-2 flex justify-between items-center">
              <span>Math homework</span>
              <span className="text-sm text-gray-500">Due Wed</span>
            </li>
            <li className="py-2 flex justify-between items-center">
              <span>Science project</span>
              <span className="text-sm text-gray-500">Due Fri</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
