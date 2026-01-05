import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserCard from '../../components/UserCard'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'
import * as Icons from 'lucide-react'
import * as api from '../../lib/api'
// useAuth not required in this view

export default function AdminDashboard() {
  // user context not required here
  // admin actions removed; replaced by Recent activity panel
  const [metrics, setMetrics] = useState({ students: null, instructors: null, admins: null, subjects: null, active_classes: null })
  const [calendarEvents, setCalendarEvents] = useState({})
  const [recentItems, setRecentItems] = useState([])
  const [recentLoading, setRecentLoading] = useState(true)

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

  // Load recent activity: recent users, notices and exams
  useEffect(() => {
    let mounted = true
    async function loadRecent() {
      setRecentLoading(true)
      try {
        const [usersResp, noticesResp, examsResp] = await Promise.allSettled([
          api.getUsers().catch(() => []),
          api.getNotices().catch(() => []),
          api.getExams().catch(() => []),
        ])

        const users = usersResp.status === 'fulfilled' ? (Array.isArray(usersResp.value) ? usersResp.value : (usersResp.value && Array.isArray(usersResp.value.results) ? usersResp.value.results : [])) : []
        const notices = noticesResp.status === 'fulfilled' ? (Array.isArray(noticesResp.value) ? noticesResp.value : (noticesResp.value && Array.isArray(noticesResp.value.results) ? noticesResp.value.results : [])) : []
        const exams = examsResp.status === 'fulfilled' ? (Array.isArray(examsResp.value) ? examsResp.value : (examsResp.value && Array.isArray(examsResp.value.results) ? examsResp.value.results : [])) : []

        const uItems = users.map(u => ({ kind: 'user', id: u.id, title: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || u.svc_number || 'User', date: u.date_joined || u.created_at || u.created || null, meta: u }))
        const nItems = notices.map(n => ({ kind: 'notice', id: n.id, title: n.title || 'Notice', date: n.created_at || n.created || n.start_date || n.expiry_date || null, meta: n }))
        const eItems = exams.map(e => ({ kind: 'exam', id: e.id, title: e.title || 'Exam', date: e.exam_date || e.date || e.created_at || null, meta: e }))

        const merged = [...uItems, ...nItems, ...eItems]
        const normalized = merged.map(i => ({ ...i, _date: i.date ? new Date(i.date) : null })).filter(i => i._date && !Number.isNaN(i._date.getTime()))
        normalized.sort((a, b) => b._date - a._date)
        if (mounted) setRecentItems(normalized.slice(0, 8))
      } catch (err) {
        console.debug('failed to load recent activity', err)
      } finally {
        if (mounted) setRecentLoading(false)
      }
    }
    loadRecent()
    return () => { mounted = false }
  }, [])

  // Load active notices and map to calendar events so admin sees notices on the calendar.
  useEffect(() => {
    let mounted = true

    const pad = (n) => String(n).padStart(2, '0')
    const toISO = (d) => {
      try {
        const dt = new Date(d)
        if (Number.isNaN(dt.getTime())) return null
        return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
      } catch { return null }
    }

    async function loadNotices() {
      try {
        const active = await api.getActiveNotices().catch(() => [])
        const act = Array.isArray(active) ? active : (active && Array.isArray(active.results) ? active.results : [])
        const ev = {}
        act.forEach(n => {
          const date = n?.expiry_date || n?.expiry || n?.created_at || n?.created
          const iso = date ? toISO(date) : null
          if (!iso) return
          ev[iso] = ev[iso] || []
          ev[iso].push({
            kind: 'notice',
            title: n.title || 'Notice',
            noticeId: n.id,
            created_by_name: n.created_by_name || (n.created_by && (n.created_by.username || n.created_by.name)) || null,
            expiry_date: n.expiry_date || null,
          })
        })
        if (mounted) setCalendarEvents(ev)
      } catch (err) {
        console.debug('Failed to load admin notices for calendar', err)
      }
    }

    loadNotices()

    function onChange() { if (mounted) loadNotices() }
    window.addEventListener('notices:changed', onChange)
    return () => { mounted = false; window.removeEventListener('notices:changed', onChange) }
  }, [])

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Admin dashboard</h2>
        <p className="text-sm text-gray-500">Overview of school metrics</p>
      </header>

      {/* Cards grid - modern layout */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {/* removed admin actions (Add user) per design change */}

      {/* Calendar + Recent activity area */}
      {/* prepare sample events in a stable way */}
      { /** eventsMemo is stable across renders */ }
      <section className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div>
          <Calendar events={calendarEvents} />
        </div>

        <div className="bg-white text-neutral-800 rounded-xl p-4 border border-neutral-200 h-full">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium mb-3">Latest activity</h3>
          </div>

          {recentLoading && <div className="text-sm text-neutral-500">Loading…</div>}

          {!recentLoading && (!recentItems || recentItems.length === 0) && (
            <div className="text-sm text-neutral-500">No recent activity</div>
          )}

          {!recentLoading && recentItems && recentItems.length > 0 && (
            <ul className="relative">
              {/* vertical line */}
              <div className="absolute left-6 top-6 bottom-4 w-px bg-neutral-200" aria-hidden="true" />

              {recentItems.slice(0, 5).map((it, idx) => {
                const deltaS = it._date ? Math.floor((Date.now() - it._date.getTime()) / 1000) : null
                const absS = deltaS == null ? null : Math.abs(deltaS)
                const fmt = (s) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)}m` : s < 86400 ? `${Math.floor(s/3600)}h` : `${Math.floor(s/86400)}d`)
                const rel = deltaS == null ? '' : (deltaS >= 0 ? `${fmt(absS)} ago` : `in ${fmt(absS)}`)
                const IconComp = it.kind === 'notice' ? Icons.Megaphone : it.kind === 'exam' ? Icons.Clipboard : Icons.User
                const iconBg = it.kind === 'notice' ? 'bg-amber-500' : it.kind === 'exam' ? 'bg-sky-500' : 'bg-indigo-500'
                return (
                  <li key={`${it.kind}-${it.id}-${idx}`} className="relative pl-14 pb-6">
                    <div className="absolute left-0 top-0 w-12 flex items-start justify-center">
                      <div className={`w-8 h-8 rounded-full ${iconBg} shadow-sm flex items-center justify-center`}>
                        {React.createElement(IconComp, { className: 'w-4 h-4 text-white' })}
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-20 text-sm text-neutral-500 mt-0.5">{rel}</div>
                      <div className="flex-1">
                        <div className="text-neutral-800 text-sm font-medium leading-tight">{it.title}</div>
                        <div className="mt-2 text-xs text-neutral-400">{it.kind === 'user' ? (it.meta?.role || '') : it.kind === 'exam' ? (it.meta?.subject_name || it.meta?.subject?.name || '') : ''}</div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
