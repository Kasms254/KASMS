import React, { useEffect, useState } from 'react'
import useAuth from '../../hooks/useAuth'
import * as Icons from 'lucide-react'
import * as api from '../../lib/api'

export default function Notifications() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) return
      setLoading(true)
      try {
        const role = (user && user.role) || (user && user.is_staff ? 'admin' : null) || 'student'

  let notices = []
        let exams = []
        let schedule = []
        // load data depending on role
        if (role === 'admin') {
          const n = await api.getNotices().catch(() => [])
          notices = Array.isArray(n) ? n : (n && Array.isArray(n.results) ? n.results : [])
          const e = await api.getExams().catch(() => [])
          exams = Array.isArray(e) ? e : (e && Array.isArray(e.results) ? e.results : [])
        } else if (role === 'instructor') {
          const n = await api.getMyClassNotices().catch(() => [])
          notices = Array.isArray(n) ? n : (n && Array.isArray(n.results) ? n.results : [])
          const e = await api.getMyExams().catch(() => [])
          exams = Array.isArray(e) ? e : (e && Array.isArray(e.results) ? e.results : [])
        } else {
          // student
          const n = await api.getMyClassNotices().catch(() => [])
          notices = Array.isArray(n) ? n : (n && Array.isArray(n.results) ? n.results : [])
          const s = await api.getStudentUpcomingSchedule(60).catch(() => null)
          // schedule may contain exams/assignments under s.exams or s.events
          if (s) {
            if (Array.isArray(s.exams)) schedule = s.exams
            else if (Array.isArray(s.events)) schedule = s.events
          }
          // also include any recently graded results for this student
          try {
            const r = await api.getMyResults().catch(() => null)
            const results = Array.isArray(r) ? r : (r && Array.isArray(r.results) ? r.results : [])
            // map results to simple items
            const resultItems = results.map(res => ({ kind: 'result', id: res.id, title: `Result: ${res.subject_name || res.subject?.name || ''}`, date: res.updated_at || res.graded_at || res.created_at || null, meta: res }))
            schedule = schedule.concat(resultItems)
          } catch {
            // ignore
          }
        }

        // normalize notices
        // also include global active/urgent notices so instructors/students see site-wide notices
        try {
          const [urgentResp, activeResp] = await Promise.allSettled([api.getUrgentNotices(), api.getActiveNotices()])
          const urgent = urgentResp.status === 'fulfilled' ? (Array.isArray(urgentResp.value) ? urgentResp.value : (urgentResp.value && Array.isArray(urgentResp.value.results) ? urgentResp.value.results : [])) : []
          const active = activeResp.status === 'fulfilled' ? (Array.isArray(activeResp.value) ? activeResp.value : (activeResp.value && Array.isArray(activeResp.value.results) ? activeResp.value.results : [])) : []
          // prepend active & urgent so they appear first
          notices = [...active, ...urgent, ...notices]
        } catch {
          // ignore fetch issues
        }

        // map notices to normalized items and dedupe by id
        const seen = new Set()
        const noticeItems = (notices || []).flatMap(n => n ? [n] : []).reduce((acc, n) => {
          const id = n && n.id ? String(n.id) : null
          if (id && seen.has(id)) return acc
          if (id) seen.add(id)
          acc.push({ kind: 'notice', id: n.id, title: n.title, date: n.expiry_date || n.start_date || n.created_at || n.created, meta: n })
          return acc
        }, [])

        // normalize exams
        const examItems = (exams || []).map(e => ({ kind: 'exam', id: e.id, title: e.title || 'Exam', date: e.exam_date || e.date || null, subject: e.subject_name || e.subject?.name || null, className: e.class_name || e.class?.name || e.class_obj?.name || null, meta: e }))

        const schedItems = (schedule || []).map(s => ({ kind: s.kind || 'exam', id: s.id || s.exam_id || null, title: s.title || s.name || 'Event', date: s.exam_date || s.date || s.event_date || s.updated_at || null, meta: s }))

  const merged = [...noticeItems, ...examItems, ...schedItems]
        // filter items with a date, convert date to Date, sort desc by date
        const normalized = merged
          .map(i => ({ ...i, _date: i.date ? new Date(i.date) : null, read: (i.meta && (i.meta.read || i.meta.is_read)) ? true : false }))
          .filter(i => i._date && !Number.isNaN(i._date.getTime()))
          .sort((a, b) => b._date - a._date)

        if (mounted) setItems(normalized)
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
    <div className="p-4">
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Notifications</h2>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">Recent notices, upcoming exams and alerts relevant to you</p>
          <button
            className="text-sm bg-neutral-100 px-3 py-1 rounded-md text-neutral-700 hover:bg-neutral-200"
            onClick={() => {
              // optimistic local mark-all-read
              setItems(prev => prev.map(i => ({ ...i, read: true })))
              // notify other UI (NavBar) to mark notifications read
              try {
                const ids = (items || []).map(x => x.id)
                window.dispatchEvent(new CustomEvent('notifications:marked_read', { detail: { ids } }))
              } catch (err) {
                // ignore dispatch errors
                console.debug('notify mark read dispatch failed', err)
              }
            }}
          >
            Mark all read
          </button>
        </div>
      </header>

      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        {loading && <div className="text-sm text-neutral-500">Loading…</div>}
        {error && <div className="text-sm text-red-600">Failed to load: {error.message || String(error)}</div>}
        {!loading && !error && (
          <div className="space-y-3">
            {items.length === 0 && <div className="text-sm text-neutral-500">No notifications.</div>}
            {items.map(item => {
              const unread = !item.read
              const iconSize = 'w-6 h-6'
              const baseClasses = `flex items-start gap-3 p-3 rounded-md hover:bg-slate-50` + (unread ? ' ring-1 ring-indigo-100 bg-indigo-50' : ' bg-white')
              const iconColor = item.kind === 'notice' ? (unread ? 'text-amber-600' : 'text-amber-400') : item.kind === 'exam' ? (unread ? 'text-sky-600' : 'text-sky-400') : (unread ? 'text-emerald-600' : 'text-emerald-400')
              return (
                <div key={`${item.kind}-${item.id}-${item._date?.getTime()||0}`} className={baseClasses}>
                  <div className="shrink-0 mt-1">
                    {item.kind === 'notice' && <Icons.Bell className={`${iconSize} ${iconColor}`} />}
                    {item.kind === 'exam' && <Icons.Clipboard className={`${iconSize} ${iconColor}`} />}
                    {item.kind === 'result' && <Icons.CheckSquare className={`${iconSize} ${iconColor}`} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className={`text-sm font-medium ${unread ? 'text-black' : 'text-neutral-700'}`}>{item.title}</div>
                      <div className="text-xs text-neutral-400">{item._date ? item._date.toLocaleString() : ''}</div>
                    </div>
                    <div className="text-xs mt-1">
                      <div className={unread ? 'text-neutral-600' : 'text-neutral-500'}>
                        {item.kind === 'exam' ? `${item.subject || ''}${item.className ? ` — ${item.className}` : ''}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex items-start gap-2">
                    <button
                      className={`text-sm px-3 py-1 rounded-md ${unread ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}
                      onClick={() => {
                        setSelected(item)
                        setModalOpen(true)
                        if (unread) {
                          setItems(prev => prev.map(x => x.id === item.id ? { ...x, read: true } : x))
                          try { window.dispatchEvent(new CustomEvent('notifications:marked_read', { detail: { ids: [item.id] } })) } catch (err) { console.debug('dispatch mark read failed', err) }
                        }
                      }}
                    >
                      Details
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* Details modal */}
      {modalOpen && selected && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => { setModalOpen(false); setSelected(null) }} />
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg border border-neutral-200 p-6 relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-black">{selected.title}</h3>
                  <div className="text-xs text-neutral-400">{selected._date ? selected._date.toLocaleString() : ''}</div>
                </div>
                <div>
                  <button onClick={() => { setModalOpen(false); setSelected(null) }} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100">✕</button>
                </div>
              </div>

              <div className="mt-4 text-sm text-neutral-700">
                {selected.kind === 'notice' && (
                  <div>
                    <div className="mb-2 text-neutral-600">{selected.meta?.content || selected.meta?.description || selected.meta?.body || 'No details available.'}</div>
                    <div className="text-xs text-neutral-500">Posted by: {selected.meta?.created_by_name || (selected.meta && selected.meta.created_by && (selected.meta.created_by.username || selected.meta.created_by.name)) || 'Unknown'}</div>
                  </div>
                )}
                {selected.kind === 'exam' && (
                  <div>
                    <div className="mb-2 text-neutral-600">{selected.meta?.description || selected.meta?.notes || 'No description.'}</div>
                    <div className="text-xs text-neutral-500">Subject: {selected.subject || selected.meta?.subject_name || ''}{selected.className ? ` — ${selected.className}` : ''}</div>
                    {selected.meta?.attachments && selected.meta.attachments.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-medium mb-1">Attachments</div>
                        <ul className="text-sm text-neutral-600 list-disc list-inside">
                          {selected.meta.attachments.map(a => (
                            <li key={a.id}><a className="text-sky-600 hover:underline" href={a.file || a.file_url || a.url} target="_blank" rel="noreferrer">{a.file_name || a.file || 'Attachment'}</a></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {selected.kind === 'result' && (
                  <div>
                    <div className="mb-2 text-neutral-600">{selected.meta?.remarks || selected.meta?.comments || ''}</div>
                    <div className="text-xs text-neutral-500">Score: {selected.meta?.marks_obtained ?? '—'} / {selected.meta?.exam_total_marks ?? selected.meta?.total_marks ?? '—'}</div>
                  </div>
                )}

                {/* Fallback raw metadata for debugging */}
                {!selected.kind && <pre className="mt-3 text-xs text-neutral-500">{JSON.stringify(selected.meta, null, 2)}</pre>}
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  )
}
