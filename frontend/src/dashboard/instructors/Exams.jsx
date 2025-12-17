import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import Card from '../../components/Card'
import ConfirmModal from '../../components/ConfirmModal'

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
  
  
  const [togglingId, setTogglingId] = useState(null)
  const [createFiles, setCreateFiles] = useState([])
  const [editFiles, setEditFiles] = useState([])
  
  
  const [attachmentsMap, setAttachmentsMap] = useState({})
  const [attachmentsOpenId, setAttachmentsOpenId] = useState(null)
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
      console.debug('failed to load attachments for', examId, err)
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
          console.debug('attachments prefetch failed', err)
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

  function updateField(k, v) { setCreateForm(f => ({ ...f, [k]: v })) }
  function updateEditField(k, v) { setEditForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e && e.preventDefault()
    const currentForm = editingId ? editForm : createForm
    if (!currentForm.subject) return toast.error('Select a subject')
    if (!currentForm.title) return toast.error('Enter exam title')
    if (!currentForm.exam_date) return toast.error('Select exam date')
    if (!currentForm.total_marks) return toast.error('Enter total marks')

    // Client-side unique constraint check: subject + exam_date must be unique
    try {
      const same = exams.find(x => {
        const subjId = x.subject?.id ?? x.subject
        const formSubj = Number(currentForm.subject)
        const date = x.exam_date
        return Number(subjId) === Number(formSubj) && String(date) === String(currentForm.exam_date) && x.id !== editingId
      })
      if (same) {
        return toast.error('An exam for this subject on the selected date already exists.')
      }
    } catch (err) {
      console.debug('duplicate check failed', err)
    }

    // Prevent creating another active Final exam client-side
    try {
      const isCreatingFinal = !editingId && String(currentForm.exam_type || '').toLowerCase() === 'final'
      if (isCreatingFinal) {
        const hasActiveFinal = exams.some(x => String(x.exam_type || '').toLowerCase() === 'final' && !!x.is_active)
        if (hasActiveFinal) {
          return toast.error('An active Final exam already exists. Deactivate it before creating another Final exam.')
        }
      }
    } catch (err) {
      console.debug('active final check failed', err)
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
          console.error('failed uploading edit-time files', err)
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
      console.warn('Failed to create class notice', err)
    }
      } catch (err) {
        toast.error(getErrorMessage(err) || 'Failed to update exam')
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
      console.error('failed uploading create-time files', err)
      toast.error('Failed to upload one or more files')
    } finally {
      setCreateFiles([])
      // close create modal after uploads are handled
      setCreateModalOpen(false)
    }
  }
  try {
    const subj = subjects.find(s => String(s.id) === String(res.subject || createForm.subject))
    const classId = subj && (subj.class_obj || subj.class || subj.class_obj_id || subj.class_id || subj.class_obj?.id || subj.class?.id)
    if (classId) {
      await api.createClassNotice({ title: `New exam: ${res.title}`, content: `Exam ${res.title} scheduled on ${res.exam_date}.`, class_obj: Number(classId), subject: Number(res.subject || createForm.subject) })
      toast.success('Students notified')
    }
  } catch (err) {
    console.warn('Failed to create class notice', err)
  }
      } catch (err) {
        toast.error(getErrorMessage(err) || 'Failed to create exam')
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
      console.warn('scrollIntoView failed', err)
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

  async function toggleActive(exam) {
    if (!exam) return
    setTogglingId(exam.id)
    try {
      const res = await api.updateExam(exam.id, { is_active: !exam.is_active })
      setExams(s => s.map(x => (x.id === res.id ? res : x)))
      toast.success(res.is_active ? 'Exam activated' : 'Exam deactivated')
    } catch (err) {
      toast.error(err?.message || 'Failed to update exam status')
    } finally {
      setTogglingId(null)
    }
  }

  

  function handleCreateFilesChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) {
      setCreateFiles([])
      return
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error('Allowed file types: PDF, DOC, DOCX, TXT, XLS, XLSX')
        return
      }
    }

    setCreateFiles(files)
  }

  function handleEditFilesChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) {
      setEditFiles([])
      return
    }
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error('Allowed file types: PDF, DOC, DOCX, TXT, XLS, XLSX')
        return
      }
    }
    setEditFiles(files)
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

  return (
    <div className="p-4 text-black">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">Exams</h2>
          <p className="text-sm text-gray-600">View, filter and create exams for your subjects.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCreateModalOpen(true)} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition">Create exam</button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-1 gap-4">
              {/* Create button (opens modal) */}

  {/* Exams list (full width) */}
  <div className="md:col-span-1">
          <div className="bg-white rounded shadow p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h3 className="font-medium">My exams</h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input placeholder="Search by title or subject" value={query} onChange={e => setQuery(e.target.value)} className="p-2 rounded border w-full sm:w-64" />
                <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="p-2 rounded border">
                  <option value="">All subjects</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {loading && <div className="text-sm text-gray-500">Loading…</div>}
            {!loading && exams.length === 0 && <div className="text-sm text-gray-500">No exams found. Use the form on the left to create your first exam.</div>}

            {!loading && filtered.length > 0 && (
              <>
                {/* Mobile: card list */}
                <div className="md:hidden space-y-3">
                  {filtered.map((x) => (
                    <div key={x.id} className="bg-white rounded-lg p-3 shadow-sm border">
                      <div className="flex items-start justify-between">
                        <div>
                                <div className="font-medium text-black text-base break-words">{x.title}</div>
                          <div className="text-sm text-neutral-600">{x.subject_name || x.subject?.name || '—'}</div>
                          <div className="text-sm text-neutral-500 mt-1">{x.exam_date ? new Date(x.exam_date).toLocaleDateString() : '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-neutral-600">{x.total_marks ?? '—'} pts</div>
                          <div className="text-xs mt-1">{x.exam_type_display || x.exam_type}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-neutral-600 break-words">Resources: {(attachmentsMap[x.id] || []).length + (parseLinksFromDescription(x.description) || []).length}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => startEdit(x)} className="px-3 py-1 rounded-md bg-indigo-600 text-sm text-white whitespace-nowrap hover:bg-indigo-700 transition">Edit</button>
                            <button onClick={() => navigate(`/list/results?exam=${x.id}`)} className="px-3 py-1 rounded-md border bg-emerald-600 text-sm text-white whitespace-nowrap">Grade</button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-neutral-600 break-words">Created by: {x.created_by_name || '—'}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button disabled={togglingId === x.id} onClick={() => toggleActive(x)} className="px-3 py-1 rounded-md border bg-white text-sm whitespace-nowrap">{x.is_active ? 'Deactivate' : 'Activate'}</button>
                            <button disabled={deletingId === x.id} onClick={() => handleDelete(x)} className="px-3 py-1 rounded-md bg-red-600 text-sm text-white whitespace-nowrap hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === x.id ? 'Deleting...' : 'Remove'}</button>
                          </div>
                        </div>

                        {/* attachments toggle */}
                        <div className="flex items-center justify-end">
                          <button onClick={() => toggleAttachments(x.id)} className="text-sm text-blue-600 underline break-words">{attachmentsOpenId === x.id ? 'Hide' : 'View resources'}</button>
                        </div>

                        {attachmentsOpenId === x.id && (
                          <div className="mt-2 bg-neutral-50 p-2 rounded">
                            {(attachmentsMap[x.id] && attachmentsMap[x.id].length > 0) ? (
                              <div className="space-y-2">
                                {attachmentsMap[x.id].map(f => (
                                  <div key={f.id} className="text-sm">
                                    {((f.file || f.file_url) || '').toLowerCase().match(/\.(png|jpe?g|gif|webp)$/) ? (
                                      <img src={f.file_url || f.file} alt={f.file ? f.file.split('/').pop() : 'image'} className="max-w-full h-auto rounded" />
                                    ) : (
                                      <a href={f.file_url || f.file} target="_blank" rel="noreferrer" className="text-blue-600 underline break-words">{f.file ? f.file.split('/').pop() : (f.file_url || 'file')}</a>
                                    )}
                                    <div className="text-xs text-neutral-600">File • {f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : '—'}</div>
                                  </div>
                                ))}
                              </div>
                            ) : <div className="text-sm text-neutral-600">No resources</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-gray-600">
                        <th className="px-2 py-2 w-28 text-left">Date</th>
                        <th className="px-2 py-2 text-left">Title</th>
                        <th className="px-2 py-2 w-40 text-left">Subject</th>
                        <th className="px-2 py-2 w-24 text-right">Resources</th>
                        <th className="px-2 py-2 w-24 text-center">Type</th>
                        <th className="px-2 py-2 w-20 text-center">Marks</th>
                        <th className="px-2 py-2 w-40 text-left">Created by</th>
                        <th className="px-2 py-2 w-35 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((x) => {
                        const links = parseLinksFromDescription(x.description)
                        const files = attachmentsMap[x.id] || []
                        const totalResources = (links ? links.length : 0) + (files ? files.length : 0)
                        return (
                          <React.Fragment key={x.id}>
                            <tr className="border-t">
                              <td className="px-2 py-2 w-28">{x.exam_date ? new Date(x.exam_date).toLocaleDateString() : '—'}</td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium truncate max-w-[40ch]">{x.title}</div>
                                  {x.is_active ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Active</span> : <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">Inactive</span>}
                                </div>
                              </td>
                              <td className="px-2 py-2 w-40">{x.subject_name || x.subject?.name || '—'}</td>
                              <td className="px-2 py-2 w-24">
                                <div className="flex flex-wrap items-center gap-2 justify-end">
                                  <div className="text-sm">{totalResources}</div>
                                  <button onClick={() => toggleAttachments(x.id)} className="text-sm text-blue-600 underline whitespace-nowrap">View</button>
                                </div>
                              </td>
                              <td className="px-2 py-2 w-24 text-center">{x.exam_type_display || x.exam_type}</td>
                              <td className="px-2 py-2 w-20 text-center">{x.total_marks ?? '—'}</td>
                              <td className="px-2 py-2 w-40">{x.created_by_name || '—'}</td>
                              <td className="px-2 py-2 w-48 text-center">
                                <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                                  <button onClick={() => startEdit(x)} className="px-3 py-1 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition">Edit</button>
                                  <button onClick={() => navigate(`/list/results?exam=${x.id}`)} className="px-3 py-1 rounded-md border bg-emerald-600 text-sm text-white">Grade</button>
                                  <button disabled={togglingId === x.id} onClick={() => toggleActive(x)} className="px-3 py-1 rounded-md border bg-white text-sm">{x.is_active ? 'Deactivate' : 'Activate'}</button>
                                  <button disabled={deletingId === x.id} onClick={() => handleDelete(x)} className="px-3 py-1 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === x.id ? 'Deleting...' : 'Remove'}</button>
                                </div>
                              </td>
                            </tr>

                            {attachmentsOpenId === x.id && (
                              <tr className="bg-neutral-50">
                                <td colSpan={8} className="px-4 py-3">
                                  <div className="space-y-2">
                                    {/* Files */}
                                    {(files && files.length > 0) ? (
                                      <div>
                                        <div className="text-sm font-medium">Uploaded files</div>
                                        <ul className="list-disc pl-5 mt-1">
                                          {files.map(f => (
                                            <li key={f.id} className="text-sm">
                                              <a href={f.file_url || f.file} target="_blank" rel="noreferrer" className="text-blue-600 underline mr-2 break-words">{f.file ? f.file.split('/').pop() : (f.file_url || 'file')}</a>
                                              <span className="text-xs text-neutral-600">File • {f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : '—'}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : <div className="text-sm text-neutral-600">No uploaded files</div>}

                                    {/* External links parsed from description */}
                                    {(links && links.length > 0) ? (
                                      <div>
                                        <div className="text-sm font-medium mt-2">Links</div>
                                        <ul className="list-disc pl-5 mt-1">
                                          {links.map((lnk, idx) => (
                                            <li key={idx} className="text-sm">
                                              <a href={lnk} target="_blank" rel="noreferrer" className="text-blue-600 underline mr-2 break-words">{lnk}</a>
                                              <span className="text-xs text-neutral-600">Link</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
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
      </div>
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setCreateModalOpen(false); setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' }); setCreateFiles([]) }} />
            <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
              <form onSubmit={submit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg text-black font-medium">Create exam</h4>
                    <p className="text-sm text-neutral-500">Create a new exam for your subject.</p>
                  </div>
                  <button type="button" aria-label="Close" onClick={() => { setCreateModalOpen(false); setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' }); setCreateFiles([]) }} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
                </div>

                <div className="mt-4">
                  <label className="block text-sm text-gray-700">Subject</label>
                  <select value={createForm.subject} onChange={(e) => updateField('subject', e.target.value)} className="mt-1 p-2 rounded border w-full">
                    <option value="">-- select subject --</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.class_name ? `— ${s.class_name}` : ''}</option>
                    ))}
                  </select>

                  <label className="block text-sm text-gray-700 mt-3">Title</label>
                  <input value={createForm.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g., Final Exam" className="mt-1 p-2 rounded border w-full" />

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="block text-sm text-gray-700">Date</label>
                      <input type="date" value={createForm.exam_date} onChange={(e) => updateField('exam_date', e.target.value)} className="mt-1 p-2 rounded border w-full" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Total marks</label>
                      <input type="number" value={createForm.total_marks} onChange={(e) => updateField('total_marks', e.target.value)} className="mt-1 p-2 rounded border w-full" />
                    </div>
                  </div>

                  <label className="block text-sm text-gray-700 mt-3">Type</label>
                  <input type="text" value="Final" disabled className="mt-1 p-2 rounded border w-full bg-gray-100 text-neutral-700" />
                  <input type="hidden" value={createForm.exam_type || 'final'} />
                
                  <div className="mt-3">
                    <label className="block text-sm text-gray-700">Description</label>
                    <textarea value={createForm.description || ''} onChange={(e) => updateField('description', e.target.value)} className="mt-1 p-2 rounded border w-full" rows={3} />
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm text-gray-700">Duration (minutes)</label>
                    <input type="number" min="0" value={createForm.exam_duration || ''} onChange={(e) => updateField('exam_duration', e.target.value)} className="mt-1 p-2 rounded border w-full" />
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm text-gray-700">Upload resources</label>
                    <input type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx" multiple onChange={handleCreateFilesChange} className="mt-1" />
                    {createFiles && createFiles.length > 0 && <div className="text-sm text-neutral-600 mt-1">{createFiles.length} resource(s) selected</div>}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={() => { setCreateModalOpen(false); setCreateForm({ title: '', subject: '', exam_type: 'final', exam_date: '', total_marks: '', description: '', exam_duration: '' }); setCreateFiles([]) }} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={loading} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition">{loading ? 'Saving...' : 'Create'}</button>
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
            <div className="absolute inset-0 bg-black/50" onClick={cancelEdit} />
            <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
              <form onSubmit={submit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg text-black font-medium">Edit exam</h4>
                    <p className="text-sm text-neutral-500">Update exam details.</p>
                  </div>
                  <button type="button" aria-label="Close" onClick={cancelEdit} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
                </div>

                <div className="mt-4">
                  <label className="block text-sm text-gray-700">Subject</label>
                  <select value={editForm.subject} onChange={(e) => updateEditField('subject', e.target.value)} className="mt-1 p-2 rounded border w-full">
                    <option value="">-- select subject --</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.class_name ? `— ${s.class_name}` : ''}</option>
                    ))}
                  </select>

                  <label className="block text-sm text-gray-700 mt-3">Title</label>
                  <input value={editForm.title} onChange={(e) => updateEditField('title', e.target.value)} placeholder="e.g., Final Exam" className="mt-1 p-2 rounded border w-full" />

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="block text-sm text-gray-700">Date</label>
                      <input type="date" value={editForm.exam_date} onChange={(e) => updateEditField('exam_date', e.target.value)} className="mt-1 p-2 rounded border w-full" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Total marks</label>
                      <input type="number" value={editForm.total_marks} onChange={(e) => updateEditField('total_marks', e.target.value)} className="mt-1 p-2 rounded border w-full" />
                    </div>
                  </div>

                  <label className="block text-sm text-gray-700 mt-3">Type</label>
                  <input type="text" value="Final" disabled className="mt-1 p-2 rounded border w-full bg-gray-100 text-neutral-700" />
                  <input type="hidden" value={editForm.exam_type || 'final'} />
                
                  <div className="mt-3">
                    <label className="block text-sm text-gray-700">Description</label>
                    <textarea value={editForm.description || ''} onChange={(e) => updateEditField('description', e.target.value)} className="mt-1 p-2 rounded border w-full" rows={3} />
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm text-gray-700">Duration (minutes)</label>
                    <input type="number" min="0" value={editForm.exam_duration || ''} onChange={(e) => updateEditField('exam_duration', e.target.value)} className="mt-1 p-2 rounded border w-full" />
                  </div>

                  {/* Notifications are sent automatically on edit */}
                  {/* Upload resources while editing */}
                  <div className="mt-3">
                    <label className="block text-sm text-gray-700">Upload resources</label>
                    <input type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx" multiple onChange={handleEditFilesChange} className="mt-1" />
                    {editFiles && editFiles.length > 0 && <div className="text-sm text-neutral-600 mt-1">{editFiles.length} resource(s) selected</div>}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
  {/* per-row hidden input removed; uploads happen on the create form only */}
    </div>
  )
}
