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
    setNotifsLoading(true)
    try {
      // Combine user-scoped class notices with urgent/global notices so bell shows everything
      const [classNoticesResp, urgentResp] = await Promise.allSettled([
        api.getMyClassNotices(),
        api.getUrgentNotices(),
      ])

      const classNotices = classNoticesResp.status === 'fulfilled' ? (Array.isArray(classNoticesResp.value) ? classNoticesResp.value : (classNoticesResp.value && Array.isArray(classNoticesResp.value.results) ? classNoticesResp.value.results : [])) : []
      const urgentNotices = urgentResp.status === 'fulfilled' ? (Array.isArray(urgentResp.value) ? urgentResp.value : (urgentResp.value && Array.isArray(urgentResp.value.results) ? urgentResp.value.results : [])) : []

      // Merge and sort by created_at (newest first)
      let merged = [...urgentNotices, ...classNotices]

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

      const normalized = merged.map((n) => ({ ...(n || {}), read: n && n.read ? true : false }))
      normalized.sort((a, b) => {
        const ta = new Date(a.created_at || a.created || 0).getTime()
        const tb = new Date(b.created_at || b.created || 0).getTime()
        return tb - ta
      })

      setNotifs(normalized)
      setUnreadCount(normalized.filter(x => !x.read).length)
    } catch (err) {
      console.debug('failed to load notifications', err)
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
    return () => window.removeEventListener('notice:edited', onNoticeEdited)
  }, [user])

  // Fetch notifications automatically when a user is available so the bell
  // shows a count without requiring the user to click it first.
  useEffect(() => {
    if (!user) return
    // Don't refetch if we already have notifications loaded
    if (notifs.length === 0) {
      fetchNotifications().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const navigate = useNavigate()

  return (
    <div className="
      flex items-center justify-between px-4 py-3
      bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl
      border-b border-neutral-200 shadow-sm
    ">
      {/* LEFT SIDE */}
      <div className="flex items-center gap-3">
        {/* Mobile toggle */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="
            p-2 rounded-md 
            text-neutral-600 hover:bg-neutral-100 
            md:hidden transition
          "
        >
          <LucideIcons.Menu className="w-5 h-5" />
        </button>

        {/* SEARCH */}
        <div className="
          hidden sm:flex items-center gap-2 
          bg-white/80 backdrop-blur 
          border border-neutral-200 
          rounded-full px-3 py-1.5
          shadow-sm
          hover:border-neutral-300 transition
        ">
          <LucideIcons.Search className="w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Search..."
            className="
              w-56 bg-transparent outline-none text-sm 
              placeholder:text-neutral-400 text-neutral-700
            "
          />
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-3">
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
          <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-lg py-2 z-50">
            <div className="px-3 py-2 text-sm font-medium text-neutral-700 border-b border-neutral-100">Notifications</div>
            <div className="max-h-64 overflow-auto">
              {notifsLoading && <div className="p-3 text-sm text-neutral-500">Loading…</div>}
              {!notifsLoading && notifs.length === 0 && <div className="p-3 text-sm text-neutral-500">No notifications</div>}
              {!notifsLoading && notifs.map(n => (
                <button
                  key={n.id}
                  className={`w-full text-left px-3 py-2 hover:bg-neutral-50 text-sm ${!n.read ? 'bg-neutral-50' : ''}`}
                  onClick={() => {
                    // mark this notification as read locally
                    setNotifs(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)))
                    setUnreadCount(prev => Math.max(0, prev - (n.read ? 0 : 1)))
                    // Optionally navigate to a relevant page; here we navigate to notices list if this is a notice
                    if (n.noticeId) {
                      try { navigate('/list/notices') } catch (err) { console.debug('nav error', err) }
                    }
                  }}
                >
                  <div className="font-medium text-neutral-800">{n.title}</div>
                  <div className="text-xs text-neutral-500 truncate">{n.content}</div>
                  <div className="text-[11px] text-neutral-400 mt-1">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                </button>
              ))}
            </div>
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

            <div className="hidden md:flex flex-col text-left">
              <span className="text-sm font-medium text-neutral-800 leading-4">
                {displayName || 'Guest'}
              </span>
              <span className="text-xs text-neutral-500">{user?.role || 'visitor'}</span>
            </div>

            <LucideIcons.ChevronDown className="w-4 h-4 text-neutral-500 hidden md:block" />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className="
                absolute right-0 mt-2 w-44 
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
                  onClick={() => {
                    auth.logout()
                    setMenuOpen(false)
                    navigate('/')
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
