import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import ConfirmModal from '../../components/ConfirmModal'
import ModernDatePicker from '../../components/ModernDatePicker'

export default function Exams() {
  const { user } = useAuth()
  const toast = useToast()

  const [createModalOpen, setCreateModalOpen] = useState(false)

  const [exams, setExams] = useState([])
  const [subjects, setSubjects] = useState([])
  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [createForm, setCreateForm] = useState({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '' })
  const [editForm, setEditForm] = useState({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '' })
  const [createError, setCreateError] = useState('')
  const [editError, setEditError] = useState('')

  const [createFiles, setCreateFiles] = useState([])
  const [editFiles, setEditFiles] = useState([])
  
  
  const [attachmentsMap, setAttachmentsMap] = useState({})
  const [attachmentsOpenId, setAttachmentsOpenId] = useState(null)
  const [sortOrder, setSortOrder] = useState('newest')
  const navigate = useNavigate()

  // fetch attachments for a single exam and stash into attachmentsMap
  async function fetchAttachmentsForExam(examId) {
    if (!examId) return
    try {
      const list = await api.getExamAttachments(examId)
      // ensure array
      const arr = Array.isArray(list) ? list : (list && list.results) ? list.results : []
      setAttachmentsMap(m => ({ ...m, [examId]: arr }))
    } catch (err) {
      // Silently handle attachment load error
    }
  }

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const [slist, elist] = await Promise.all([
          api.getMySubjects?.() ?? api.getSubjects(),
          api.getMyExams?.() ?? api.getExams()
        ])

        if (!mounted) return
        const subjectsArr = Array.isArray(slist.results) ? slist.results : (Array.isArray(slist) ? slist : (slist && slist.results) ? slist.results : [])
        const examsArr = Array.isArray(elist.results) ? elist.results : (Array.isArray(elist) ? elist : (elist && elist.results) ? elist.results : [])
        setSubjects(subjectsArr)
        setExams(examsArr)
        // fetch attachments for loaded exams
        try {
          const ids = examsArr.map(x => x.id).filter(Boolean)
          ids.forEach(id => fetchAttachmentsForExam(id))
        } catch (err) {
          // Silently handle prefetch failure
        }
      } catch (err) {
        toast.error(err.message || 'Failed to load exams')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (user) load()
    return () => { mounted = false }
  }, [user, toast])

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    return exams.filter(e => {
      if (subjectFilter && String(e.subject) !== String(subjectFilter) && String(e.subject?.id) !== String(subjectFilter)) return false
      if (!q) return true
      return (e.title || '').toLowerCase().includes(q) || (e.subject_name || e.subject?.name || '').toLowerCase().includes(q)
    })
  }, [exams, query, subjectFilter])

  const displayed = useMemo(() => {
    const list = [...filtered]
    if (sortOrder === 'newest') {
      return list.sort((a, b) => new Date(b.exam_date || 0) - new Date(a.exam_date || 0))
    }
    if (sortOrder === 'oldest') {
      return list.sort((a, b) => new Date(a.exam_date || 0) - new Date(b.exam_date || 0))
    }
    return list
  }, [filtered, sortOrder])

  const metrics = useMemo(() => {
    const total = exams.length
    const active = exams.filter(x => x.is_active).length
    const finals = exams.filter(x => String(x.exam_type || '').toLowerCase() === 'final').length
    const upcoming = exams.filter(x => {
      if (!x.exam_date) return false
      const d = new Date(x.exam_date)
      const today = new Date()
      return d >= today
    }).length
    return { total, active, finals, upcoming }
  }, [exams])

  const isCreateFormValid = useMemo(() => {
    return !!(createForm.subject && createForm.title?.trim() && createForm.exam_date && createForm.total_marks)
  }, [createForm])

  const isEditFormValid = useMemo(() => {
    return !!(editForm.subject && editForm.title?.trim() && editForm.exam_date && editForm.total_marks)
  }, [editForm])

  function updateField(k, v) { setCreateForm(f => ({ ...f, [k]: v })) }
  function updateEditField(k, v) { setEditForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e && e.preventDefault()
    setCreateError('')
    const currentForm = editingId ? editForm : createForm
    if (!currentForm.subject) {
      setCreateError('Select a subject')
      return
    }
    if (!currentForm.title) {
      setCreateError('Enter exam title')
      return
    }
    if (!currentForm.exam_date) {
      setCreateError('Select exam date')
      return
    }
    if (!currentForm.total_marks) {
      setCreateError('Enter total marks')
      return
    }

    // Client-side unique constraint check: subject + exam_date must be unique
    try {
      const same = exams.find(x => {
        const subjId = x.subject?.id ?? x.subject
        const formSubj = Number(currentForm.subject)
        const date = x.exam_date
        return Number(subjId) === Number(formSubj) && String(date) === String(currentForm.exam_date) && x.id !== editingId
      })
      if (same) {
        setCreateError('An exam for this subject on the selected date already exists.')
        return
      }
    } catch (err) {
      // Silently handle duplicate check failure
    }

    // Prevent creating another active Final exam for the SAME subject client-side
    try {
      const isCreatingFinal = !editingId && String(currentForm.exam_type || '').toLowerCase() === 'final'
      if (isCreatingFinal) {
        const hasActiveFinal = exams.some(x => {
          const subjId = x.subject?.id ?? x.subject
          const formSubj = Number(currentForm.subject)
          return Number(subjId) === Number(formSubj) && String(x.exam_type || '').toLowerCase() === 'final' && !!x.is_active
        })
        if (hasActiveFinal) {
          return toast.error('An active Final exam already exists for this subject. Deactivate it before creating another Final exam.')
        }
      }
    } catch (err) {
      // Silently handle active final check failure
    }

    // build payload including description and duration
    const toDuration = (mins) => {
      const m = Number(mins) || 0
      const h = Math.floor(m / 60)
      const mm = m % 60
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
    }

  const rawDescription = currentForm.description || ''
  const payload = {
      title: currentForm.title,
      subject: Number(currentForm.subject),
      exam_type: currentForm.exam_type,
      exam_date: currentForm.exam_date,
      total_marks: Number(currentForm.total_marks),
  description: rawDescription.trim() || undefined,
      exam_duration: currentForm.exam_duration ? toDuration(currentForm.exam_duration) : undefined,
    }

    // if editingId is set, update existing exam, otherwise create
    if (editingId) {
      setEditLoading(true)
      try {
        const res = await api.updateExam(editingId, payload)
        toast.success('Exam updated')
        setExams(s => s.map(x => (x.id === res.id ? res : x)))
        setEditingId(null)
        setEditForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' })
        // if files were selected while editing, upload them now
        if (editFiles && editFiles.length) {
          const filesToUpload = [...editFiles]
          try {
            await Promise.all(filesToUpload.map(f => api.uploadExamAttachment(res.id, f)))
            await fetchAttachmentsForExam(res.id)
            toast.success(`${filesToUpload.length} resource(s) uploaded`)
          } catch (err) {
            // Silently handle file upload failure
            toast.error('Failed to upload one or more files')
          } finally {
            setEditFiles([])
          }
        }
        // notify students via class notice immediately after edit
        try {
          const subj = subjects.find(s => String(s.id) === String(res.subject || currentForm.subject))
          const classId = subj && (subj.class_obj || subj.class || subj.class_obj_id || subj.class_id || subj.class_obj?.id || subj.class?.id)
          if (classId) {
            await api.createClassNotice({ title: `Exam scheduled: ${res.title}`, content: `Exam ${res.title} scheduled on ${res.exam_date}.`, class_obj: Number(classId), subject: Number(res.subject || currentForm.subject) })
            toast.success('Students notified')
          }
        } catch (err) {
          // Silently handle class notice creation failure
        }
      } catch (err) {
        setEditError(getErrorMessage(err) || 'Failed to update exam')
      } finally {
        setEditLoading(false)
      }
    } else {
      setLoading(true)
      try {
        const res = await api.createExam(payload)
        toast.success('Exam created')
        // prepend to list
        setExams(s => [res, ...s])
        setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' })
        // if files were selected on create, upload them now (create-time uploads only)
        if (createFiles && createFiles.length) {
          const filesToUpload = [...createFiles]
          try {
            await Promise.all(filesToUpload.map(f => api.uploadExamAttachment(res.id, f)))
            await fetchAttachmentsForExam(res.id)
            toast.success(`${filesToUpload.length} file(s) uploaded`)
          } catch (err) {
            // Silently handle file upload failure
            toast.error('Failed to upload one or more files')
          } finally {
            setCreateFiles([])
          }
        }
        try {
          const subj = subjects.find(s => String(s.id) === String(res.subject || createForm.subject))
          const classId = subj && (subj.class_obj || subj.class || subj.class_obj_id || subj.class_id || subj.class_obj?.id || subj.class?.id)
          if (classId) {
            await api.createClassNotice({ title: `New exam: ${res.title}`, content: `Exam ${res.title} scheduled on ${res.exam_date}.`, class_obj: Number(classId), subject: Number(res.subject || createForm.subject) })
            toast.success('Students notified')
          }
        } catch {
          // Silently handle class notice creation failure
        }
        // close create modal after successful creation
        setCreateModalOpen(false)
      } catch (err) {
        setCreateError(getErrorMessage(err) || 'Failed to create exam')
      } finally {
        setLoading(false)
      }
    }
  }

  function startEdit(exam) {
    setEditingId(exam.id)
  setEditForm({
      title: exam.title || '',
      subject: exam.subject != null ? String(exam.subject?.id ?? exam.subject) : '',
  exam_type: exam.exam_type || 'final',
      exam_date: exam.exam_date || '',
      total_marks: exam.total_marks ?? '',
      description: exam.description || '',
      exam_duration: exam.exam_duration ? (function(d){
        // backend likely returns HH:MM:SS — convert to minutes
        try{
          const parts = String(d).split(':').map(Number)
          return (parts[0] || 0) * 60 + (parts[1] || 0)
        }catch{ return '' }
      })(exam.exam_duration) : ''
    })
    // scroll into view (optional UX nicety)
    try {
      document.querySelector('aside')?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      // ignore scrolling errors
      // Silently handle scroll failure
    }
  }

  function handleDelete(exam) {
    // show confirm modal
    setConfirmDelete(exam)
  }

  async function performDelete(exam) {
    if (!exam) return
    setDeletingId(exam.id)
    try {
      await api.deleteExam(exam.id)
      setExams(s => s.filter(x => x.id !== exam.id))
      setConfirmDelete(null)
      toast.success('Exam deleted')
    } catch (err) {
      toast.error(err?.message || 'Failed to delete exam')
    } finally {
      setDeletingId(null)
    }
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  const MAX_FILES = 5
  const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx']
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
  const DANGEROUS_PATTERNS = /\.(exe|bat|cmd|sh|ps1|scr|msi|dll|js|vbs|jar|com|pif)$/i

  function sanitizeFileName(name) {
    // Remove invalid/dangerous characters and control chars
    // eslint-disable-next-line no-control-regex
    const cleaned = name.replace(/[<>:"/\\|?*]/g, '_').replace(/[\x00-\x1F]/g, '')
    return cleaned.replace(/\.{2,}/g, '.').trim()
  }

  function validateFile(file) {
    const errors = []
    const ext = file.name.split('.').pop()?.toLowerCase()

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: File too large (max 10MB)`)
    }

    // Check extension
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`${file.name}: Invalid file type`)
    }

    // Check MIME type
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      errors.push(`${file.name}: Invalid file format`)
    }

    // Check for dangerous patterns
    if (DANGEROUS_PATTERNS.test(file.name)) {
      errors.push(`${file.name}: File type not allowed`)
    }

    // Check for empty files
    if (file.size === 0) {
      errors.push(`${file.name}: File is empty`)
    }

    return errors
  }

  function handleCreateFilesChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) {
      setCreateFiles([])
      return
    }

    if (files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed`)
      e.target.value = ''
      return
    }

    const allErrors = []
    for (const file of files) {
      const errors = validateFile(file)
      allErrors.push(...errors)
    }

    if (allErrors.length > 0) {
      toast.error(allErrors[0]) // Show first error
      e.target.value = ''
      return
    }

    // Sanitize filenames for display (actual upload uses original file)
    const sanitizedFiles = files.map(f => {
      Object.defineProperty(f, 'sanitizedName', { value: sanitizeFileName(f.name), writable: false })
      return f
    })

    setCreateFiles(sanitizedFiles)
  }

  function handleEditFilesChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) {
      setEditFiles([])
      return
    }

    if (files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed`)
      e.target.value = ''
      return
    }

    const allErrors = []
    for (const file of files) {
      const errors = validateFile(file)
      allErrors.push(...errors)
    }

    if (allErrors.length > 0) {
      toast.error(allErrors[0])
      e.target.value = ''
      return
    }

    const sanitizedFiles = files.map(f => {
      Object.defineProperty(f, 'sanitizedName', { value: sanitizeFileName(f.name), writable: false })
      return f
    })

    setEditFiles(sanitizedFiles)
  }

  function toggleAttachments(examId) {
    if (attachmentsOpenId === examId) {
      setAttachmentsOpenId(null)
      return
    }
    setAttachmentsOpenId(examId)
    // fetch if missing
    if (!attachmentsMap[examId]) fetchAttachmentsForExam(examId)
  }

  function parseLinksFromDescription(desc) {
    if (!desc) return []
    const re = /(https?:\/\/[^\s)]+)/g
    const matches = []
    let m
    while ((m = re.exec(desc)) !== null) {
      matches.push(m[1])
    }
    return matches
  }

  // Extract friendly message from API error objects (DRF / axios friendly)
  function getErrorMessage(err) {
    try {
      if (err?.response?.data) {
        const d = err.response.data
        if (typeof d === 'string') return d
        if (Array.isArray(d)) return d.join(' ')
        if (d.non_field_errors) return Array.isArray(d.non_field_errors) ? d.non_field_errors.join(' ') : String(d.non_field_errors)
        return Object.values(d).map(v => Array.isArray(v) ? v.join(' ') : String(v)).join(' ')
      }
      if (err?.data) {
        const d = err.data
        if (typeof d === 'string') return d
        if (Array.isArray(d)) return d.join(' ')
        return Object.values(d).map(v => Array.isArray(v) ? v.join(' ') : String(v)).join(' ')
      }
      if (Array.isArray(err)) return err.join(' ')
      if (err?.message) return err.message
      return String(err)
    } catch {
      return 'An error occurred'
    }
  }

  function cancelEdit() {
    setEditingId(null)
  setEditForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' })
  setEditFiles([])
  }

  function LoadingSkeleton() {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse rounded-lg border border-neutral-200 bg-neutral-100 p-4">
            <div className="h-4 w-24 bg-neutral-200 rounded" />
            <div className="mt-2 h-4 w-40 bg-neutral-200 rounded" />
            <div className="mt-2 h-3 w-32 bg-neutral-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 text-black w-full">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold mb-1">Exams</h2>
            <p className="text-sm text-gray-600">Plan exams, share resources, and notify students in one place.</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button onClick={() => setCreateModalOpen(true)} className="px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">Create exam</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[{ label: 'Total exams', value: metrics.total, tone: 'text-indigo-600' },
            { label: 'Active', value: metrics.active, tone: 'text-emerald-600' },
            { label: 'Finals', value: metrics.finals, tone: 'text-amber-600' },
            { label: 'Upcoming', value: metrics.upcoming, tone: 'text-blue-600' }].map(card => (
            <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-neutral-500">{card.label}</div>
              <div className={`mt-2 text-2xl font-semibold ${card.tone || 'text-gray-900'}`}>{card.value}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border border-neutral-200">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
              <input placeholder="Search by title or subject" value={query} onChange={e => setQuery(e.target.value)} className="w-full sm:w-72 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              <div className="flex gap-2">
                <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="px-3 py-2 rounded-lg border w-full sm:w-52">
                  <option value="">All subjects</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2 rounded-lg border w-full sm:w-36">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-neutral-600" aria-hidden />
          </div>

          {loading && <LoadingSkeleton />}

          {!loading && exams.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
              <h3 className="mt-2 text-lg font-medium text-gray-900">No exams yet</h3>
              <p className="mt-1 text-gray-600">Start by creating your first exam and attaching supporting resources.</p>
              <button onClick={() => setCreateModalOpen(true)} className="mt-3 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition">Create exam</button>
            </div>
          )}

          {!loading && displayed.length > 0 && (
            <>
              {/* Mobile & Tablet: card list */}
              <div className="lg:hidden space-y-4">
                {displayed.map((x) => {
                  const links = parseLinksFromDescription(x.description)
                  const files = attachmentsMap[x.id] || []
                  const totalResources = (links ? links.length : 0) + (files ? files.length : 0)
                  return (
                    <div key={x.id} className="bg-white rounded-xl p-4 shadow-md border border-neutral-200 hover:shadow-lg transition-shadow">
                      {/* Header with status badge */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {x.is_active ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">Active</span>
                            ) : (
                              <span className="text-xs bg-neutral-100 text-neutral-600 px-2.5 py-1 rounded-full font-medium">Inactive</span>
                            )}
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium uppercase">
                              {x.exam_type_display || x.exam_type}
                            </span>
                          </div>
                          <h3 className="font-bold text-gray-900 text-lg leading-tight">{x.title}</h3>
                          <p className="text-base text-indigo-600 font-medium mt-1">{x.subject_name || x.subject?.name || '—'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 bg-indigo-50 rounded-lg px-3 py-2">
                          <div className="text-xl font-bold text-indigo-700">{x.total_marks ?? '—'}</div>
                          <div className="text-xs text-indigo-500 font-medium">marks</div>
                        </div>
                      </div>

                      {/* Info Grid */}
                      <div className="grid grid-cols-2 gap-3 mb-4 py-3 border-y border-neutral-100">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Date</div>
                            <div className="text-sm font-semibold text-gray-900">{x.exam_date ? new Date(x.exam_date).toLocaleDateString() : '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Duration</div>
                            <div className="text-sm font-semibold text-gray-900">{x.exam_duration ? `${x.exam_duration} min` : '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Resources</div>
                            <div className="text-sm font-semibold text-gray-900">{totalResources} file(s)</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Created by</div>
                            <div className="text-sm font-semibold text-gray-900 truncate max-w-[100px]">{x.created_by_name || '—'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons - larger touch targets */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => navigate(`/list/results?exam=${x.id}`)}
                          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-base text-white font-semibold hover:bg-emerald-700 active:bg-emerald-800 transition shadow-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          Grade
                        </button>
                        <button
                          onClick={() => startEdit(x)}
                          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-base text-white font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => toggleAttachments(x.id)}
                          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-base font-semibold transition shadow-sm ${
                            attachmentsOpenId === x.id
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                          }`}
                          aria-expanded={attachmentsOpenId === x.id}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {attachmentsOpenId === x.id ? 'Hide' : 'Resources'}
                        </button>
                        <button
                          disabled={deletingId === x.id}
                          onClick={() => handleDelete(x)}
                          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-base text-white font-semibold hover:bg-red-700 active:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {deletingId === x.id ? '...' : 'Delete'}
                        </button>
                      </div>

                      {/* Resources Panel */}
                      {attachmentsOpenId === x.id && (
                        <div className="mt-4 bg-gradient-to-br from-neutral-50 to-blue-50 p-4 rounded-xl border border-neutral-200">
                          <div className="space-y-4">
                            {/* Uploaded Files */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div className="text-base font-semibold text-gray-900">Uploaded Files</div>
                              </div>
                              {(files && files.length > 0) ? (
                                <div className="space-y-2">
                                  {files.map(f => (
                                    <a
                                      key={f.id}
                                      href={f.file_url || f.file}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-200 hover:border-blue-400 hover:shadow-sm transition active:bg-blue-50"
                                    >
                                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-blue-700 truncate">{f.file ? f.file.split('/').pop() : (f.file_url || 'file')}</div>
                                        <div className="text-xs text-neutral-500">{f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : '—'}</div>
                                      </div>
                                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-neutral-500 italic p-3 bg-white rounded-lg border border-dashed border-neutral-300 text-center">No uploaded files</div>
                              )}
                            </div>

                            {/* Links */}
                            {(links && links.length > 0) && (
                              <div>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                  </div>
                                  <div className="text-base font-semibold text-gray-900">Links</div>
                                </div>
                                <div className="space-y-2">
                                  {links.map((lnk, idx) => (
                                    <a
                                      key={idx}
                                      href={lnk}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-200 hover:border-purple-400 hover:shadow-sm transition active:bg-purple-50"
                                    >
                                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-purple-700 truncate">{lnk}</div>
                                        <div className="text-xs text-neutral-500">External link</div>
                                      </div>
                                      <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )})}
              </div>

              {/* Desktop: table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr className="text-gray-600">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-24">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[200px]">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-32">Subject</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider w-28">Resources</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider w-20">Type</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider w-20">Marks</th>
                      
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[280px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayed.map((x) => {
                      const links = parseLinksFromDescription(x.description)
                      const files = attachmentsMap[x.id] || []
                      const totalResources = (links ? links.length : 0) + (files ? files.length : 0)
                      return (
                        <React.Fragment key={x.id}>
                          <tr className="hover:bg-neutral-50 transition">
                            <td className="px-4 py-4 align-top text-sm text-gray-900">{x.exam_date ? new Date(x.exam_date).toLocaleDateString() : '—'}</td>
                            <td className="px-4 py-4 align-top text-sm text-gray-900">
                              <div className="flex flex-col gap-1 max-w-[40ch]">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold truncate">{x.title}</div>
                                  {x.is_active ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Active</span> : <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">Inactive</span>}
                                </div>
                                <div className="text-xs text-neutral-500 line-clamp-2">{x.description || 'No description added'}</div>
                                <div className="text-xs text-neutral-600">{x.exam_duration ? `${x.exam_duration} min` : 'No duration'}</div>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-gray-900">{x.subject_name || x.subject?.name || '—'}</td>
                            <td className="px-4 py-4 align-top text-sm text-gray-900 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="text-sm text-gray-700">{totalResources}</div>
                                <button
                                  onClick={() => toggleAttachments(x.id)}
                                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                                    attachmentsOpenId === x.id
                                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                      : 'bg-blue-600 text-white hover:bg-blue-700'
                                  }`}
                                  aria-expanded={attachmentsOpenId === x.id}
                                  aria-label={attachmentsOpenId === x.id ? 'Hide resources' : 'View resources'}
                                >
                                  {attachmentsOpenId === x.id ? 'Hide' : 'View'}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-gray-900 text-center">{x.exam_type_display || x.exam_type}</td>
                            <td className="px-4 py-4 align-top text-sm text-gray-900 text-center">{x.total_marks ?? '—'}</td>
                            
                            <td className="px-4 py-4 align-top text-sm text-gray-900">
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                <button
                                  onClick={() => startEdit(x)}
                                  className="px-3 py-1.5 rounded-md bg-indigo-600 text-sm text-white font-medium hover:bg-indigo-700 transition whitespace-nowrap"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => navigate(`/list/results?exam=${x.id}`)}
                                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-sm text-white font-medium hover:bg-emerald-700 transition whitespace-nowrap"
                                >
                                  Grade
                                </button>
                                <button
                                  disabled={deletingId === x.id}
                                  onClick={() => handleDelete(x)}
                                  className="px-3 py-1.5 rounded-md bg-red-600 text-sm text-white font-medium hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap"
                                >
                                  {deletingId === x.id ? 'Deleting...' : 'Remove'}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {attachmentsOpenId === x.id && (
                            <tr className="bg-neutral-50 border-t-2 border-blue-200">
                              <td colSpan={7} className="px-4 py-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="bg-white rounded-lg p-3 border border-neutral-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <div className="text-sm font-semibold text-gray-900">Uploaded files</div>
                                    </div>
                                    {(files && files.length > 0) ? (
                                      <ul className="space-y-2">
                                        {files.map(f => (
                                          <li key={f.id} className="text-sm p-2 bg-blue-50 rounded hover:bg-blue-100 transition">
                                            <a href={f.file_url || f.file} target="_blank" rel="noreferrer" className="text-blue-700 font-medium hover:underline break-words block">{f.file ? f.file.split('/').pop() : (f.file_url || 'file')}</a>
                                            <span className="text-xs text-neutral-600 mt-1 block">📎 {f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : '—'}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : <div className="text-sm text-neutral-500 italic">No uploaded files</div>}
                                  </div>

                                  <div className="bg-white rounded-lg p-3 border border-neutral-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                      </svg>
                                      <div className="text-sm font-semibold text-gray-900">Links</div>
                                    </div>
                                    {(links && links.length > 0) ? (
                                      <ul className="space-y-2">
                                        {links.map((lnk, idx) => (
                                          <li key={idx} className="text-sm p-2 bg-blue-50 rounded hover:bg-blue-100 transition">
                                            <a href={lnk} target="_blank" rel="noreferrer" className="text-blue-700 font-medium hover:underline break-words block">{lnk}</a>
                                            <span className="text-xs text-neutral-600 mt-1 block">🔗 External link</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : <div className="text-sm text-neutral-500 italic">No links</div>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setCreateModalOpen(false); setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' }); setCreateFiles([]) }} />
            <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
              <form onSubmit={submit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg text-black font-medium">Create exam</h4>
                    <p className="text-sm text-neutral-500">Create a new exam for your subject.</p>
                  </div>
                  <button type="button" aria-label="Close" onClick={() => { setCreateModalOpen(false); setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' }); setCreateFiles([]) }} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
                </div>
                {createError && (
                  <div className="mt-3 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {createError}
                  </div>
                )}
                <div className="mt-4">
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1">Subject</div>
                    <select value={createForm.subject} onChange={(e) => updateField('subject', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                      <option value="">Select a subject</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.class_name ? `— ${s.class_name}` : ''}</option>)}
                    </select>
                  </label>
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1 flex justify-between">
                      <span>Title</span>
                      <span className={`text-xs ${(createForm.title?.length || 0) > 15 ? 'text-red-500' : 'text-neutral-400'}`}>{createForm.title?.length || 0}/25</span>
                    </div>
                    <input value={createForm.title} onChange={(e) => updateField('title', e.target.value.slice(0, 25))} maxLength={25} placeholder="e.g., Final Exam" className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <ModernDatePicker
                      label="Date"
                      value={createForm.exam_date}
                      onChange={(val) => updateField('exam_date', val)}
                      placeholder="Select date"
                      minDate={new Date()}
                    />
                    <label className="block">
                      <div className="text-sm text-neutral-600 mb-1">Total marks</div>
                      <input type="number" value={createForm.total_marks} onChange={(e) => updateField('total_marks', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="block">
                      <div className="text-sm text-neutral-600 mb-1">Type</div>
                      <input type="text" value="Final" disabled className="w-full border border-neutral-200 rounded px-3 py-2 text-black bg-gray-100" />
                      <input type="hidden" value={createForm.exam_type || 'final'} />
                    </label>
                    <label className="block">
                      <div className="text-sm text-neutral-600 mb-1">Duration (min)</div>
                      <input type="number" min="0" value={createForm.exam_duration || ''} onChange={(e) => updateField('exam_duration', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                    </label>
                  </div>
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1 flex justify-between">
                      <span>Description</span>
                      <span className={`text-xs ${(createForm.description?.length || 0) > 150 ? 'text-red-500' : 'text-neutral-400'}`}>{createForm.description?.length || 0}/150</span>
                    </div>
                    <textarea value={createForm.description || ''} onChange={(e) => updateField('description', e.target.value.slice(0, 150))} maxLength={150} placeholder="Optional description" className="w-full border border-neutral-200 rounded px-3 py-2 text-black" rows={2} />
                  </label>
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1">Resources</div>
                    <input type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx" multiple onChange={handleCreateFilesChange} className="w-full text-sm text-neutral-600" />
                    {createFiles && createFiles.length > 0 && <div className="text-xs text-neutral-500 mt-1">{createFiles.length} file(s) selected</div>}
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={() => { setCreateModalOpen(false); setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' }); setCreateFiles([]) }} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={loading || !isCreateFormValid} className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{loading ? 'Saving...' : 'Create exam'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmModal
          open={!!confirmDelete}
          title="Confirm delete"
          message={confirmDelete ? `Are you sure you want to delete "${confirmDelete.title || confirmDelete.id}"? This action cannot be undone.` : ''}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => performDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          loading={deletingId === confirmDelete?.id}
          confirmVariant="danger"
        />

        {/* Edit modal */}
        {editingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cancelEdit} />
            <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
              <form onSubmit={submit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg text-black font-medium">Edit exam</h4>
                    <p className="text-sm text-neutral-500">Update exam details.</p>
                  </div>
                  <button type="button" aria-label="Close" onClick={cancelEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
                </div>
                <div className="mt-4">
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1">Subject</div>
                    <select value={editForm.subject} onChange={(e) => updateEditField('subject', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                      <option value="">Select a subject</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.class_name ? `— ${s.class_name}` : ''}</option>)}
                    </select>
                  </label>
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1 flex justify-between">
                      <span>Title</span>
                      <span className={`text-xs ${(editForm.title?.length || 0) > 25 ? 'text-red-500' : 'text-neutral-400'}`}>{editForm.title?.length || 0}/25</span>
                    </div>
                    <input value={editForm.title} onChange={(e) => updateEditField('title', e.target.value.slice(0, 25))} maxLength={25} placeholder="e.g. Final Exam" className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <ModernDatePicker
                      label="Date"
                      value={editForm.exam_date}
                      onChange={(val) => updateEditField('exam_date', val)}
                      placeholder="Select date"
                      minDate={new Date()}
                    />
                    <label className="block">
                      <div className="text-sm text-neutral-600 mb-1">Total marks</div>
                      <input type="number" value={editForm.total_marks} onChange={(e) => updateEditField('total_marks', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="block">
                      <div className="text-sm text-neutral-600 mb-1">Type</div>
                      <input type="text" value="Final" disabled className="w-full border border-neutral-200 rounded px-3 py-2 text-black bg-gray-100" />
                      <input type="hidden" value={editForm.exam_type || 'final'} />
                    </label>
                    <label className="block">
                      <div className="text-sm text-neutral-600 mb-1">Duration (min)</div>
                      <input type="number" min="0" value={editForm.exam_duration || ''} onChange={(e) => updateEditField('exam_duration', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                    </label>
                  </div>
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1 flex justify-between">
                      <span>Description</span>
                      <span className={`text-xs ${(editForm.description?.length || 0) > 150 ? 'text-red-500' : 'text-neutral-400'}`}>{editForm.description?.length || 0}/150</span>
                    </div>
                    <textarea value={editForm.description || ''} onChange={(e) => updateEditField('description', e.target.value.slice(0, 150))} maxLength={150} placeholder="Optional description" className="w-full border border-neutral-200 rounded px-3 py-2 text-black" rows={2} />
                  </label>
                  <label className="block mb-3">
                    <div className="text-sm text-neutral-600 mb-1">Resources</div>
                    <input type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx" multiple onChange={handleEditFilesChange} className="w-full text-sm text-neutral-600" />
                    {editFiles && editFiles.length > 0 && <div className="text-xs text-neutral-500 mt-1">{editFiles.length} file(s) selected</div>}
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editLoading || !isEditFormValid} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
  {/* per-row hidden input removed; uploads happen on the create form only */}
    </div>
  )
}
