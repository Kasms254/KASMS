import React, { useMemo, useState, useEffect, useRef } from "react"
import * as LucideIcons from "lucide-react"
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import api from '../lib/api'

export default function NavBar({
  collapsed = false,
  onToggle = () => {},
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [notifsLoading, setNotifsLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const menuRef = useRef(null)
  const notifRef = useRef(null)

  // derive user from Auth context (no demo defaults)
  const auth = useAuth()
  const user = auth.user || null

  // derive a display name from fields returned by the backend
  const displayName = useMemo(() => {
    if (!user) return null
    // prefer serializer-provided full_name, then first+last, then username, then svc_number
    const full = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()
    if (full) return full
    if (user.username) return user.username
    if (user.svc_number) return user.svc_number
    return null
  }, [user])

  const initials = useMemo(() => {
    const name = displayName || ''
    if (!name) return 'U'
    return name
      .split(' ')
      .map((s) => s[0] || '')
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }, [displayName])

  // dropdown close
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false)
      if (e.key === "ArrowDown") setMenuOpen(true)
    }
    function onDocClick(e) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target)) setMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("click", onDocClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("click", onDocClick)
    }
  }, [])

  // fetch notifications when opening bell
  async function fetchNotifications() {
    // Admins don't receive notifications - they create them
    if (user && user.role === 'admin') {
      setNotifs([])
      setUnreadCount(0)
      setNotifsLoading(false)
      return
    }

    setNotifsLoading(true)
    try {
      // Combine user-scoped class notices with urgent/global notices so bell shows everything
      const promises = [
        api.getMyClassNotices(),
        api.getUrgentNotices(),
        // Also include active/global notices so admin-posted notices appear
        api.getActiveNotices(),
        // Include personal notifications (grade results) for students
        user && user.role === 'student' ? api.getUnreadPersonalNotifications() : Promise.resolve({ count: 0, results: [] }),
      ]

      const settled = await Promise.allSettled(promises)
  const classNoticesResp = settled[0]
  const urgentResp = settled[1]
  const activeResp = settled[2]
  const personalNotifsResp = settled[3]

  const classNotices = classNoticesResp.status === 'fulfilled' ? (Array.isArray(classNoticesResp.value) ? classNoticesResp.value : (classNoticesResp.value && Array.isArray(classNoticesResp.value.results) ? classNoticesResp.value.results : [])) : []
  const urgentNotices = urgentResp.status === 'fulfilled' ? (Array.isArray(urgentResp.value) ? urgentResp.value : (urgentResp.value && Array.isArray(urgentResp.value.results) ? urgentResp.value.results : [])) : []
  const activeNotices = activeResp.status === 'fulfilled' ? (Array.isArray(activeResp.value) ? activeResp.value : (activeResp.value && Array.isArray(activeResp.value.results) ? activeResp.value.results : [])) : []
  const personalNotifs = personalNotifsResp.status === 'fulfilled' ? (personalNotifsResp.value && Array.isArray(personalNotifsResp.value.results) ? personalNotifsResp.value.results : []) : []

  // Merge all notifications and remove duplicates by ID
  const allNotices = [...activeNotices, ...urgentNotices, ...classNotices]
  const seenIds = new Set()
  let merged = allNotices.filter(n => {
    if (!n || !n.id) return false
    const key = `${n.class_obj ? 'class' : 'notice'}-${n.id}`
    if (seenIds.has(key)) return false
    seenIds.add(key)
    return true
  })

  // Add personal notifications (grade results) to merged list
  const personalNotifsMapped = personalNotifs.map(pn => ({
    id: `personal-${pn.id}`,
    originalId: pn.id,
    title: pn.title,
    content: pn.content,
    created_at: pn.created_at,
    read: pn.is_read === true,
    noticeType: 'personal_notification',
    noticeId: pn.id,
    notification_type: pn.notification_type,
    priority: pn.priority,
    exam_details: pn.exam_details,
  }))
  merged = [...merged, ...personalNotifsMapped]

      // Filter out notifications created by the current user (so creators
      // don't receive their own notice in the bell). Account for serializers
      // that may return `created_by` as an id or as an object.
      if (user) {
        merged = merged.filter(n => {
          try {
            const cb = n.created_by
            const cbId = (cb && typeof cb === 'object') ? (cb.id || cb.pk || null) : cb
            if (cbId !== null && String(cbId) === String(user.id)) return false
          } catch {
            // ignore and keep the notification
          }
          return true
        })
      }

      // Use backend's is_read field if available, otherwise default to false
      // Also track notice type for proper API calls when marking as read
      // Use unique IDs to distinguish between regular notices and class notices
      const normalized = merged.map((n) => {
        const isClassNotice = !!n.class_obj
        return {
          ...(n || {}),
          id: isClassNotice ? `class-${n.id}` : `notice-${n.id}`,
          originalId: n.id, // Keep original ID for API calls
          read: n?.is_read === true,
          noticeType: isClassNotice ? 'class_notice' : 'notice',
          noticeId: n.id,
        }
      })

      // Removed old exam result notification conversion - now using ClassNotice only

      // Filter out expired notifications
      const now = new Date()
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(now.getDate() - 7)

      const filtered = normalized.filter(n => {
        // For exams, check if exam date has passed
        if (n.kind === 'exam' && n.exam_date) {
          const examDate = new Date(n.exam_date)
          return examDate >= now
        }
        // For notices with expiry date, check if still valid
        if ((n.kind === 'notice' || n.noticeType) && n.expiry_date) {
          const expiryDate = new Date(n.expiry_date)
          return expiryDate >= now
        }
        // For items without specific event dates, show if within 7 days of creation
        const createdDate = new Date(n.created_at || n.created || 0)
        return createdDate >= sevenDaysAgo
      })

      filtered.sort((a, b) => {
        const ta = new Date(a.created_at || a.created || 0).getTime()
        const tb = new Date(b.created_at || b.created || 0).getTime()
        return tb - ta
      })

      setNotifs(filtered)
      setUnreadCount(filtered.filter(x => !x.read).length)
    } catch {
      // Set empty notifications on error so UI doesn't break
      setNotifs([])
      setUnreadCount(0)
    } finally {
      setNotifsLoading(false)
    }
  }

  // Listen for client-side notice edit events so creators get a bell item
  useEffect(() => {
    function onNoticeEdited(e) {
      const payload = e && e.detail ? e.detail : null
      if (!payload) return
      // Build a small notification object and prepend it as unread
      const item = {
        id: payload.id || payload.pk || `notice-${Date.now()}`,
        title: payload.title || 'Notice updated',
        content: payload.content || 'A notice was updated',
        kind: 'notice',
        noticeId: payload.id || null,
        created_at: payload.updated_at || payload.created_at || new Date().toISOString(),
        read: false,
      }
      setNotifs((s) => [item, ...s])
      setUnreadCount((n) => n + 1)
    }

    window.addEventListener('notice:edited', onNoticeEdited)
    // When notices change (created/updated/deleted) elsewhere in the app,
    // re-fetch the notifications so the bell reflects the latest state.
    function onNoticesChanged() {
      try { fetchNotifications().catch(() => {}) } catch { /* ignore */ }
    }
    window.addEventListener('notices:changed', onNoticesChanged)
    return () => {
      window.removeEventListener('notice:edited', onNoticeEdited)
      window.removeEventListener('notices:changed', onNoticesChanged)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for notifications marked read elsewhere (Notifications page action)
  useEffect(() => {
    function onNotificationsMarkedRead(e) {
      try {
        const ids = e && e.detail && Array.isArray(e.detail.ids) ? e.detail.ids : []
        if (!ids.length) return

        setNotifs(prev => {
          // Match by both the prefixed ID and the originalId (raw backend ID)
          const next = prev.map(n => {
            const matchesPrefixedId = ids.includes(n.id)
            const matchesOriginalId = n.originalId && ids.includes(n.originalId)
            if (matchesPrefixedId || matchesOriginalId) {
              return { ...n, read: true }
            }
            return n
          })
          setUnreadCount(next.filter(x => !x.read).length)
          return next
        })
      } catch {
        // Ignore errors when updating notification state
      }
    }
    window.addEventListener('notifications:marked_read', onNotificationsMarkedRead)
    return () => window.removeEventListener('notifications:marked_read', onNotificationsMarkedRead)
  }, [])

  // Fetch notifications automatically when a user is available so the bell
  // shows a count without requiring the user to click it first.
  useEffect(() => {
    if (!user) return
    // Admins don't get notifications
    if (user.role === 'admin') return
    // Don't refetch if we already have notifications loaded
    if (notifs.length === 0) {
      fetchNotifications().catch(() => {
        // Silently ignore fetch errors
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Removed old exam result polling - grade notifications now come through ClassNotice only

  const navigate = useNavigate()

  return (
    <div className="
      flex items-center justify-between px-4 py-3
      bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl
      border-b border-neutral-200 shadow-sm
    ">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-3">
        {/* Mobile/Tablet toggle */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="
            p-2 rounded-md
            text-neutral-600 hover:bg-neutral-100
            lg:hidden transition
          "
        >
          <LucideIcons.Menu className="w-5 h-5" />
        </button>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Messages */}
        <button
          className="
            relative p-2 rounded-full 
            text-neutral-600 bg-white/80 backdrop-blur 
            border border-neutral-200 shadow-sm
            hover:bg-neutral-100 transition
          "
          aria-label="Messages"
        >
          <LucideIcons.MessageCircle className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
        <button
          className="
            relative p-2 rounded-full 
            text-neutral-600 bg-white/80 backdrop-blur 
            border border-neutral-200 shadow-sm
            hover:bg-neutral-100 transition
          "
          aria-label="Notifications"
          onClick={async () => {
            setNotifOpen((s) => {
              const next = !s
              if (next && notifs.length === 0) fetchNotifications()
              return next
            })
          }}
        >
          <LucideIcons.Bell className="w-5 h-5" />
          <span className="
            absolute -top-1 -right-1 w-4 h-4 
            flex items-center justify-center 
            bg-indigo-600 text-white text-[10px] 
            rounded-full
          ">
            {unreadCount || 0}
          </span>
        </button>
        {/* Notifications dropdown */}
        {notifOpen && (
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-neutral-200 rounded-xl shadow-lg py-2 z-50">
            <div className="px-3 py-2 text-sm font-medium text-neutral-700 border-b border-neutral-100 flex items-center justify-between">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{unreadCount} unread</span>
              )}
            </div>
            <div className="max-h-64 overflow-auto">
                {notifsLoading && <div className="p-3 text-sm text-neutral-500">Loading…</div>}
                {!notifsLoading && notifs.filter(n => !n.read).length === 0 && <div className="p-3 text-sm text-neutral-500">No notifications</div>}
                {!notifsLoading && notifs.filter(n => !n.read).map(n => {
                  const unread = !n.read
                  return (
                    <button
                      key={n.id}
                      className={`w-full text-left px-3 py-2 hover:bg-neutral-50 text-sm ${unread ? 'bg-indigo-50/50' : ''}`}
                      onClick={async () => {
                        // Close dropdown
                        setNotifOpen(false)
                        // Mark as read locally first for instant UI feedback
                        if (unread) {
                          setNotifs(prev => {
                            const updated = prev.map(x => (x.id === n.id ? { ...x, read: true } : x))
                            setUnreadCount(updated.filter(x => !x.read).length)
                            return updated
                          })
                          // Call backend to persist read status using originalId
                          const noticeId = n.originalId || n.noticeId || n.id
                          if (noticeId) {
                            try {
                              if (n.noticeType === 'personal_notification') {
                                await api.markPersonalNotificationAsRead(noticeId)
                              } else if (n.noticeType === 'class_notice') {
                                await api.markClassNoticeAsRead(noticeId)
                              } else {
                                await api.markNoticeAsRead(noticeId)
                              }

                              // Dispatch event to sync with Notifications page
                              try {
                                window.dispatchEvent(new CustomEvent('notices:changed'))
                              } catch {
                                // Ignore dispatch errors
                              }
                            } catch {
                              // Silently ignore 'not found' errors for deleted notices
                            }
                          }
                        }
                        // Navigate to notifications page
                        navigate('/list/notifications')
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {unread && <span className="w-2 h-2 mt-1.5 rounded-full bg-indigo-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${unread ? 'text-black' : 'text-neutral-500'}`}>{n.title}</div>
                          <div className={`text-xs truncate ${unread ? 'text-neutral-700' : 'text-neutral-500'}`}>{n.content}</div>
                          <div className={`text-[11px] mt-1 ${unread ? 'text-neutral-600' : 'text-neutral-400'}`}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
            {/* Mark all as read button */}
            {unreadCount > 0 && (
              <div className="px-3 py-2 border-t border-neutral-100">
                <button
                  onClick={async () => {
                    // Mark all as read locally
                    setNotifs(prev => prev.map(x => ({ ...x, read: true })))
                    setUnreadCount(0)

                    // Mark all as read on backend
                    const unreadNotifs = notifs.filter(n => !n.read)

                    // Batch mark personal notifications as read
                    const hasPersonalNotifs = unreadNotifs.some(n => n.noticeType === 'personal_notification')
                    if (hasPersonalNotifs) {
                      try {
                        await api.markAllPersonalNotificationsAsRead()
                      } catch {
                        // Silently ignore errors
                      }
                    }

                    for (const n of unreadNotifs) {
                      const noticeId = n.originalId || n.noticeId
                      if (!noticeId) continue
                      // Skip personal notifications since we already batch-marked them
                      if (n.noticeType === 'personal_notification') continue
                      try {
                        if (n.noticeType === 'class_notice') {
                          await api.markClassNoticeAsRead(noticeId)
                        } else {
                          await api.markNoticeAsRead(noticeId)
                        }
                      } catch {
                        // Silently ignore 'not found' errors for deleted notices
                      }
                    }

                    // Dispatch event to sync with Notifications page
                    try {
                      window.dispatchEvent(new CustomEvent('notices:changed'))
                    } catch {
                      // Ignore dispatch errors
                    }
                  }}
                  className="w-full text-center text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>
        )}
        </div>

        {/* USER MENU */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((s) => !s)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMenuOpen(false)
              if (["Enter", " "].includes(e.key)) setMenuOpen((s) => !s)
            }}
            className="
              flex items-center gap-3 rounded-full px-2 py-1
              bg-white/80 backdrop-blur border border-neutral-200 shadow-sm
              hover:bg-neutral-100 transition
            "
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <div className="
              w-8 h-8 rounded-full 
              bg-gradient-to-br from-indigo-500 to-pink-500 
              flex items-center justify-center 
              text-white font-semibold
            ">
              {initials}
            </div>

            <div className="hidden sm:flex flex-col text-left">
              <span className="text-sm font-medium text-neutral-800 leading-4">
                {displayName || 'Guest'}
              </span>
              <span className="text-xs text-neutral-500">{user?.role || 'visitor'}</span>
            </div>

            <LucideIcons.ChevronDown className="w-4 h-4 text-neutral-500 hidden sm:block" />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className="
                absolute right-0 mt-2 w-44 max-w-[calc(100vw-2rem)]
                bg-white border border-neutral-200
                rounded-xl shadow-lg overflow-hidden
                py-1 animate-in fade-in
                text-neutral-700
              "
              role="menu"
            >
              <button
                role="menuitem"
                className="w-full text-left px-4 py-2 hover:bg-neutral-100 text-sm"
              >
                Profile
              </button>
              <button
                role="menuitem"
                className="w-full text-left px-4 py-2 hover:bg-neutral-100 text-sm"
              >
                Settings
              </button>

              <div className="border-t border-neutral-200" />

              {user ? (
                <button
                  role="menuitem"
                  onClick={async () => {
                    await auth.logout()
                    setMenuOpen(false)
                    navigate('/', { replace: true })
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-neutral-100 text-sm"
                >
                  Logout
                </button>
              ) : (
                <div className="px-4 py-2 text-sm text-neutral-500">Not signed in</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
