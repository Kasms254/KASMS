import React from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'
import api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import { getInstructorDashboard } from '../../lib/api'
import { useQuery } from '@tanstack/react-query'
import { QK } from '../../lib/queryKeys'

export default function InstructorsDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: dashData = null, isLoading: loading, error } = useQuery({
    queryKey: QK.instructorDashboard(),
    queryFn: () => getInstructorDashboard(),
    enabled: !!user,
  })

  const classes = Array.isArray(dashData?.classes) ? dashData.classes : []
  const uniqueStudentsCount = dashData?.total_students ?? dashData?.students ?? dashData?.total_students_count ?? 0
  const attendanceToday = dashData?.attendance_today ?? dashData?.attendance_today_count ?? dashData?.today_attendance_records ?? 0
  const subjectsCount = dashData?.subjects_count ?? dashData?.total_subjects ?? (Array.isArray(dashData?.subjects) ? dashData.subjects.length : 0)

  const { data: calendarEvents = {} } = useQuery({
    queryKey: [...QK.exams('mine'), 'calendar'],
    queryFn: async () => {
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

      // include active/global notices on the instructor calendar
      try {
        const active = await api.getActiveNotices().catch(() => [])
        const act = Array.isArray(active) ? active : (active && Array.isArray(active.results) ? active.results : [])
        act.forEach(n => {
          const date = n?.expiry_date || n?.expiry || n?.created_at || n?.created
          const iso = date ? toISO(date) : null
          if (!iso) return
          ev[iso] = ev[iso] || []
          // Use a structured event so Calendar can style notices specially
          ev[iso].push({
            kind: 'notice',
            title: n.title || 'Notice',
            noticeId: n.id,
            created_by_name: n.created_by_name || (n.created_by && (n.created_by.username || n.created_by.name)) || null,
            expiry_date: n.expiry_date || null,
          })
        })
      } catch {
        // non-fatal
      }

      // Note: Class creation events are intentionally excluded from calendar
      // to avoid cluttering the events view with administrative actions
      return ev
    },
    enabled: !!user,
  })

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Instructors Dashboard</h2>
        <p className="text-sm text-gray-500">Your Classes and Recent Activity</p>
      </header>

      {/* Cards grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <Card title="My Classes" value={loading ? '…' : (classes ? String(classes.length) : '0')} icon="Layers" badge={null} accent="bg-emerald-500" colored={true} />
  <div
    role="button"
    tabIndex={0}
    onClick={() => navigate('/dashboard/instructors/subjects')}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/dashboard/instructors/subjects') }}
    className="focus:outline-none"
  >
    <Card title="Subjects" value={loading ? '…' : String(subjectsCount ?? 0)} icon="Book" badge={null} accent="bg-sky-500" colored={true} />
  </div>
  <Card title="Students" value={loading ? '…' : String(uniqueStudentsCount)} icon="Users" badge={null} accent="bg-indigo-500" colored={true} />
        <Card title="Attendance Today" value={loading ? '…' : String(attendanceToday ?? 0)} icon="Calendar" badge={null} accent="bg-pink-500" colored={true} />
      </section>

      <section className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <Calendar events={calendarEvents} />
        </div>

        <div className="bg-white rounded-xl p-4 border border-neutral-200">
          <h3 className="text-lg font-medium mb-3 text-black">Upcoming Assignments & Events</h3>
          {/* Build a flattened list of events from calendarEvents and sort by date (latest first) */}
          {loading && <div className="p-2 text-sm text-neutral-500">Loading…</div>}
          {error && <div className="p-2 text-sm text-red-600">Failed to load: {error.message || String(error)}</div>}
          {(() => {
            const items = []
            Object.keys(calendarEvents || {}).forEach(iso => {
              const evs = Array.isArray(calendarEvents[iso]) ? calendarEvents[iso] : []
              evs.forEach(e => {
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
              return b.date.localeCompare(a.date)
            })

            const fmt = (iso) => {
              try {
                const d = new Date(iso)
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              } catch { return iso }
            }

            const pad = (n) => String(n).padStart(2, '0')
            const todayISO = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`
            const list = items
              .filter(it => it && it.date && it.date >= todayISO)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5)

            return (
              <ul className="divide-y">
                {list.length === 0 && (
                  <li className="py-2 text-sm text-neutral-500">No Upcoming Events</li>
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
