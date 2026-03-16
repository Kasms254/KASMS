import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Video, Plus, Play, Square, X, Users, Clock, Calendar,
  Search, Loader2, PhoneOff, PhoneCall, Edit2, Trash2,
  Copy, CheckCircle, XCircle, Link2,
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import ConfirmModal from '../../components/ConfirmModal'
import ModernDateTimePicker from '../../components/ModernDateTimePicker'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  live: 'bg-green-100 text-green-700',
  ended: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  live: 'Live',
  ended: 'Ended',
  cancelled: 'Cancelled',
}

const EMPTY_FORM = {
  title: '',
  description: '',
  scheduled_start: '',
  scheduled_end: '',
  class_ids: [],
  provider: 'jitsi',
  max_participants: 25,
  is_recorded: false,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function toISOString(localInput) {
  if (!localInput) return ''
  return new Date(localInput).toISOString()
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Meetings() {
  const { user } = useAuth()
  const toast = useToast()

  const isStudent = user?.role === 'student'
  const canCreate = ['instructor', 'admin', 'commandant', 'superadmin'].includes(user?.role)
  const isAdminLike = ['admin', 'commandant', 'superadmin'].includes(user?.role)

  // Meetings list state
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Classes for the form
  const [classes, setClasses] = useState([])

  // Modal states
  const [showCreate, setShowCreate] = useState(false)
  const [editMeeting, setEditMeeting] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, meeting: null, title: '', message: '' })

  // Join-with-token panel
  const [showJoinPanel, setShowJoinPanel] = useState(false)
  const [joinToken, setJoinToken] = useState('')
  const [joiningLoading, setJoiningLoading] = useState(false)

  // Active Jitsi room
  const [activeRoom, setActiveRoom] = useState(null)

  // Per-meeting action loading: { [meetingId]: 'starting' | 'ending' | 'cancelling' | null }
  const [actionLoading, setActionLoading] = useState({})

  // Create / edit form
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [formLoading, setFormLoading] = useState(false)

  // Copy link feedback
  const [copiedId, setCopiedId] = useState(null)

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadMeetings = useCallback(async () => {
    setLoading(true)
    try {
      let data
      if (isStudent) {
        data = await api.getUpcomingMeetings()
      } else {
        const params = filter !== 'all' ? `status=${filter}` : ''
        data = await api.getMeetings(params)
      }
      let list = Array.isArray(data) ? data : (data?.results || [])
      // Client-side status filter for non-student roles (already filtered via params but keep in sync)
      if (filter !== 'all' && !isStudent) {
        list = list.filter(m => m.status === filter)
      }
      setMeetings(list)
    } catch (err) {
      toast.error(err.message || 'Failed to load meetings')
    } finally {
      setLoading(false)
    }
  }, [filter, isStudent, toast])

  useEffect(() => { loadMeetings() }, [loadMeetings])

  useEffect(() => {
    if (!canCreate) return
    async function loadClasses() {
      try {
        const data = isAdminLike ? await api.getAllClasses() : await api.getMyClasses()
        setClasses(Array.isArray(data) ? data : (data?.results || []))
      } catch { /* silent */ }
    }
    loadClasses()
  }, [canCreate, isAdminLike])

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = meetings.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.title?.toLowerCase().includes(q) ||
      m.meeting_code?.toLowerCase().includes(q) ||
      m.class_names?.some(c => c.toLowerCase().includes(q))
    )
  })

  // ── Permission helpers ────────────────────────────────────────────────────

  function canManage(meeting) {
    if (isAdminLike) return true
    return String(meeting.created_by) === String(user?.id)
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }))
  }

  function toggleClass(classId) {
    setForm(prev => {
      const ids = prev.class_ids.includes(classId)
        ? prev.class_ids.filter(id => id !== classId)
        : [...prev.class_ids, classId]
      return { ...prev, class_ids: ids }
    })
    if (formErrors.class_ids) setFormErrors(prev => ({ ...prev, class_ids: null }))
  }

  function handleStartChange(val) {
    setForm(prev => ({ ...prev, scheduled_start: val }))
    if (formErrors.scheduled_start) setFormErrors(prev => ({ ...prev, scheduled_start: null }))
  }

  function handleEndChange(val) {
    setForm(prev => ({ ...prev, scheduled_end: val }))
    if (formErrors.scheduled_end) setFormErrors(prev => ({ ...prev, scheduled_end: null }))
  }

  function validateForm(isEdit = false) {
    const errors = {}
    if (!form.title.trim()) errors.title = 'Title is required'
    if (!form.scheduled_start) {
      errors.scheduled_start = 'Start time is required'
    } else if (new Date(form.scheduled_start) <= new Date()) {
      errors.scheduled_start = 'Start time must be in the future'
    }
    if (!form.scheduled_end) {
      errors.scheduled_end = 'End time is required'
    } else if (form.scheduled_start && new Date(form.scheduled_end) <= new Date(form.scheduled_start)) {
      errors.scheduled_end = 'End time must be after start time'
    }
    if (!isEdit && form.class_ids.length === 0) errors.class_ids = 'Select at least one class'
    return errors
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormErrors({})
    setShowCreate(true)
  }

  function openEdit(meeting) {
    setForm({
      title: meeting.title || '',
      description: meeting.description || '',
      scheduled_start: toLocalInput(meeting.scheduled_start),
      scheduled_end: toLocalInput(meeting.scheduled_end),
      class_ids: [],
      provider: meeting.provider || 'jitsi',
      max_participants: meeting.max_participants || 25,
      is_recorded: meeting.is_recorded || false,
    })
    setFormErrors({})
    setEditMeeting(meeting)
  }

  function closeForm() {
    setShowCreate(false)
    setEditMeeting(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
  }

  // ── CRUD actions ──────────────────────────────────────────────────────────

  async function handleCreate(e) {
    e.preventDefault()
    const errors = validateForm(false)
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormLoading(true)
    try {
      await api.createMeeting({
        ...form,
        scheduled_start: toISOString(form.scheduled_start),
        scheduled_end: toISOString(form.scheduled_end),
      })
      toast.success('Meeting scheduled successfully')
      closeForm()
      loadMeetings()
    } catch (err) {
      if (err.data) setFormErrors(err.data)
      toast.error(err.message || 'Failed to create meeting')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleUpdate(e) {
    e.preventDefault()
    const errors = validateForm(true)
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormLoading(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        scheduled_start: toISOString(form.scheduled_start),
        scheduled_end: toISOString(form.scheduled_end),
        max_participants: form.max_participants,
        is_recorded: form.is_recorded,
      }
      if (form.class_ids.length > 0) payload.class_ids = form.class_ids
      await api.updateMeeting(editMeeting.id, payload)
      toast.success('Meeting updated')
      closeForm()
      loadMeetings()
    } catch (err) {
      if (err.data) setFormErrors(err.data)
      toast.error(err.message || 'Failed to update meeting')
    } finally {
      setFormLoading(false)
    }
  }

  // ── Meeting lifecycle actions ──────────────────────────────────────────────

  async function handleStart(meeting) {
    setActionLoading(prev => ({ ...prev, [meeting.id]: 'starting' }))
    try {
      const detail = await api.startMeeting(meeting.id)
      toast.success('Meeting started')
      loadMeetings()
      // Auto-join host after starting
      if (detail?.join_token) {
        const joinData = await api.joinMeeting(detail.join_token)
        setActiveRoom({
          meeting: joinData.meeting,
          videoConfig: joinData.video_config,
        })
      }
    } catch (err) {
      toast.error(err.message || 'Failed to start meeting')
    } finally {
      setActionLoading(prev => ({ ...prev, [meeting.id]: null }))
    }
  }

  async function confirmEnd(meeting) {
    setConfirmModal({
      open: true, action: 'end', meeting,
      title: 'End Meeting',
      message: `End "${meeting.title}"? All participants will be disconnected.`,
    })
  }

  async function confirmCancel(meeting) {
    setConfirmModal({
      open: true, action: 'cancel', meeting,
      title: 'Cancel Meeting',
      message: `Cancel "${meeting.title}"? This cannot be undone.`,
    })
  }

  async function confirmDelete(meeting) {
    setConfirmModal({
      open: true, action: 'delete', meeting,
      title: 'Delete Meeting',
      message: `Permanently delete "${meeting.title}"?`,
    })
  }

  async function handleConfirmAction() {
    const { action, meeting } = confirmModal
    setConfirmModal(prev => ({ ...prev, open: false }))
    setActionLoading(prev => ({ ...prev, [meeting.id]: action }))
    try {
      if (action === 'end') {
        await api.endMeeting(meeting.id)
        toast.success('Meeting ended')
        if (activeRoom?.meeting?.id === meeting.id) setActiveRoom(null)
      } else if (action === 'cancel') {
        await api.cancelMeeting(meeting.id)
        toast.success('Meeting cancelled')
      } else if (action === 'delete') {
        await api.deleteMeeting(meeting.id)
        toast.success('Meeting deleted')
      }
      loadMeetings()
    } catch (err) {
      toast.error(err.message || `Failed to ${action} meeting`)
    } finally {
      setActionLoading(prev => ({ ...prev, [meeting.id]: null }))
    }
  }

  // ── Join / Leave ──────────────────────────────────────────────────────────

  async function handleJoinMeeting(meeting) {
    setActionLoading(prev => ({ ...prev, [meeting.id]: 'joining' }))
    try {
      let joinData
      if (isStudent) {
        // Students are authorized by enrollment — join directly with the meeting code
        joinData = await api.joinMeetingByCode(meeting.meeting_code)
      } else {
        // Hosts/admins use the secret join_token fetched from detail
        const detail = await api.getMeeting(meeting.id)
        if (!detail?.join_token) {
          toast.error('Join token not available.')
          return
        }
        joinData = await api.joinMeeting(detail.join_token)
      }
      setActiveRoom({ meeting: joinData.meeting, videoConfig: joinData.video_config })
    } catch (err) {
      toast.error(err.message || 'Failed to join meeting')
    } finally {
      setActionLoading(prev => ({ ...prev, [meeting.id]: null }))
    }
  }

  async function handleJoinWithToken() {
    if (!joinToken.trim()) return
    setJoiningLoading(true)
    try {
      const joinData = await api.joinMeeting(joinToken.trim())
      setActiveRoom({ meeting: joinData.meeting, videoConfig: joinData.video_config })
      setShowJoinPanel(false)
      setJoinToken('')
    } catch (err) {
      const msg = (() => {
        switch (err.status) {
          case 404:
            return 'Invalid join token. Double-check the link or ask the host for a new one.'
          case 403:
            return err.message || 'You are not authorised to join this meeting. Make sure you are enrolled in one of its classes.'
          case 400:
            // Backend returns "Meeting is <status> and cannot be joined."
            return err.message || 'This meeting cannot be joined right now.'
          default:
            return err.message || 'Failed to join meeting. Please try again.'
        }
      })()
      toast.error(msg)
    } finally {
      setJoiningLoading(false)
    }
  }

  async function handleLeaveRoom() {
    if (!activeRoom) return
    try { await api.leaveMeeting(activeRoom.meeting.id) } catch { /* silent */ }
    setActiveRoom(null)
    loadMeetings()
  }

  async function handleEndFromRoom() {
    if (!activeRoom) return
    confirmEnd(activeRoom.meeting)
  }

  // ── Copy join link ─────────────────────────────────────────────────────────

  async function copyJoinLink(meeting) {
    const token = meeting.join_token
    if (!token) { toast.error('Join token not visible — only the host can share this link.'); return }
    const link = `${window.location.origin}/list/meetings?join=${token}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(meeting.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  // ── Auto-join from URL token ───────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('join')
    if (urlToken) {
      setJoinToken(urlToken)
      setShowJoinPanel(true)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-black">Meetings</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Virtual video meetings and lectures</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowJoinPanel(s => !s); setJoinToken('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
          >
            <Link2 className="w-4 h-4" />
            Join with token
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" />
              Schedule meeting
            </button>
          )}
        </div>
      </div>

      {/* Join-with-token panel */}
      {showJoinPanel && (
        <div className="flex gap-2 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <input
            type="text"
            value={joinToken}
            onChange={e => setJoinToken(e.target.value)}
            placeholder="Paste your join token here…"
            className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
            onKeyDown={e => e.key === 'Enter' && handleJoinWithToken()}
          />
          <button
            onClick={handleJoinWithToken}
            disabled={joiningLoading || !joinToken.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {joiningLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
            Join
          </button>
        </div>
      )}

      {/* Filters (hidden for students – they always see upcoming) */}
      {!isStudent && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 flex-wrap">
            {['all', 'scheduled', 'live', 'ended', 'cancelled'].map(tab => (
              <button
                key={tab}
                onClick={() => { setFilter(tab); setSearch('') }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  filter === tab
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                {tab === 'all' ? 'All' : STATUS_LABELS[tab] || tab}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search meetings…"
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
          <Video className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium text-neutral-500">No meetings found</p>
          <p className="text-sm mt-1">
            {canCreate
              ? 'Schedule your first meeting using the button above.'
              : 'No meetings available right now. Check back later.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(meeting => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              canManage={canManage(meeting)}
              canCreate={canCreate}
              actionLoading={actionLoading[meeting.id]}
              copiedId={copiedId}
              onStart={() => handleStart(meeting)}
              onEnd={() => confirmEnd(meeting)}
              onCancel={() => confirmCancel(meeting)}
              onDelete={() => confirmDelete(meeting)}
              onEdit={() => openEdit(meeting)}
              onJoin={() => handleJoinMeeting(meeting)}
              onCopyLink={() => copyJoinLink(meeting)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(showCreate || editMeeting) && (
        <MeetingFormModal
          title={editMeeting ? 'Edit Meeting' : 'Schedule Meeting'}
          form={form}
          errors={formErrors}
          loading={formLoading}
          classes={classes}
          isEdit={!!editMeeting}
          onChange={handleFormChange}
          onStartChange={handleStartChange}
          onEndChange={handleEndChange}
          onToggleClass={toggleClass}
          onSubmit={editMeeting ? handleUpdate : handleCreate}
          onClose={closeForm}
        />
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={
          confirmModal.action === 'end' ? 'End Meeting'
          : confirmModal.action === 'cancel' ? 'Cancel Meeting'
          : 'Delete'
        }
        confirmVariant="danger"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal(prev => ({ ...prev, open: false }))}
      />

      {/* Jitsi Room — full-screen portal */}
      {activeRoom && createPortal(
        <JitsiRoomOverlay
          roomName={activeRoom.videoConfig.room_name}
          domain={activeRoom.videoConfig.domain}
          jwt={activeRoom.videoConfig.jwt}
          displayName={activeRoom.videoConfig.display_name}
          email={activeRoom.videoConfig.user_email}
          isHost={activeRoom.videoConfig.is_host}
          meeting={activeRoom.meeting}
          canEnd={canManage(activeRoom.meeting)}
          onLeave={handleLeaveRoom}
          onEnd={handleEndFromRoom}
        />,
        document.body
      )}
    </div>
  )
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────

function MeetingCard({
  meeting, canManage, canCreate, actionLoading, copiedId,
  onStart, onEnd, onCancel, onDelete, onEdit, onJoin, onCopyLink,
}) {
  const isLive = meeting.status === 'live'
  const isScheduled = meeting.status === 'scheduled'
  const isEnded = meeting.status === 'ended'
  const isCancelled = meeting.status === 'cancelled'

  return (
    <div className={`bg-white rounded-xl border flex flex-col gap-3 p-4 shadow-sm hover:shadow-md transition-shadow ${
      isLive ? 'border-green-200 ring-1 ring-green-100' : 'border-neutral-200'
    }`}>

      {/* Status + title */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[meeting.status] || 'bg-gray-100 text-gray-600'}`}>
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
              {STATUS_LABELS[meeting.status] || meeting.status}
            </span>
          </div>
          <h3 className="font-semibold text-black leading-tight truncate">{meeting.title}</h3>
          {meeting.description && (
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{meeting.description}</p>
          )}
        </div>
        {canManage && !isEnded && !isCancelled && (
          <button
            onClick={onEdit}
            className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition flex-shrink-0"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1 text-xs text-neutral-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{formatDateTime(meeting.scheduled_start)}</span>
        </div>
        {meeting.scheduled_end && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Until {formatDateTime(meeting.scheduled_end)}</span>
          </div>
        )}
        {meeting.class_names?.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{meeting.class_names.join(', ')}</span>
          </div>
        )}
        {typeof meeting.participant_count === 'number' && (
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{meeting.participant_count} participant{meeting.participant_count !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Code + provider */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
          {meeting.meeting_code}
        </span>
        <span className="text-xs text-neutral-400 capitalize">{meeting.provider || 'jitsi'}</span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-neutral-100">
        {/* Start (host, scheduled) */}
        {canManage && isScheduled && (
          <button
            onClick={onStart}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {actionLoading === 'starting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Start
          </button>
        )}

        {/* Join (live meeting — all roles) */}
        {isLive && (
          <button
            onClick={onJoin}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {actionLoading === 'joining' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
            Join
          </button>
        )}

        {/* Copy join link (host, live or scheduled) */}
        {canManage && (isLive || isScheduled) && meeting.join_token && (
          <button
            onClick={onCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
          >
            {copiedId === meeting.id
              ? <><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Copied!</>
              : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
          </button>
        )}

        {/* End (host, live) */}
        {canManage && isLive && (
          <button
            onClick={onEnd}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {actionLoading === 'ending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
            End
          </button>
        )}

        {/* Cancel (host, scheduled) */}
        {canManage && isScheduled && (
          <button
            onClick={onCancel}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-60 transition ml-auto"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}

        {/* Delete (host, ended/cancelled) */}
        {canManage && (isEnded || isCancelled) && (
          <button
            onClick={onDelete}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 transition ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Meeting Form Modal ───────────────────────────────────────────────────────

function MeetingFormModal({ title, form, errors, loading, classes, isEdit, onChange, onStartChange, onEndChange, onToggleClass, onSubmit, onClose }) {
  const nowMin = (() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl ring-1 ring-black/5">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-lg font-semibold text-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 p-1.5 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={onChange}
              placeholder="e.g. Tactics Lecture 1"
              className={`w-full border rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                errors.title ? 'border-red-300 focus:ring-red-200' : 'border-neutral-200'
              }`}
            />
            {errors.title && <p className="text-rose-600 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={onChange}
              rows={2}
              placeholder="Optional description…"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
            />
          </div>

          {/* Start / End */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Start <span className="text-red-500">*</span>
              </label>
              <ModernDateTimePicker
                value={form.scheduled_start}
                onChange={onStartChange}
                placeholder="Select start date & time"
                min={nowMin}
              />
              {errors.scheduled_start && <p className="text-rose-600 text-xs mt-1">{errors.scheduled_start}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                End <span className="text-red-500">*</span>
              </label>
              <ModernDateTimePicker
                value={form.scheduled_end}
                onChange={onEndChange}
                placeholder="Select end date & time"
                min={form.scheduled_start || nowMin}
              />
              {errors.scheduled_end && <p className="text-rose-600 text-xs mt-1">{errors.scheduled_end}</p>}
            </div>
          </div>

          {/* Classes */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Classes {!isEdit && <span className="text-red-500">*</span>}
              {isEdit && <span className="text-xs font-normal text-neutral-400 ml-1">(select to update)</span>}
            </label>
            <div className={`border rounded-lg p-2 max-h-36 overflow-y-auto flex flex-wrap gap-1.5 ${
              errors.class_ids ? 'border-red-300' : 'border-neutral-200'
            }`}>
              {classes.length === 0 ? (
                <p className="text-xs text-neutral-400 p-1">No classes available</p>
              ) : (
                classes.map(cls => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => onToggleClass(cls.id)}
                    className={`px-2.5 py-1 rounded-full text-xs transition ${
                      form.class_ids.includes(cls.id)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {cls.name}
                  </button>
                ))
              )}
            </div>
            {errors.class_ids && <p className="text-rose-600 text-xs mt-1">{errors.class_ids}</p>}
          </div>

          {/* Max participants + Record toggle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Max Participants</label>
              <input
                type="number"
                name="max_participants"
                value={form.max_participants}
                onChange={onChange}
                min={2}
                max={25}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <p className="text-xs text-neutral-400 mt-1">Max 25 (JaaS free plan)</p>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="is_recorded"
                  checked={form.is_recorded}
                  onChange={onChange}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="text-sm text-neutral-700">Record meeting</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Jitsi Room Full-Screen Overlay ──────────────────────────────────────────

function JitsiRoomOverlay({ roomName, domain, jwt, displayName, email, isHost, meeting, canEnd, onLeave, onEnd }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)

  useEffect(() => {
    const scriptId = '__jaas_external_api__'
    function initApi() {
      if (!containerRef.current) return
      const api = new window.JitsiMeetExternalAPI(domain || '8x8.vc', {
        roomName,
        jwt: jwt || undefined,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        userInfo: {
          displayName: displayName || 'Participant',
          email: email || '',
        },
        configOverwrite: {
          startWithAudioMuted: !isHost,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          enableWelcomePage: false,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'desktop', 'chat',
            'raisehand', 'tileview', 'participants-pane', 'fullscreen',
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
        },
      })
      api.addEventListeners({ readyToClose: onLeave })
      apiRef.current = api
    }

    if (window.JitsiMeetExternalAPI) {
      initApi()
    } else if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `https://${domain || '8x8.vc'}/libs/external_api.min.js`
      script.async = true
      script.onload = initApi
      document.head.appendChild(script)
    } else {
      // Script tag exists but not loaded yet — wait for it
      const existing = document.getElementById(scriptId)
      existing.addEventListener('load', initApi, { once: true })
    }

    return () => {
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch { /* ignore */ }
        apiRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLeave() {
    if (apiRef.current) {
      try { apiRef.current.executeCommand('hangup') } catch { /* ignore */ }
    }
    onLeave()
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Video className="w-5 h-5 text-green-400" />
          <span className="font-medium text-sm truncate max-w-xs">{meeting.title}</span>
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">LIVE</span>
          {meeting.meeting_code && (
            <span className="text-xs font-mono bg-gray-700 text-gray-300 px-2 py-0.5 rounded hidden sm:inline">
              {meeting.meeting_code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEnd && (
            <button
              onClick={onEnd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition"
            >
              <Square className="w-3.5 h-3.5" />
              End for all
            </button>
          )}
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-700 text-white hover:bg-gray-600 transition"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            Leave
          </button>
        </div>
      </div>

      {/* Jitsi iframe container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
