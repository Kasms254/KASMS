import React, { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'
import useAuth from '../../hooks/useAuth'
import * as api from '../../lib/api'

export default function StudentsDashboard() {
  const { user } = useAuth()
  const [classesCount, setClassesCount] = useState(null)
  const [gpa, setGpa] = useState(null)
  const [dashboardStats, setDashboardStats] = useState(null)
  const [activeClassName, setActiveClassName] = useState(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [calendarEvents, setCalendarEvents] = useState({})
  // tick used to re-render the component periodically so "upcoming" windows
  // update when the date changes without needing a backend update.
  const [nowTick, setNowTick] = useState(0)

  useEffect(() => {
    let mounted = true
    async function loadMetrics() {
      setLoadingMetrics(true)
      try {
        // Prefer the consolidated student-dashboard overview endpoint.
        // Fall back to existing heuristics if backend doesn't expose it.
        try {
          const dash = await api.getStudentDashboard().catch(() => null)
          if (dash && dash.stats) {
            const s = dash.stats
            if (mounted) {
              setDashboardStats(s)
              setClassesCount(s.total_classes ?? 0)
              // prefer average grade as a GPA-like metric
              setGpa(s.average_grade ?? user?.gpa ?? null)
              // pick an active class name from enrollments if provided by the consolidated endpoint
              try {
                const enrolls = Array.isArray(dash.enrollments) ? dash.enrollments : (dash.enrollments && Array.isArray(dash.enrollments.results) ? dash.enrollments.results : [])
                if (enrolls && enrolls.length) {
                  const e = enrolls[0]
                  const cname = e?.class_name || (e?.class_obj && (e.class_obj.name || e.class_obj.title)) || (e?.class && (e.class.name || e.class)) || null
                  setActiveClassName(cname || null)
                } else {
                  setActiveClassName(null)
                }
              } catch { setActiveClassName(null) }
              // we seed calendar events below; no separate upcomingExams state needed
              if (Array.isArray(dash.upcoming_exams)) {
                const ev = {}
                dash.upcoming_exams.forEach(x => {
                  const date = x?.exam_date || x?.date
                  const iso = date ? `${new Date(date).getFullYear()}-${String(new Date(date).getMonth()+1).padStart(2,'0')}-${String(new Date(date).getDate()).padStart(2,'0')}` : null
                  if (!iso) return
                  ev[iso] = ev[iso] || []
                  ev[iso].push({
                    kind: 'exam',
                    title: x.title || 'Exam',
                    subject: x.subject_name || (x.subject && x.subject.name) || null,
                    className: x.class_name || (x.subject && x.subject.class_obj && x.subject.class_obj.name) || null,
                    exam_id: x.id,
                    url: x.id ? `/exams/${x.id}` : null,
                    duration: x.exam_duration || null,
                  })
                })
                if (mounted) setCalendarEvents(ev)
              }
            }
          } else {
            // fallback: attempt older heuristics (enrollments / my classes)
            let count = null
            let enrollsVar = null
            if (user && user.id) {
              try {
                enrollsVar = await api.getUserEnrollments(user.id).catch(() => null)
                if (Array.isArray(enrollsVar)) count = enrollsVar.length
                else if (enrollsVar && Array.isArray(enrollsVar.results)) count = enrollsVar.results.length
              } catch { /* ignore */ }
            }
            if (count === null) {
              try {
                const myClasses = await api.getMyClasses().catch(() => null)
                if (Array.isArray(myClasses)) count = myClasses.length
                else if (myClasses && Array.isArray(myClasses.results)) count = myClasses.results.length
              } catch { /* ignore */ }
            }
            if (mounted) {
              setClassesCount(count ?? 0)
              setGpa(user?.gpa ?? null)
              // fallback: if enrollments were fetched above, try to use the first as active class
              try {
                const en = Array.isArray(enrollsVar) ? enrollsVar : (enrollsVar && Array.isArray(enrollsVar.results) ? enrollsVar.results : [])
                if (en && en.length) {
                  const e = en[0]
                  const cname = e?.class_name || (e?.class_obj && (e.class_obj.name || e.class_obj.title)) || (e?.class && (e.class.name || e.class)) || null
                  setActiveClassName(cname || null)
                } else {
                  setActiveClassName(null)
                }
              } catch { /* ignore */ }
            }
          }
        } catch {
          // if all else fails use previous heuristics
          console.debug('Failed to load consolidated student dashboard')
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
    // re-render every minute so upcoming list updates as dates pass
    const tickTimer = setInterval(() => setNowTick(n => n + 1), 60 * 1000)
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
        // First try the dedicated student upcoming schedule endpoint
        try {
          const schedule = await api.getStudentUpcomingSchedule(30).catch(() => null)
          if (schedule && Array.isArray(schedule.exams)) {
            const ev = {}
            schedule.exams.forEach(x => {
              const iso = x?.exam_date ? toISO(x.exam_date) : (x?.date ? toISO(x.date) : null)
              if (!iso) return
              ev[iso] = ev[iso] || []
              ev[iso].push({
                kind: 'exam',
                title: x.title || 'Exam',
                subject: x.subject_name || (x.subject && x.subject.name) || null,
                className: x.class_name || (x.subject && x.subject.class_obj && x.subject.class_obj.name) || null,
                exam_id: x.id,
                url: x.id ? `/exams/${x.id}` : null,
                duration: x.exam_duration || null,
              })
            })
            // also include notices from the general/my_notices endpoint and global active notices
            const [noticesResp, activeNoticesResp] = await Promise.all([
              api.getMyClassNotices().catch(() => null),
              api.getActiveNotices().catch(() => null),
            ])
            const classNotices = Array.isArray(noticesResp) ? noticesResp : (noticesResp && Array.isArray(noticesResp.results) ? noticesResp.results : [])
            const activeNotices = Array.isArray(activeNoticesResp) ? activeNoticesResp : (activeNoticesResp && Array.isArray(activeNoticesResp.results) ? activeNoticesResp.results : [])
            const notices = [...activeNotices, ...classNotices]
            notices.forEach(n => {
              // support many possible date fields returned by different backends
              const date = n?.expiry_date || n?.expiry || n?.start_date || n?.event_date || n?.date || n?.notice_date || n?.created_at || n?.created || n?.updated_at || n?.published_at
              const iso = date ? toISO(date) : null
              if (!iso) return
              ev[iso] = ev[iso] || []
              ev[iso].push({
                kind: 'notice',
                title: n?.title || n?.message || n?.body || 'Notice',
                noticeId: n?.id || null,
                created_by_name: n?.created_by_name || (n.created_by && (n.created_by.username || n.created_by.name)) || null,
              })
            })

            if (mounted) setCalendarEvents(ev)
            return
          }
        } catch {
          // ignore and fall back to previous logic
        }
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

        // fetch class-scoped notices and active/global notices so admin posts are included
        const [noticesResp, activeNoticesResp] = await Promise.all([
          api.getMyClassNotices().catch(() => null),
          api.getActiveNotices().catch(() => null),
        ])

        const classNotices = Array.isArray(noticesResp) ? noticesResp : (noticesResp && Array.isArray(noticesResp.results) ? noticesResp.results : [])
        const activeNotices = Array.isArray(activeNoticesResp) ? activeNoticesResp : (activeNoticesResp && Array.isArray(activeNoticesResp.results) ? activeNoticesResp.results : [])

        const ev = {}

        const exams = Array.isArray(examsResp) ? examsResp : (examsResp && Array.isArray(examsResp.results) ? examsResp.results : [])
        exams.forEach(x => {
          const iso = x?.exam_date ? toISO(x.exam_date) : (x?.date ? toISO(x.date) : null)
          if (!iso) return
          ev[iso] = ev[iso] || []
          ev[iso].push({
            kind: 'exam',
            title: x.title || 'Exam',
            subject: x.subject_name || (x.subject && x.subject.name) || null,
            className: x.class_name || (x.subject && x.subject.class_obj && x.subject.class_obj.name) || null,
            exam_id: x.id,
            url: x.id ? `/exams/${x.id}` : null,
            duration: x.exam_duration || null,
          })
        })

  const notices = [...activeNotices, ...classNotices]
        notices.forEach(n => {
          const date = n?.expiry_date || n?.expiry || n?.start_date || n?.event_date || n?.date || n?.notice_date || n?.created_at || n?.created || n?.updated_at || n?.published_at
          const iso = date ? toISO(date) : null
          if (!iso) return
          ev[iso] = ev[iso] || []
          ev[iso].push({
            kind: 'notice',
            title: n?.title || n?.message || n?.body || 'Notice',
            noticeId: n?.id || null,
            created_by_name: n?.created_by_name || (n.created_by && (n.created_by.username || n.created_by.name)) || null,
          })
        })

        if (mounted) setCalendarEvents(ev)
      } catch (err) {
        console.debug('Failed to load student calendar events', err)
      }
    }

    // Initial load and poll every 60s for updates (so instructor posts appear quickly)
    loadEvents()
    timer = setInterval(() => loadEvents(), 60 * 1000)

    // When notices change (created/updated/deleted) elsewhere (admin UI),
    // re-run loadEvents so calendar immediately shows new notices.
    function onNoticesChanged() { try { loadEvents().catch(() => {}) } catch { /* ignore */ } }
    window.addEventListener('notices:changed', onNoticesChanged)

    return () => { mounted = false; if (timer) clearInterval(timer); window.removeEventListener('notices:changed', onNoticesChanged); clearInterval(tickTimer) }
  }, [user])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Students dashboard</h2>
        <p className="text-sm text-gray-500">Your classes, assignments and progress</p>
      </header>

      {/* Top cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card
          title="Course enrolled"
          value={loadingMetrics ? '…' : `${dashboardStats?.total_classes ?? classesCount ?? 0} `}
          icon="BookOpen"
          badge={null}
          accent="bg-indigo-500"
          colored={true}
        >
          <div className="text-xs">Subjects: {dashboardStats?.total_subjects ?? '—'}</div>
          <div className="text-xs mt-1">Active class: {loadingMetrics ? '…' : (activeClassName ? <span title={activeClassName} className="inline-block align-middle">{activeClassName}</span> : '—')}</div>
        </Card>

        {/* Grade card: shows grade for current/active class only */}
        <Card
          title={(() => {
            if (loadingMetrics) return 'Grade'
            const className = dashboardStats?.active_class_name
            return className ? `Grade — ${className}` : 'Grade'
          })()}
          value={(() => {
            if (loadingMetrics) return '…'
            // Big metric: prefer the student's grade letter provided by server
            const studentLetter = dashboardStats?.average_grade_letter
            if (studentLetter) return studentLetter
            // Fallback to a numeric grade (use dashboard average or user's gpa)
            const gradeNum = dashboardStats?.average_grade != null ? `${dashboardStats.average_grade}%` : (gpa != null ? `${gpa}%` : null)
            return gradeNum ?? '—'
          })()}
          icon="BarChart2"
          badge={null}
          accent={(() => {
            // Use letter if present, otherwise base color on numeric average
            const studentLetter = dashboardStats?.average_grade_letter
            if (studentLetter) {
              if (studentLetter === 'A') return 'bg-emerald-500'
              if (studentLetter === 'B') return 'bg-amber-500'
              if (studentLetter === 'C') return 'bg-sky-500'
              if (studentLetter === 'D') return 'bg-pink-500'
              return 'bg-rose-500'
            }
            const avg = dashboardStats?.average_grade != null ? Number(dashboardStats.average_grade) : (gpa != null ? Number(gpa) : null)
            if (avg == null || Number.isNaN(avg)) return 'bg-amber-500'
            if (avg >= 80) return 'bg-emerald-500'
            if (avg >= 70) return 'bg-amber-500'
            if (avg >= 60) return 'bg-sky-500'
            if (avg >= 50) return 'bg-pink-500'
            return 'bg-rose-500'
          })()}
          colored={true}
        >
          <div className="mt-2 text-xs text-black">
            {(() => {
              if (loadingMetrics) return <span className="inline-block px-2 py-0.5 rounded-md bg-black/5 text-black font-medium">Score: …</span>
              // Show total score for active class
              const obtained = dashboardStats?.total_marks_obtained
              const possible = dashboardStats?.total_possible_marks
              if (obtained != null && possible != null && possible > 0) {
                const obtainedStr = Number.isInteger(obtained) ? obtained : obtained.toFixed(1)
                return <span className="inline-block px-2 py-0.5 rounded-md bg-black/5 text-black font-medium">Score: {obtainedStr}/{possible}</span>
              }
              // Fallback to showing percentage
              const avgNum = dashboardStats?.average_grade != null ? Number(dashboardStats.average_grade) : (gpa != null ? Number(gpa) : null)
              if (avgNum != null && !Number.isNaN(avgNum)) {
                return <span className="inline-block px-2 py-0.5 rounded-md bg-black/5 text-black font-medium">{avgNum.toFixed(1)}%</span>
              }
              return <span className="inline-block px-2 py-0.5 rounded-md bg-black/5 text-black font-medium">No results yet</span>
            })()}
          </div>
        </Card>

        <Card
          title="Pending exams"
          value={loadingMetrics ? '…' : `${dashboardStats?.pending_exams ?? '—'}`}
          icon="Clock"
          badge={null}
          accent="bg-sky-500"
          colored={true}
        >
          <div className="text-xs">Exams scheduled: {dashboardStats?.pending_exams ?? '—'}</div>
        </Card>

        <Card
          title="Attendance"
          value={loadingMetrics ? '…' : (dashboardStats?.attendance_rate != null ? `${dashboardStats.attendance_rate}%` : '—')}
          icon="UserCheck"
          badge={null}
          accent="bg-pink-500"
          colored={true}
        >
          <div className="text-xs">Present: {dashboardStats?.present_days ?? '—'}</div>
        </Card>
      </section>

      {/* Calendar and activity */}
      <section className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <Calendar events={calendarEvents} />
        </div>

        <div className="bg-white rounded-xl p-4 border border-neutral-200">
          <h3 className="text-lg font-medium mb-3 text-black">Upcoming assignments & events</h3>
          {/* Build a flattened list of events from calendarEvents and sort by date (latest first) */}
          {(() => {
            const items = []
            Object.keys(calendarEvents || {}).forEach(iso => {
              const evs = Array.isArray(calendarEvents[iso]) ? calendarEvents[iso] : []
              evs.forEach(e => {
                // normalize string events
                if (typeof e === 'string') {
                  items.push({ date: iso, kind: 'note', title: e })
                } else if (e && typeof e === 'object') {
                  items.push({ date: iso, ...e })
                }
              })
            })

            // sort by date desc (latest first)
            items.sort((a, b) => {
              if (!a.date && !b.date) return 0
              if (!a.date) return 1
              if (!b.date) return -1
              // ISO strings in YYYY-MM-DD form compare lexicographically
              return b.date.localeCompare(a.date)
            })

            const fmt = (iso) => {
              try {
                const d = new Date(iso)
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              } catch { return iso }
            }

            // Show only the next 5 upcoming events (today or future), sorted nearest-first.
            const pad = (n) => String(n).padStart(2, '0')
            const todayISO = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`
            const list = items
              .filter(it => it && it.date && it.date >= todayISO)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5)

            return (
              <ul className="divide-y">
                {list.length === 0 && (
                  <li className="py-2 text-sm text-neutral-500">No upcoming events</li>
                )}
                {list.map((it, idx) => (
                  <li key={`${it.date}-${idx}`} className="py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-black truncate">
                          {it.title || it.name || (it.kind === 'notice' ? 'Notice' : 'Event')}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {it.subject ? `${it.subject}${it.className ? ` · ${it.className}` : ''}` : (it.className || '')}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="text-sm text-neutral-600">{fmt(it.date)}</div>
                        <div className="mt-1">
                          {it.url ? (
                            <a className="text-xs text-indigo-600 hover:underline" href={it.url} target="_blank" rel="noopener noreferrer">View</a>
                          ) : it.kind === 'notice' ? (
                            <span className="text-xs text-amber-700">Notice</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
          })()}
        </div>
      </section>
    </div>
  )
}
