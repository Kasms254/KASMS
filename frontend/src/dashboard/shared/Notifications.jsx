import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import useAuth from '../../hooks/useAuth'
import * as Icons from 'lucide-react'
import * as api from '../../lib/api'

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || ''
// Utility: Format date as relative time
function formatRelativeTime(date) {
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

// Utility: Group items by date
function groupByDate(items) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const groups = { Today: [], Yesterday: [], 'This Week': [], Older: [] }

  items.forEach(item => {
    const itemDate = new Date(item._date.getFullYear(), item._date.getMonth(), item._date.getDate())
    if (itemDate.getTime() === today.getTime()) {
      groups.Today.push(item)
    } else if (itemDate.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(item)
    } else if (item._date >= weekAgo) {
      groups['This Week'].push(item)
    } else {
      groups.Older.push(item)
    }
  })

  return Object.entries(groups).filter(([, items]) => items.length > 0)
}

// Skeleton Loader Component
function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-white animate-pulse">
      <div className="shrink-0 mt-1 w-6 h-6 bg-neutral-200 rounded" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-neutral-200 rounded w-3/4" />
          <div className="h-3 bg-neutral-200 rounded w-20" />
        </div>
        <div className="h-3 bg-neutral-200 rounded w-1/2" />
      </div>
      <div className="h-8 w-16 bg-neutral-200 rounded-md" />
    </div>
  )
}

// Empty State Component
function EmptyState({ filter }) {
  const messages = {
    all: { icon: Icons.Inbox, title: 'No notifications yet', desc: 'When you receive notices, exams, or results, they will appear here' },
    notice: { icon: Icons.Bell, title: 'No notices', desc: 'You have no active notices at the moment' },
    exam: { icon: Icons.Clipboard, title: 'No exams scheduled', desc: 'No upcoming exams to display' },
    result: { icon: Icons.CheckSquare, title: 'No results', desc: 'No graded results available yet' },
    unread: { icon: Icons.CheckCheck, title: 'All caught up!', desc: 'You have no unread notifications' }
  }
  const { icon: Icon, title, desc } = messages[filter] || messages.all

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-16 h-16 text-neutral-300 mb-4" strokeWidth={1.5} />
      <h3 className="text-lg font-medium text-neutral-700 mb-1">{title}</h3>
      <p className="text-sm text-neutral-500 max-w-sm">{desc}</p>
    </div>
  )
}

// Toast Notification Component
function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-4 right-4 z-50 bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-top-2">
      <Icons.Check className="w-5 h-5 text-green-400" />
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-neutral-400 hover:text-white">
        <Icons.X className="w-4 h-4" />
      </button>
    </div>
  )
}

