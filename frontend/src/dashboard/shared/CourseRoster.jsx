import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import * as LucideIcons from 'lucide-react'
import * as api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import useTheme from '../../hooks/useTheme'
import useToast from '../../hooks/useToast'

/* ── Constants ─────────────────────────────────────────── */

const PAD_SUBJECTS = [
  { key: 'leadership_and_command_skills', label: 'Leadership & Command Skills' },
  { key: 'instructional_ability',         label: 'Instructional Ability' },
  { key: 'attitude',                      label: 'Attitude' },
  { key: 'initiative',                    label: 'Initiative' },
  { key: 'power_of_expression',           label: 'Power of Expression' },
  { key: 'ability_to_grasp_instructions', label: 'Ability to Grasp Instructions' },
  { key: 'industry',                      label: 'Industry' },
  { key: 'motivation',                    label: 'Motivation' },
  { key: 'co_operation',                  label: 'Co-operation' },
]

const DEPLOYMENT_OPTIONS = [
  'Strongly recommended for Classroom-based Instructional roles',
  'Not recommended at this time,requires further development',
]

const INSTRUCTOR_FIELDS_DEFAULT = {
  character_and_personality: '',
  knowledge_and_ability: '',
  command_and_leadership: '',
  strengths: '',
  weaknesses: '',
  deployment_recommendation: '',
}

const STATUS_ORDER = [
  'instructor_draft', 'instructor_submitted',
  'oic_draft', 'oic_submitted',
  'ci_draft', 'ci_submitted',
  'commandant_draft', 'approved',
]

const STAGE_LABEL = {
  instructor:       'Instructor',
  oic:              'Officer in Charge',
  chief_instructor: 'Chief Instructor',
  commandant:       'Commandant',
}

/* ── Status helpers ─────────────────────────────────────── */

function rosterStatus(status) {
  if (status === 'approved') return 'signed'
  if (status === 'instructor_draft') return 'draft'
  return 'awaiting'
}

const PIPELINE = [
  { label: 'Instructor',  draft: 'instructor_draft', submitted: 'instructor_submitted' },
  { label: 'OIC',         draft: 'oic_draft',        submitted: 'oic_submitted'        },
  { label: 'CI',          draft: 'ci_draft',         submitted: 'ci_submitted'         },
  { label: 'Commandant',  draft: 'commandant_draft', submitted: 'approved'             },
]

/* ── Small display components ───────────────────────────── */

function Avatar({ first = '', last = '', size = 'md', photoUrl = null }) {
  const letters = `${first[0] || ''}${last[0] || ''}`.toUpperCase() || '?'
  const cls = size === 'xl'
    ? 'w-24 h-24 text-3xl font-bold'
    : size === 'lg'
      ? 'w-14 h-14 text-xl font-bold'
      : size === 'sm'
        ? 'w-8 h-8 text-xs font-semibold'
        : 'w-10 h-10 text-sm font-semibold'
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${first} ${last}`.trim() || 'Student photo'}
        className={`${cls} rounded-full object-cover flex-shrink-0 border border-neutral-200`}
      />
    )
  }
  return (
    <div className={`${cls} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0`}>
      {letters}
    </div>
  )
}

function RosterBadge({ status }) {
  if (status === 'signed') return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-100 px-2 py-0.5 rounded-full">SIGNED</span>
  )
  if (status === 'awaiting') return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">AWAITING REVIEW</span>
  )
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">DRAFT</span>
  )
}

function StatusChip({ label, value, valueColor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{label}</span>
      <span className={`text-xs font-semibold ${valueColor}`}>{value}</span>
    </div>
  )
}

function GradeChip({ grade }) {
  const color = grade === 'F'
    ? 'text-red-700'
    : grade?.startsWith('A') ? 'text-green-700'
    : grade?.startsWith('B') ? 'text-blue-700'
    : 'text-neutral-700'
  return <span className={`font-semibold ${color}`}>{grade || '—'}</span>
}

function formatWordCase(value) {
  if (!value) return '—'
  return String(value)
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatStudentName(student = {}) {
  return `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'
}

/* ── Left panel: CLASS ROSTER ───────────────────────────── */

const PAGE_SIZE = 10

function RosterSidebar({ reports, selectedId, onSelect, loading }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage]     = useState(1)

  const filtered = reports.filter(r => {
    const name = `${r.student?.first_name || ''} ${r.student?.last_name || ''}`.toLowerCase()
    const svc = (r.student?.svc_number || '').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) || svc.includes(search.toLowerCase())
    const rs = rosterStatus(r.status)
    const matchFilter = filter === 'all' || rs === filter
    return matchSearch && matchFilter
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const signedCount   = reports.filter(r => rosterStatus(r.status) === 'signed').length
  const awaitingCount = reports.filter(r => rosterStatus(r.status) === 'awaiting').length
  const draftCount    = reports.filter(r => rosterStatus(r.status) === 'draft').length

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-100">
        <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Class Students</p>
        <div className="flex items-center gap-3 text-xs font-medium flex-wrap">
          <span className="text-green-700">{signedCount} signed</span>
          <span className="text-amber-600">{awaitingCount} awaiting</span>
          <span className="text-neutral-500">{draftCount} in draft</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <LucideIcons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search name or rank..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-7 pr-2 py-1.5 text-xs text-black border border-neutral-200 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex px-3 gap-1 pb-2 flex-wrap">
        {[
          { key: 'all',      label: 'All' },
          { key: 'draft',    label: 'Draft' },
          { key: 'awaiting', label: 'Awaiting' },
          { key: 'signed',   label: 'Signed' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setFilter(t.key); setPage(1) }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition focus:outline-none ${
              filter === t.key
                ? 'bg-indigo-600 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Student list — paginated, no empty scroll area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <LucideIcons.RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        ) : pageItems.length === 0 ? (
          <div className="text-center py-10 text-xs text-neutral-400">No students match</div>
        ) : (
          pageItems.map((r) => {
            const firstName  = r.student?.first_name || ''
            const lastName   = r.student?.last_name  || ''
            const name       = `${firstName} ${lastName}`.trim()
            const rank       = formatWordCase(r.student?.rank)
            const position   = reports.indexOf(r) + 1
            const rs         = rosterStatus(r.status)
            const isSelected = r.id === selectedId
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`w-full text-left border-b border-neutral-100 transition focus:outline-none ${
                  isSelected
                    ? 'bg-indigo-50 border-l-[3px] border-l-indigo-500'
                    : 'hover:bg-neutral-50 border-l-[3px] border-l-transparent'
                }`}
              >
                <div className="px-3 py-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar first={r.student?.first_name} last={r.student?.last_name} size="sm" photoUrl={r.photo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-black'}`}>
                          {rank !== '—' ? `${rank} ` : ''}{name || '—'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                        <span className="font-mono truncate">{r.student?.svc_number || '—'}</span>
                        <span>·</span>
                        <span className="capitalize truncate">{rs.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <RosterBadge status={rs} />
                      <span className="text-[10px] text-neutral-400">#{position}</span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
        </div>{/* end scrollable list */}

        {/* Pagination — pinned at bottom, only shown when needed */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t border-neutral-200 bg-white">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <LucideIcons.ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-neutral-500">
              Page <span className="font-semibold text-black">{safePage}</span> / {totalPages}
              <span className="ml-1 text-neutral-400">({filtered.length} total)</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <LucideIcons.ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>{/* end flex-1 flex-col */}
    </aside>
  )
}

/* ── Right panel: REPORT FORM ───────────────────────────── */

function ReportPanel({ reportId, user, onReportChange }) {
  const toast = useToast()
  const { theme } = useTheme()
  const isInstructor = user?.role === 'instructor'
  const myStageKey = { instructor: 'instructor', oic: 'oic', chief_instructor: 'chief_instructor', commandant: 'commandant' }[user?.role]

  const [report, setReport]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [instructorFields, setIF]     = useState(INSTRUCTOR_FIELDS_DEFAULT)
  const [padScores, setPadScores]     = useState({})
  const [remarkContent, setContent]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [advancing, setAdvancing]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [photoBusy, setPhotoBusy]     = useState(false)
  const photoInputRef = useRef(null)

  const loadReport = useCallback(async () => {
    if (!reportId) return
    setLoading(true)
    try {
      const data = await api.getCourseReportDetail(reportId)
      setReport(data)
      if (myStageKey && data.can_edit) {
        const existing = (data.visible_remarks || []).find(r => r.stage === myStageKey)
        if (existing) {
          if (myStageKey === 'instructor') {
            setIF({
              character_and_personality: existing.character_and_personality || '',
              knowledge_and_ability:     existing.knowledge_and_ability     || '',
              command_and_leadership:    existing.command_and_leadership    || '',
              strengths:                 existing.strengths                 || '',
              weaknesses:                existing.weaknesses                || '',
              deployment_recommendation: existing.deployment_recommendation || '',
            })
            setPadScores(existing.pad_scores || {})
          } else {
            setContent(existing.content || '')
          }
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [reportId, myStageKey, toast])

  useEffect(() => { loadReport() }, [loadReport])

  function buildPayload() {
    if (isInstructor) return { ...instructorFields, pad_scores: padScores }
    return { content: remarkContent }
  }

  function validate() {
    if (isInstructor) {
      const required = ['character_and_personality','knowledge_and_ability','command_and_leadership','strengths','weaknesses']
      for (const k of required) {
        if ((instructorFields[k] || '').trim().length < 5) {
          toast.error(`"${k.replace(/_/g,' ')}" needs at least 5 characters`)
          return false
        }
      }
      if (!instructorFields.deployment_recommendation) {
        toast.error('Please select a deployment recommendation')
        return false
      }
      return true
    }
    if (remarkContent.trim().length < 10) { toast.error('Remark must be at least 10 characters'); return false }
    return true
  }

  async function handleSaveDraft() {
    if (!validate()) return
    setSaving(true)
    try {
      await api.saveCourseReportRemark(reportId, buildPayload())
      toast.success('Draft saved')
      loadReport()
      onReportChange?.()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      await api.saveCourseReportRemark(reportId, buildPayload())
      const res = await api.submitCourseReport(reportId)
      toast.success(res.detail || 'Submitted successfully')
      loadReport()
      onReportChange?.()
    } catch (err) {
      toast.error(err.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAdvance() {
    setAdvancing(true)
    try {
      const res = await api.advanceCourseReport(reportId)
      toast.success(res.detail || 'Advanced successfully')
      loadReport()
      onReportChange?.()
    } catch (err) {
      toast.error(err.message || 'Failed to advance')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await api.downloadCourseReport(reportId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `course_report_${report?.student?.svc_number || reportId}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Downloaded')
    } catch (err) {
      toast.error(err.message || 'Failed to download')
    } finally {
      setDownloading(false)
    }
  }

  const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const PHOTO_MAX_SIZE = 2 * 1024 * 1024 // 2 MB

  function handlePhotoPick() {
    photoInputRef.current?.click()
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    if (!PHOTO_ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only JPG, PNG, and WEBP images are allowed')
      return
    }
    if (file.size > PHOTO_MAX_SIZE) {
      toast.error('Photo must be 2 MB or smaller')
      return
    }

    setPhotoBusy(true)
    try {
      const updated = await api.uploadCourseReportPhoto(reportId, file)
      setReport(updated)
      toast.success('Photo saved')
      onReportChange?.()
    } catch (err) {
      toast.error(err.message || 'Failed to upload photo')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handlePhotoRemove() {
    setPhotoBusy(true)
    try {
      const updated = await api.removeCourseReportPhoto(reportId)
      setReport(updated)
      toast.success('Photo removed')
      onReportChange?.()
    } catch (err) {
      toast.error(err.message || 'Failed to remove photo')
    } finally {
      setPhotoBusy(false)
    }
  }

  if (!reportId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 bg-neutral-50">
        <LucideIcons.FileText className="w-12 h-12 mb-3 text-neutral-200" />
        <p className="font-medium text-neutral-500">Select a student from the roster</p>
        <p className="text-sm mt-1">Their course report will appear here</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-50">
        <LucideIcons.RefreshCw className="w-6 h-6 animate-spin text-[#3d5a30]" />
      </div>
    )
  }

  if (!report) return null

  const { student, status, visible_remarks = [],
      can_edit, can_submit, can_advance, can_download, can_edit_photo,
      photo_url, academic_data, course_name } = report

  const fullName = formatStudentName(student)
  const rankName = formatWordCase(student?.rank)
  const draftRemark = visible_remarks.find(r => r.stage === myStageKey && !r.is_submitted)
  const statusIdx   = STATUS_ORDER.indexOf(status)

  const instrRemark      = visible_remarks.find(r => r.stage === 'instructor')
  const oicRemark        = visible_remarks.find(r => r.stage === 'oic')
  const ciRemark         = visible_remarks.find(r => r.stage === 'chief_instructor')
  const commandantRemark = visible_remarks.find(r => r.stage === 'commandant')

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f0]">
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── School header ── */}
        <div className="flex items-center gap-3">
          <img
            src={theme.logo_url || '/ka.png'}
            alt={`${theme.school_name || 'School'} logo`}
            className="w-12 h-12 object-contain rounded-md border border-neutral-200 bg-white flex-shrink-0"
          />
          <div>
            <h2 className="text-lg font-bold text-black leading-tight">{theme.school_name || 'KASMS'}</h2>
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Course Report</p>
          </div>
        </div>

        {/* ── Status pipeline ── */}
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 divide-x divide-neutral-100">
            {PIPELINE.map(stage => {
              const draftIdx     = STATUS_ORDER.indexOf(stage.draft)
              const submittedIdx = STATUS_ORDER.indexOf(stage.submitted)
              const isDone   = statusIdx >= submittedIdx
              const isActive = !isDone && statusIdx >= draftIdx
              return (
                <div key={stage.label} className="px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isDone
                      ? <LucideIcons.CheckCircle className="w-3.5 h-3.5 text-[#3d5a30]" />
                      : isActive
                        ? <LucideIcons.Clock className="w-3.5 h-3.5 text-amber-500" />
                        : <LucideIcons.Circle className="w-3.5 h-3.5 text-neutral-300" />
                    }
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{stage.label}</span>
                  </div>
                  <p className={`text-xs font-semibold ${isDone ? 'text-[#3d5a30]' : isActive ? 'text-amber-600' : 'text-neutral-400'}`}>
                    {isDone ? 'Submitted' : isActive ? 'In progress' : 'Not started'}
                  </p>
                </div>
              )
            })}
            {/* Download */}
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <LucideIcons.Download className={`w-3.5 h-3.5 ${can_download ? 'text-[#3d5a30]' : 'text-neutral-300'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Download</span>
                </div>
                <p className={`text-xs font-semibold ${can_download ? 'text-[#3d5a30]' : 'text-neutral-400'}`}>
                  {can_download ? 'Available' : 'Locked'}
                </p>
              </div>
              {can_download && (
                <button onClick={handleDownload} disabled={downloading}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition">
                  <LucideIcons.Download className="w-3 h-3" />
                  {downloading ? '…' : 'PDF'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION 1: PARTICULARS OF THE STUDENT ── */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <SectionHeader num="1" title="Particulars of the Student" tag="From student record" />
          <div className="p-5">
            <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)] items-start">
              <div className="flex flex-col items-center gap-2">
                <div className="w-[132px] h-[148px] rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden flex flex-col items-center justify-center gap-2 flex-shrink-0">
                  {photo_url ? (
                    <img
                      src={photo_url}
                      alt={`${fullName} passport photo`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Avatar first={student?.first_name} last={student?.last_name} size="xl" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">No photo on file</span>
                    </>
                  )}
                </div>
                {can_edit_photo && (
                  <div className="flex flex-col items-center gap-1.5 w-[132px]">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                    <button
                      onClick={handlePhotoPick}
                      disabled={photoBusy}
                      className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-black bg-white hover:bg-neutral-50 disabled:opacity-50 transition"
                    >
                      <LucideIcons.Upload className="w-3 h-3" />
                      {photoBusy ? '…' : photo_url ? 'Replace' : 'Upload'}
                    </button>
                    {photo_url && (
                      <button
                        onClick={handlePhotoRemove}
                        disabled={photoBusy}
                        className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 transition"
                      >
                        <LucideIcons.Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-0.5">Svc No</p>
                    <p className="text-sm font-semibold text-black font-mono">{student?.svc_number || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-0.5">Rank</p>
                    <p className="text-sm font-semibold text-black">{rankName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-0.5">Name(s)</p>
                    <p className="text-sm font-semibold text-black">{fullName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-0.5">Corps</p>
                    <p className="text-sm font-semibold text-black">{student?.unit || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-0.5">Unit</p>
                    <p className="text-sm font-semibold text-black">{report?.school_short_name || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: COURSE DETAILS / SUMMARY OF ASSESSMENT RESULTS ── */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <SectionHeader num="2" title="Course Details / Summary of Assessment Results" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5 text-left">Course Title</th>
                  <th className="px-4 py-2.5 text-center">Code</th>
                  <th className="px-4 py-2.5 text-center">From</th>
                  <th className="px-4 py-2.5 text-center">To</th>
                  <th className="px-4 py-2.5 text-center">No in Class</th>
                  <th className="px-4 py-2.5 text-center">Position</th>
                  <th className="px-4 py-2.5 text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 text-black">{course_name || '—'}</td>
                  <td className="px-4 py-3 text-center text-neutral-600">{report?.class_code || '—'}</td>
                  <td className="px-4 py-3 text-center text-neutral-600">{report?.start_date || '—'}</td>
                  <td className="px-4 py-3 text-center text-neutral-600">{report?.end_date || '—'}</td>
                  <td className="px-4 py-3 text-center font-medium text-black">{academic_data?.class_size ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-medium text-black">{academic_data?.class_position ? `#${academic_data.class_position}` : '—'}</td>
                  <td className="px-4 py-3 text-center"><GradeChip grade={academic_data?.overall_grade} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── SECTION 3: INSTRUCTOR'S REMARKS ── */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <SectionHeader num="3" title="Instructor's Remarks" />
          {can_edit && isInstructor ? (
            <div className="px-5 pt-4 pb-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <LucideIcons.PenLine className="w-4 h-4 text-[#3d5a30]" />
                <span className="text-sm font-semibold text-black">Your Remarks</span>
                {instrRemark?.is_submitted ? (
                  <span className="ml-auto text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                    Submitted — editing makes a correction
                  </span>
                ) : draftRemark && (
                  <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">Draft saved</span>
                )}
              </div>
              <InstructorForm fields={instructorFields} setFields={setIF} />

              {/* PAD reminder */}
              {(() => {
                const rated = PAD_SUBJECTS.filter(({ key }) => padScores[key]).length
                const allDone = rated === PAD_SUBJECTS.length
                return (
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${allDone ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    {allDone
                      ? <LucideIcons.CheckCircle className="w-4 h-4 flex-shrink-0 text-green-500" />
                      : <LucideIcons.AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${allDone ? 'text-green-800' : 'text-amber-800'}`}>
                        {allDone ? 'PAD scores complete' : 'Also complete Personal Ability Dimension (PAD) below'}
                      </p>
                      {!allDone && (
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Scroll down to the Final Performance Report section and rate each of the {PAD_SUBJECTS.length} dimensions (1–5)
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${allDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {rated}/{PAD_SUBJECTS.length}
                    </span>
                  </div>
                )
              })()}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button onClick={handleSaveDraft} disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-black bg-white hover:bg-neutral-50 disabled:opacity-50 transition">
                  <LucideIcons.Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
                {can_submit && (
                  <button onClick={handleSubmit} disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3d5a30] text-white text-sm font-medium hover:bg-[#2e4424] disabled:opacity-50 transition">
                    <LucideIcons.Send className="w-4 h-4" />
                    {submitting ? 'Submitting…' : 'Submit'}
                  </button>
                )}
              </div>
            </div>
          ) : instrRemark?.is_submitted ? (
            <div className="p-5 space-y-4">
              {[
                ['a. Character and Personality',        instrRemark.character_and_personality],
                ['b. Knowledge and Ability',            instrRemark.knowledge_and_ability],
                ['c. Command and Leadership',           instrRemark.command_and_leadership],
                ['d. Strengths',                        instrRemark.strengths],
                ['e. Weaknesses',                       instrRemark.weaknesses],
                ['f. Recommended for Deployment',       instrRemark.deployment_recommendation],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label}>
                  <div className="bg-neutral-50 border border-neutral-200 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-t-md text-neutral-500">{label}</div>
                  <div className="border border-t-0 border-neutral-200 rounded-b-md px-3 py-2.5 text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{val}</div>
                </div>
              ))}
              {instrRemark.author_name && (
                <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                  <LucideIcons.CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  Submitted by {instrRemark.author_rank ? `${instrRemark.author_rank} ` : ''}{instrRemark.author_name}
                </p>
              )}
            </div>
          ) : (
            <div className="px-5 py-6 flex items-center gap-2 text-neutral-400">
              <LucideIcons.Lock className="w-4 h-4" />
              <span className="text-sm">Instructor remarks not yet submitted</span>
            </div>
          )}
        </section>

        {/* ── SECTION 4: RECOMMENDATIONS ── */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <SectionHeader num="4" title="Recommendations" />
          <div className="divide-y divide-neutral-200">
            <RecommendationBlock
              label="a. Course OIC Remarks"
              remark={oicRemark}
              isMyTurn={can_edit && user?.role === 'oic'}
              canAdvance={can_advance && !can_edit && user?.role === 'oic'}
              remarkContent={remarkContent} setContent={setContent}
              draftRemark={draftRemark}
              saving={saving} submitting={submitting} advancing={advancing}
              onSave={handleSaveDraft} onSubmit={handleSubmit} onAdvance={handleAdvance}
              canSubmit={can_submit} isCommandant={false}
            />
            <RecommendationBlock
              label="b. Chief Instructor's Remarks"
              remark={ciRemark}
              isMyTurn={can_edit && user?.role === 'chief_instructor'}
              canAdvance={can_advance && !can_edit && user?.role === 'chief_instructor'}
              remarkContent={remarkContent} setContent={setContent}
              draftRemark={draftRemark}
              saving={saving} submitting={submitting} advancing={advancing}
              onSave={handleSaveDraft} onSubmit={handleSubmit} onAdvance={handleAdvance}
              canSubmit={can_submit} isCommandant={false}
            />
            <RecommendationBlock
              label="c. Commandant Remarks"
              remark={commandantRemark}
              isMyTurn={can_edit && user?.role === 'commandant'}
              canAdvance={can_advance && !can_edit && user?.role === 'commandant'}
              remarkContent={remarkContent} setContent={setContent}
              draftRemark={draftRemark}
              saving={saving} submitting={submitting} advancing={advancing}
              onSave={handleSaveDraft} onSubmit={handleSubmit} onAdvance={handleAdvance}
              canSubmit={can_submit} isCommandant={true}
            />
          </div>
          {/* Advance for roles that don't write remarks */}
          {can_advance && !can_edit && !['oic', 'chief_instructor', 'commandant'].includes(user?.role) && (
            <div className="px-5 py-4 flex items-center justify-between gap-4 bg-neutral-50 border-t border-neutral-200">
              <div className="flex items-center gap-2">
                <LucideIcons.ArrowRight className="w-4 h-4 text-[#3d5a30]" />
                <p className="text-sm text-neutral-700 font-medium">Previous stage submitted — advance this report</p>
              </div>
              <button onClick={handleAdvance} disabled={advancing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3d5a30] text-white text-sm font-medium hover:bg-[#2e4424] disabled:opacity-50 transition">
                {advancing ? 'Advancing…' : 'Advance'}
              </button>
            </div>
          )}
          {status === 'approved' && (
            <div className="px-5 py-4 flex items-center gap-3 text-green-700 border-t border-neutral-100">
              <LucideIcons.CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Report fully approved and signed</span>
            </div>
          )}
        </section>

        {/* ── FINAL PERFORMANCE REPORT ── */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="bg-neutral-50 border-b border-neutral-200 px-5 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">Final Performance Report</h3>
          </div>

          {/* 1. ACADEMICS */}
          <div className="border-b border-neutral-200">
            <div className="bg-neutral-50 border-b border-neutral-200 px-5 py-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-700">1 · Academics</h4>
            </div>
            {academic_data?.rows?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left w-8">Ser</th>
                      <th className="px-4 py-2.5 text-left">Subject</th>
                      <th className="px-4 py-2.5 text-center w-16">HPS</th>
                      <th className="px-4 py-2.5 text-center w-16">Score</th>
                      <th className="px-4 py-2.5 text-center w-16">Grade</th>
                      <th className="px-4 py-2.5 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {academic_data.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-neutral-50">
                        <td className="px-4 py-2.5 text-neutral-400 text-[11px]">{i + 1}.</td>
                        <td className="px-4 py-2.5 text-black capitalize">
                          {row.subject_name?.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                        </td>
                        <td className="px-4 py-2.5 text-center text-neutral-600">{row.hps}</td>
                        <td className="px-4 py-2.5 text-center font-medium text-black">
                          {row.score === '—' ? <span className="text-neutral-300">—</span> : row.score}
                        </td>
                        <td className="px-4 py-2.5 text-center"><GradeChip grade={row.grade} /></td>
                        <td className="px-4 py-2.5 text-xs text-neutral-600">{row.remarks || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-neutral-50 font-semibold text-sm border-t-2 border-neutral-200">
                      <td colSpan={2} className="px-4 py-2.5 text-black">Total Score</td>
                      <td className="px-4 py-2.5 text-center text-black">{academic_data.total_hps}</td>
                      <td className="px-4 py-2.5 text-center text-black">{academic_data.total_score}</td>
                      <td colSpan={2} />
                    </tr>
                    <tr className="bg-neutral-50 font-semibold text-sm">
                      <td colSpan={2} className="px-4 py-2.5 text-black">Mean Score</td>
                      <td colSpan={2} className="px-4 py-2.5 text-center text-black">{academic_data.mean_score}</td>
                      <td className="px-4 py-2.5 text-center"><GradeChip grade={academic_data.overall_grade} /></td>
                      <td className="px-4 py-2.5 text-xs text-neutral-600">{academic_data.grade_descriptor}</td>
                    </tr>
                    <tr className="bg-neutral-50 font-semibold text-sm">
                      <td colSpan={2} className="px-4 py-2.5 text-black">Class Position</td>
                      <td colSpan={4} className="px-4 py-2.5 text-black">
                        {academic_data.class_position ? `#${academic_data.class_position}` : '—'} of {academic_data.class_size}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-sm text-neutral-400">No exam results recorded yet</div>
            )}
          </div>

          {/* 2. PERSONAL ABILITY DIMENSION */}
          <div>
            <div className={`border-b px-5 py-2.5 flex items-center justify-between ${
              can_edit && isInstructor
                ? 'bg-amber-50 border-amber-200'
                : 'bg-neutral-50 border-neutral-200'
            }`}>
              <div className="flex items-center gap-2">
                {can_edit && isInstructor && (
                  <LucideIcons.Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                )}
                <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-700">2 · Personal Ability Dimension</h4>
                {can_edit && isInstructor && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Fill in scores
                  </span>
                )}
              </div>
              <span className="text-[11px] text-neutral-400 font-medium">1 Exceptional · 5 Below Average</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {PAD_SUBJECTS.map(({ key, label }) => {
                const submittedInstr = visible_remarks.find(r => r.stage === 'instructor' && r.is_submitted)
                const savedScore = submittedInstr?.pad_scores?.[key] ?? (can_edit && isInstructor ? padScores[key] : undefined)
                const isEditable = can_edit && isInstructor
                return (
                  <div key={key} className="flex items-center justify-between px-5 py-3">
                    <span className={`text-sm ${savedScore ? 'text-black' : 'text-neutral-500'}`}>{label}</span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map(n => {
                        const active = savedScore === n
                        return (
                          <button key={n}
                            onClick={() => isEditable && setPadScores(p => ({ ...p, [key]: n }))}
                            disabled={!isEditable}
                            className={`w-8 h-8 rounded-lg text-sm font-semibold border transition focus:outline-none ${
                              active
                                ? 'bg-[#3d5a30] text-white border-[#3d5a30]'
                                : isEditable
                                  ? 'bg-white text-neutral-600 border-neutral-300 hover:border-[#3d5a30] hover:text-[#3d5a30]'
                                  : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-default'
                            }`}>
                            {n}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            {can_edit && isInstructor && (
              <div className="px-5 py-3 border-t border-amber-100 bg-amber-50 flex items-center gap-2">
                <LucideIcons.ArrowUp className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-800 font-medium">
                  PAD scores are submitted together with your Section 3 remarks. Use <strong>Save Draft</strong> or <strong>Submit</strong> above when ready.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

/* ── Section header ─────────────────────────────────────── */

function SectionHeader({ num, title, tag }) {
  return (
    <div className="bg-neutral-50 border-b border-neutral-200 px-5 py-3 flex items-center justify-between">
      <h3 className="text-sm font-bold text-black uppercase tracking-wide">
        {num} · <span className="text-[#3d5a30]">{title}</span>
      </h3>
      {tag && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#a67c28] bg-[#f8f1e3] border border-[#ecd6b1] px-2.5 py-1 rounded-full">
          {tag}
        </span>
      )}
    </div>
  )
}

/* ── Recommendation block (Section 4 sub-sections) ─────── */

function RecommendationBlock({
  label, remark, isMyTurn, canAdvance,
  remarkContent, setContent, draftRemark,
  saving, submitting, advancing,
  onSave, onSubmit, onAdvance, canSubmit, isCommandant,
}) {
  const isSubmitted = remark?.is_submitted
  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-600">{label}</span>
        {isSubmitted && (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
            <LucideIcons.CheckCircle className="w-2.5 h-2.5" /> Submitted
          </span>
        )}
        {isMyTurn && isSubmitted && (
          <span className="ml-auto text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
            Editing makes a correction
          </span>
        )}
        {isMyTurn && draftRemark && !isSubmitted && (
          <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">Draft saved</span>
        )}
      </div>

      {isMyTurn ? (
        <div className="space-y-3">
          <textarea
            value={remarkContent}
            onChange={e => setContent(e.target.value)}
            rows={6}
            placeholder="Write your assessment here… (minimum 10 characters)"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 resize-y bg-white"
          />
          <p className="text-xs text-neutral-400">{(remarkContent || '').length} / 10 000</p>
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100">
            <button onClick={onSave} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-black bg-white hover:bg-neutral-50 disabled:opacity-50 transition">
              <LucideIcons.Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            {canSubmit && (
              <button onClick={onSubmit} disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3d5a30] text-white text-sm font-medium hover:bg-[#2e4424] disabled:opacity-50 transition">
                <LucideIcons.Send className="w-4 h-4" />
                {submitting ? 'Submitting…' : isCommandant ? 'Submit & Approve' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      ) : isSubmitted ? (
        <div className="space-y-1">
          <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{remark.content || <em className="text-neutral-300">No content</em>}</p>
          {remark.author_name && (
            <p className="text-[11px] text-neutral-400 pt-1">
              — {remark.author_rank ? `${remark.author_rank} ` : ''}{remark.author_name}
            </p>
          )}
        </div>
      ) : canAdvance ? (
        <div className="flex items-center justify-between gap-4 py-2 px-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <div className="flex items-center gap-2">
            <LucideIcons.ArrowRight className="w-4 h-4 text-[#3d5a30]" />
            <p className="text-sm text-neutral-700 font-medium">Previous stage submitted — advance this report</p>
          </div>
          <button onClick={onAdvance} disabled={advancing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3d5a30] text-white text-sm font-medium hover:bg-[#2e4424] disabled:opacity-50 transition">
            {advancing ? 'Advancing…' : 'Advance'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-neutral-400">
          <LucideIcons.Lock className="w-3.5 h-3.5" />
          <span className="text-sm italic">Not yet submitted</span>
        </div>
      )}
    </div>
  )
}

/* ── Instructor remark form ─────────────────────────────── */

function InstructorForm({ fields, setFields }) {

  return (
    <div className="space-y-4">
      {/* A */}
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-1.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-bold">A</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Character &amp; Personality</span>
          <span className="ml-auto text-[10px] text-neutral-400">{(fields.character_and_personality || '').length} / 5 000</span>
        </div>
        <textarea
          value={fields.character_and_personality || ''}
          onChange={e => setFields(p => ({ ...p, character_and_personality: e.target.value }))}
          rows={4}
          placeholder="Describe temperament, social conduct, and how they fit within the section…"
          className="w-full px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 resize-y bg-white border-0"
        />
      </div>

      {/* B */}
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-1.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-bold">B</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Knowledge &amp; Ability</span>
          <span className="ml-auto text-[10px] text-neutral-400">{(fields.knowledge_and_ability || '').length} / 5 000</span>
        </div>
        <textarea
          value={fields.knowledge_and_ability || ''}
          onChange={e => setFields(p => ({ ...p, knowledge_and_ability: e.target.value }))}
          rows={4}
          placeholder="Command of subject matter, technical competence…"
          className="w-full px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 resize-y bg-white border-0"
        />
      </div>

      {/* C */}
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-1.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-bold">C</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Command &amp; Leadership</span>
          <span className="ml-auto text-[10px] text-neutral-400">{(fields.command_and_leadership || '').length} / 5 000</span>
        </div>
        <textarea
          value={fields.command_and_leadership || ''}
          onChange={e => setFields(p => ({ ...p, command_and_leadership: e.target.value }))}
          rows={4}
          placeholder="Leadership style, ability to manage group dynamics…"
          className="w-full px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 resize-y bg-white border-0"
        />
      </div>

      {/* D + E side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-1.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-bold">D</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Strengths</span>
            <span className="ml-auto text-[10px] text-neutral-400">{(fields.strengths || '').length} / 5k</span>
          </div>
          <textarea
            value={fields.strengths || ''}
            onChange={e => setFields(p => ({ ...p, strengths: e.target.value }))}
            rows={5}
            placeholder="Top-performing areas and standout skills…"
            className="w-full px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 resize-y bg-white border-0"
          />
        </div>
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-1.5 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-bold">E</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Weaknesses</span>
            <span className="ml-auto text-[10px] text-neutral-400">{(fields.weaknesses || '').length} / 5k</span>
          </div>
          <textarea
            value={fields.weaknesses || ''}
            onChange={e => setFields(p => ({ ...p, weaknesses: e.target.value }))}
            rows={5}
            placeholder="Development areas and remedial recommendations…"
            className="w-full px-3 py-2.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 resize-y bg-white border-0"
          />
        </div>
      </div>

      {/* F: Deployment recommendation dropdown */}
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-1.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-bold">F</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Recommended for Deployment</span>
        </div>
        <div className="px-3 py-3">
          <select
            value={fields.deployment_recommendation || ''}
            onChange={e => setFields(p => ({ ...p, deployment_recommendation: e.target.value }))}
            className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 bg-white"
          >
            <option value="">— Select recommendation —</option>
            {DEPLOYMENT_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Overall instructor summary */}
    </div>
  )
}

/* ── Read-only submitted remark card ────────────────────── */

function SubmittedRemark({ remark }) {
  const isInstr = remark.stage === 'instructor'
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
        <LucideIcons.Shield className="w-3.5 h-3.5 text-[#3d5a30]" />
        <span className="text-xs font-semibold text-black">{STAGE_LABEL[remark.stage] || remark.stage}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium ml-1">
          <LucideIcons.CheckCircle className="w-2.5 h-2.5" /> Submitted
        </span>
        {remark.author_name && (
          <span className="ml-auto text-[11px] text-neutral-400">
            {remark.author_rank ? `${remark.author_rank} ` : ''}{remark.author_name}
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        {isInstr ? (
          <>
            {[
              ['A · Character & Personality', remark.character_and_personality],
              ['B · Knowledge & Ability', remark.knowledge_and_ability],
              ['C · Command & Leadership', remark.command_and_leadership],
              ['D · Strengths', remark.strengths],
              ['E · Weaknesses', remark.weaknesses],
              ['F · Deployment Recommendation', remark.deployment_recommendation],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label}>
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{val}</p>
              </div>
            ))}
          </>
        ) : (
          <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{remark.content}</p>
        )}
      </div>
    </div>
  )
}

/* ── Main CourseRoster page ─────────────────────────────── */

export default function CourseRoster() {
  const { classId }          = useParams()
  const [searchParams]       = useSearchParams()
  const { user }             = useAuth()
  const navigate             = useNavigate()
  const toast                = useToast()

  const [reports, setReports]           = useState([])
  const [loadingList, setLoadingList]   = useState(false)
  const [selectedId, setSelectedId]     = useState(null)
  const [className, setClassName]       = useState('')
  const [refreshTick, setRefreshTick]   = useState(0)

  const preselect = searchParams.get('report')

  function getListPath() {
    const r = user?.role
    if (r === 'commandant' || r === 'chief_instructor') return '/commandant/course-reports'
    if (r === 'oic') return '/oic/course-reports'
    return '/list/course-reports'
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingList(true)
      try {
        const data = await api.getCourseReports(`class_id=${classId}&page_size=200`)
        const list = data.results ?? data ?? []
        if (!cancelled) {
          setReports(list)
          if (list.length > 0) {
            setClassName(list[0].class_name || '')
            const target = preselect && list.find(r => r.id === preselect)
            setSelectedId(target ? target.id : list[0].id)
          }
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message || 'Failed to load roster')
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [classId, preselect, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleReportChange() {
    setRefreshTick(t => t + 1)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-neutral-200 flex-shrink-0">
        <button
          onClick={() => navigate(getListPath())}
          className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
        >
          <LucideIcons.ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base font-bold text-black leading-tight">{className || 'Course Reports'}</h1>
          <p className="text-xs text-neutral-500">{reports.length} student{reports.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <RosterSidebar
          reports={reports}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loadingList}
        />
        <ReportPanel
          key={selectedId}
          reportId={selectedId}
          user={user}
          onReportChange={handleReportChange}
        />
      </div>
    </div>
  )
}