// Memoized Notification Item Component
const NotificationItem = React.memo(({ item, onDetails, onMarkRead }) => {
  const unread = !item.read
  const iconSize = 'w-6 h-6'
  const baseClasses = `flex items-start gap-3 p-3 rounded-md transition-all duration-200 hover:shadow-sm cursor-pointer` + (unread ? ' ring-1 ring-indigo-200 bg-indigo-50' : ' bg-white hover:bg-slate-50')
  const iconColor = item.kind === 'notice' ? (unread ? 'text-amber-600' : 'text-amber-400') : item.kind === 'exam' ? (unread ? 'text-sky-600' : 'text-sky-400') : (unread ? 'text-emerald-600' : 'text-emerald-400')

  const handleClick = useCallback(() => {
    onDetails(item)
    if (unread) onMarkRead([item.id])
  }, [item, unread, onDetails, onMarkRead])

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${unread ? 'unread' : 'read'}, ${formatRelativeTime(item._date)}`}
      onClick={handleClick}
      onKeyPress={handleKeyPress}
      className={baseClasses}
    >
      <div className="shrink-0 mt-1">
        {item.kind === 'notice' && <Icons.Bell className={`${iconSize} ${iconColor}`} />}
        {item.kind === 'exam' && <Icons.Clipboard className={`${iconSize} ${iconColor}`} />}
        {item.kind === 'result' && <Icons.CheckSquare className={`${iconSize} ${iconColor}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className={`text-sm font-medium truncate ${unread ? 'text-black' : 'text-neutral-700'}`}>
            {item.title}
            {item.meta?.is_urgent && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Urgent</span>}
          </div>
          <div className="text-xs text-neutral-400 whitespace-nowrap" title={item._date.toLocaleString()}>
            {formatRelativeTime(item._date)}
          </div>
        </div>
        <div className="text-xs mt-1">
          <div className={unread ? 'text-neutral-600' : 'text-neutral-500'}>
            {item.kind === 'exam' ? `${item.subject || ''}${item.className ? ` — ${item.className}` : ''}` : ''}
          </div>
        </div>
        {unread && <div className="mt-1"><span className="inline-block w-2 h-2 bg-indigo-600 rounded-full"></span></div>}
      </div>
      <div className="ml-3 flex items-start gap-2">
        <button
          className={`text-xs px-3 py-1.5 rounded-md transition-colors ${unread ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
          onClick={(e) => {
            e.stopPropagation()
            handleClick()
          }}
        >
          View
        </button>
      </div>
    </div>
  )
})
NotificationItem.displayName = 'NotificationItem'

export default function Notifications() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const modalRef = useRef(null)

  // Filter and group items
  const filteredItems = useMemo(() => {
    let filtered = items
    if (filter === 'notice') filtered = items.filter(i => i.kind === 'notice')
    else if (filter === 'exam') filtered = items.filter(i => i.kind === 'exam')
    else if (filter === 'result') filtered = items.filter(i => i.kind === 'result')
    else if (filter === 'unread') filtered = items.filter(i => !i.read)
    return filtered
  }, [items, filter])

  const groupedItems = useMemo(() => groupByDate(filteredItems), [filteredItems])

  const unreadCount = useMemo(() => items.filter(i => !i.read).length, [items])

  const handleMarkRead = useCallback(async (ids) => {
    // Update local state first for instant UI feedback
    setItems(prev => prev.map(i => {
      if (ids.includes(i.id)) {
        // Update the meta.is_read field so it persists correctly
        return { ...i, read: true, meta: { ...i.meta, is_read: true, read: true } }
      }
      return i
    }))

    // Dispatch event to sync with NavBar
    try {
      window.dispatchEvent(new CustomEvent('notifications:marked_read', { detail: { ids } }))
    } catch (err) {
      console.debug('notify mark read dispatch failed', err)
    }

    // Call backend API to persist read status for each notification
    for (const id of ids) {
      const item = items.find(i => i.id === id)
      if (!item || !item.meta) {
        continue
      }

      try {
        const noticeId = item.meta.id
        if (!noticeId) {
          continue
        }

        // Determine if it's a class notice or regular notice
        const isClassNotice = !!item.meta.class_obj

        if (isClassNotice) {
          await api.markClassNoticeAsRead(noticeId)
        } else {
          await api.markNoticeAsRead(noticeId)
        }
      } catch (err) {
        // If 404, the notice was deleted - silently continue
        if (err.message && err.message.includes('not found')) {
          continue
        }
        // Log other errors only in development
        if (import.meta.env.DEV) {
          console.error(`Failed to mark notification ${id} as read:`, err)
        }
      }
    }
  }, [items])

  const handleMarkAllRead = useCallback(() => {
    const ids = items.map(x => x.id)
    handleMarkRead(ids)
    setToast('All notifications marked as read')
  }, [items, handleMarkRead])

  const handleOpenDetails = useCallback((item) => {
    setSelected(item)
    setModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setModalOpen(false)
    setSelected(null)
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) return

      const role = (user && user.role) || (user && user.is_staff ? 'admin' : null) || 'student'

      // Admins don't receive notifications - they create them
      if (role === 'admin') {
        if (mounted) {
          setItems([])
          setLoading(false)
        }
        return
      }

      setLoading(true)
      try {
        let notices = []
        let exams = []
        let schedule = []
        // load data depending on role
        if (role === 'instructor') {
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
        // Filter out notifications created by the current user (instructors shouldn't see their own notices)
        const seen = new Set()
        const noticeItems = (notices || []).flatMap(n => n ? [n] : []).reduce((acc, n) => {
          const id = n && n.id ? String(n.id) : null
          if (id && seen.has(id)) return acc
          if (id) seen.add(id)

          // Skip notifications created by the current user
          try {
            const cb = n.created_by
            const cbId = (cb && typeof cb === 'object') ? (cb.id || cb.pk || null) : cb
            if (cbId !== null && String(cbId) === String(user.id)) return acc
          } catch {
            // ignore and keep the notification
          }

          acc.push({ kind: 'notice', id: n.id, title: n.title, date: n.expiry_date || n.start_date || n.created_at || n.created, meta: n })
          return acc
        }, [])

        // normalize exams
        const examItems = (exams || []).map(e => ({ kind: 'exam', id: e.id, title: e.title || 'Exam', date: e.exam_date || e.date || null, subject: e.subject_name || e.subject?.name || null, className: e.class_name || e.class?.name || e.class_obj?.name || null, meta: e }))

        const schedItems = (schedule || []).map(s => ({ kind: s.kind || 'exam', id: s.id || s.exam_id || null, title: s.title || s.name || 'Event', date: s.exam_date || s.date || s.event_date || s.updated_at || null, meta: s }))

  const merged = [...noticeItems, ...examItems, ...schedItems]
        // filter items with a date, convert date to Date, sort desc by date
        const now = new Date()
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(now.getDate() - 7)

        const normalized = merged
          .map(i => ({ ...i, _date: i.date ? new Date(i.date) : null, read: (i.meta && (i.meta.read || i.meta.is_read)) ? true : false }))
          .filter(i => i._date && !Number.isNaN(i._date.getTime()))
          .filter(i => {
            // For exams, check if exam date has passed
            if (i.kind === 'exam' && i.meta?.exam_date) {
              const examDate = new Date(i.meta.exam_date)
              return examDate >= now || !Number.isNaN(examDate.getTime())
            }
            // For notices with expiry date, check if still valid
            if (i.kind === 'notice' && i.meta?.expiry_date) {
              const expiryDate = new Date(i.meta.expiry_date)
              return expiryDate >= now || !Number.isNaN(expiryDate.getTime())
            }
            // For items without specific event dates, show if within 7 days of creation
            const createdDate = i.meta?.created_at ? new Date(i.meta.created_at) : i._date
            return createdDate >= sevenDaysAgo
          })
          .sort((a, b) => b._date - a._date)

        if (mounted) setItems(normalized)
      } catch (err) {
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()

    // Listen for notices:changed event to refetch when notices are updated elsewhere
    function onNoticesChanged() {
      if (mounted) {
        load().catch(() => {})
      }
    }
    window.addEventListener('notices:changed', onNoticesChanged)

    return () => {
      mounted = false
      window.removeEventListener('notices:changed', onNoticesChanged)
    }
  }, [user])

  // Keyboard navigation for modal
  useEffect(() => {
    if (!modalOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseModal()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modalOpen, handleCloseModal])

  // Focus management for modal
  useEffect(() => {
    if (modalOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [modalOpen])

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-black">Notifications</h2>
            <p className="text-sm text-gray-500 mt-1">Recent notices, upcoming exams and alerts</p>
          </div>
          <button
            className="text-sm bg-neutral-100 px-4 py-2 rounded-md text-neutral-700 hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            <Icons.CheckCheck className="w-4 h-4" />
            <span>Mark all read {unreadCount > 0 && `(${unreadCount})`}</span>
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All', icon: Icons.Inbox, count: items.length },
            { key: 'unread', label: 'Unread', icon: Icons.Bell, count: unreadCount },
            { key: 'notice', label: 'Notices', icon: Icons.Bell, count: items.filter(i => i.kind === 'notice').length },
            { key: 'exam', label: 'Exams', icon: Icons.Clipboard, count: items.filter(i => i.kind === 'exam').length },
            { key: 'result', label: 'Results', icon: Icons.CheckSquare, count: items.filter(i => i.kind === 'result').length }
          ].map((tab) => {
            const TabIcon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === tab.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                    filter === tab.key ? 'bg-indigo-700' : 'bg-neutral-100'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        {loading && (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <NotificationSkeleton key={i} />)}
          </div>
        )}

        {error && (
          <div className="p-8 text-center">
            <Icons.AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <div className="text-sm text-red-600">Failed to load: {error.message || String(error)}</div>
          </div>
        )}

        {!loading && !error && (
          <>
            {filteredItems.length === 0 ? (
              <EmptyState filter={filter} />
            ) : (
              <div className="divide-y divide-neutral-100">
                {groupedItems.map(([groupName, groupItems]) => (
                  <div key={groupName} className="p-4">
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 px-3">
                      {groupName}
                    </h3>
                    <div className="space-y-2">
                      {groupItems.map(item => (
                        <NotificationItem
                          key={`${item.kind}-${item.id}-${item._date?.getTime()||0}`}
                          item={item}
                          onDetails={handleOpenDetails}
                          onMarkRead={handleMarkRead}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Details modal */}
      {modalOpen && selected && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" onClick={handleCloseModal} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div
              ref={modalRef}
              tabIndex={-1}
              className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 id="modal-title" className="text-lg text-black font-medium">{selected.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="text-xs text-neutral-400" title={selected._date?.toLocaleString()}>
                      {formatRelativeTime(selected._date)}
                    </div>
                    {selected.meta?.is_urgent && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        Urgent
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      selected.kind === 'notice' ? 'bg-amber-100 text-amber-800' :
                      selected.kind === 'exam' ? 'bg-sky-100 text-sky-800' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      {selected.kind === 'notice' ? 'Notice' : selected.kind === 'exam' ? 'Exam' : 'Result'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition"
                  aria-label="Close"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6 text-sm text-neutral-700 max-h-[60vh] overflow-y-auto">
                {selected.kind === 'notice' && (
                  <div className="space-y-3">
                    <div className="prose prose-sm max-w-none">
                      <p className="text-neutral-600 whitespace-pre-wrap">{selected.meta?.content || selected.meta?.description || selected.meta?.body || 'No details available.'}</p>
                    </div>
                    <div className="pt-3 border-t border-neutral-100">
                      <div className="text-xs text-neutral-500 flex items-center gap-2">
                        <Icons.User className="w-3 h-3" />
                        <span>Posted by: {(() => {
                          const creator = selected.meta?.created_by
                          const parts = []
                          if (creator?.service_number) parts.push(creator.service_number)
                          if (creator?.rank) parts.push(creator.rank)
                          if (creator?.name || creator?.username) parts.push(creator.name || creator.username)

                          if (parts.length > 0) return parts.join(' ')
                          return selected.meta?.created_by_name || 'Unknown'
                        })()}</span>
                      </div>
                    </div>
                  </div>
                )}
                {selected.kind === 'exam' && (
                  <div className="space-y-3">
                    <div className="prose prose-sm max-w-none">
                      <p className="text-neutral-600 whitespace-pre-wrap">{selected.meta?.description || selected.meta?.notes || 'No description.'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-100">
                      <div className="text-xs">
                        <div className="text-neutral-500 mb-1">Subject</div>
                        <div className="font-medium text-neutral-700">{selected.subject || selected.meta?.subject_name || '—'}</div>
                      </div>
                      {selected.className && (
                        <div className="text-xs">
                          <div className="text-neutral-500 mb-1">Class</div>
                          <div className="font-medium text-neutral-700">{selected.className}</div>
                        </div>
                      )}
                    </div>
                    {selected.meta?.attachments && selected.meta.attachments.length > 0 && (
                      <div className="pt-3 border-t border-neutral-100">
                        <div className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Icons.Paperclip className="w-4 h-4" />
                          Attachments
                        </div>
                        <ul className="space-y-2">
                          {selected.meta.attachments.map(a => {
                            const fileUrl = a.file || a.file_url || a.url || ''
                            const href = fileUrl.startsWith('http') || fileUrl.startsWith('data:')
                              ? fileUrl
                              : (API_BASE.replace(/\/$/, '') + (fileUrl.startsWith('/') ? fileUrl : ('/' + fileUrl)))

                            return (
                              <li key={a.id}>
                                <a
                                  className="text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-2 text-sm"
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Icons.Download className="w-4 h-4" />
                                  {a.file_name || a.file || 'Attachment'}
                                </a>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {selected.kind === 'result' && (
                  <div className="space-y-3">
                    {(selected.meta?.remarks || selected.meta?.comments) && (
                      <div className="prose prose-sm max-w-none">
                        <p className="text-neutral-600 whitespace-pre-wrap">{selected.meta?.remarks || selected.meta?.comments}</p>
                      </div>
                    )}
                    <div className="pt-3 border-t border-neutral-100">
                      <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                        <span className="text-sm text-neutral-600">Score</span>
                        <span className="text-2xl font-bold text-neutral-900">
                          {selected.meta?.marks_obtained ?? '—'} <span className="text-lg text-neutral-500">/ {selected.meta?.exam_total_marks ?? selected.meta?.total_marks ?? '—'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fallback raw metadata for debugging */}
                {!selected.kind && <pre className="mt-3 text-xs text-neutral-500 bg-neutral-50 p-3 rounded overflow-auto">{JSON.stringify(selected.meta, null, 2)}</pre>}
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
