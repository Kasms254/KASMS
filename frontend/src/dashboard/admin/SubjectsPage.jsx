import React, { useEffect, useState, useMemo, useRef } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'

export default function SubjectsPage() {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // filter state
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedInstructor, setSelectedInstructor] = useState('all')

  // sorting state
  const [sortField, setSortField] = useState('name') // name, code, class, instructor
  const [sortDirection, setSortDirection] = useState('asc') // asc, desc

  // edit/delete state
  const [editingSubject, setEditingSubject] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', instructor: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [instructors, setInstructors] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', subject_code: '', description: '', instructor: '', class_obj: '' })
  const [isSaving, setIsSaving] = useState(false)
  const modalRef = useRef(null)
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    // developer fallback
  }

  useEffect(() => {
    let mounted = true

    Promise.all([api.getAllClasses().catch(() => null), api.getAllSubjects().catch(() => null)])
      .then(([clsData, subjData]) => {
        if (!mounted) return
        const clsList = Array.isArray(clsData) ? clsData : []
        const subjList = Array.isArray(subjData) ? subjData : []

        setClasses(clsList)
        setSubjects(subjList)

        // fetch instructors for editing dropdown
        api.getAllInstructors().then((ins) => {
          if (!mounted) return
          const list = Array.isArray(ins) ? ins : []
          setInstructors(list)
        }).catch(() => {})
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [])

  // Enhanced subjects list with class and instructor names, service number, and rank
  const enrichedSubjects = useMemo(() => {
    return subjects.map((s) => {
      const cid = s.class_obj || s.class || (s.class_obj_id ?? null)
      const cls = classes.find((c) => c.id === cid)
      const className = cls ? (cls.name || cls.class_name) : (s.class_name || 'Unassigned')

      const iid = s.instructor && typeof s.instructor === 'object' ? s.instructor.id : s.instructor
      const instructor = instructors.find((i) => i.id === iid)
      const instructorName = instructor ? (instructor.full_name || `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim()) : (s.instructor_name || '-')
      const instructorSvcNumber = instructor?.svc_number || '-'
      const instructorRank = instructor?.rank || instructor?.rank_display || '-'

      return {
        ...s,
        className,
        instructorName,
        instructorSvcNumber,
        instructorRank,
        classIsActive: cls ? cls.is_active : true,
      }
    })
  }, [subjects, classes, instructors])

  // Filter and sort subjects
  const filteredAndSortedSubjects = useMemo(() => {
    let filtered = enrichedSubjects

    // Filter by inactive classes
    if (!showInactive) {
      filtered = filtered.filter((s) => s.classIsActive)
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      filtered = filtered.filter((s) => {
        return (
          (s.name || s.title || '').toLowerCase().includes(q) ||
          (s.subject_code || s.code || '').toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q) ||
          s.instructorName.toLowerCase().includes(q) ||
          s.instructorSvcNumber.toLowerCase().includes(q) ||
          s.instructorRank.toLowerCase().includes(q)
        )
      })
    }

    // Filter by class
    if (selectedClass !== 'all') {
      filtered = filtered.filter((s) => {
        const cid = s.class_obj || s.class || (s.class_obj_id ?? null)
        return String(cid) === String(selectedClass)
      })
    }

    // Filter by instructor
    if (selectedInstructor !== 'all') {
      filtered = filtered.filter((s) => {
        const iid = s.instructor && typeof s.instructor === 'object' ? s.instructor.id : s.instructor
        return String(iid) === String(selectedInstructor)
      })
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal

      switch (sortField) {
        case 'name':
          aVal = (a.name || a.title || '').toLowerCase()
          bVal = (b.name || b.title || '').toLowerCase()
          break
        case 'code':
          aVal = (a.subject_code || a.code || '').toLowerCase()
          bVal = (b.subject_code || b.code || '').toLowerCase()
          break
        case 'class':
          aVal = a.className.toLowerCase()
          bVal = b.className.toLowerCase()
          break
        case 'instructor':
          aVal = a.instructorName.toLowerCase()
          bVal = b.instructorName.toLowerCase()
          break
        case 'svcNumber':
          aVal = a.instructorSvcNumber.toLowerCase()
          bVal = b.instructorSvcNumber.toLowerCase()
          break
        case 'rank':
          aVal = a.instructorRank.toLowerCase()
          bVal = b.instructorRank.toLowerCase()
          break
        default:
          aVal = ''
          bVal = ''
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [enrichedSubjects, showInactive, searchTerm, selectedClass, selectedInstructor, sortField, sortDirection])

  // Paginate
  const totalCount = filteredAndSortedSubjects.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const paginatedSubjects = useMemo(() => {
    const start = (page - 1) * pageSize
    const end = start + pageSize
    return filteredAndSortedSubjects.slice(start, end)
  }, [filteredAndSortedSubjects, page, pageSize])

  // Sort handler
  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <LucideIcons.ChevronsUpDown className="w-4 h-4 text-neutral-400" />
    return sortDirection === 'asc' ? <LucideIcons.ChevronUp className="w-4 h-4 text-indigo-600" /> : <LucideIcons.ChevronDown className="w-4 h-4 text-indigo-600" />
  }

  function openEdit(subj) {
    setEditingSubject(subj)
    setEditForm({
      name: subj.name || subj.title || '',
      code: subj.subject_code || subj.code || '',
      instructor: subj.instructor ? (typeof subj.instructor === 'object' ? String(subj.instructor.id) : String(subj.instructor)) : (subj.instructor_id ? String(subj.instructor_id) : ''),
    })
  }

  function closeEdit() {
    setEditingSubject(null)
    setEditForm({ name: '', code: '', instructor: '' })
  }

  function handleEditChange(key, value) {
    setEditForm((f) => ({ ...f, [key]: value }))
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingSubject) return
    setEditLoading(true)
    
    try {
      const payload = { name: editForm.name, subject_code: editForm.code }
      if (editForm.instructor) payload.instructor = Number(editForm.instructor)
      
      const updated = await api.partialUpdateSubject(editingSubject.id, payload)
      // update local subjects list
      setSubjects((s) => s.map((x) => (x.id === updated.id ? updated : x)))
      closeEdit()
    } catch (err) {
      reportError('Failed to update subject: ' + (err.message || String(err)))
    } finally {
      setEditLoading(false)
    }
  }

  function handleDelete(subj) {
    setConfirmDelete(subj)
  }

  async function performDelete(subj) {
    if (!subj) return
    setDeletingId(subj.id)
    
    try {
      await api.deleteSubject(subj.id)
      setSubjects((s) => s.filter((x) => x.id !== subj.id))
      setConfirmDelete(null)
    } catch (err) {
      reportError('Failed to delete subject: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  async function openAddSubjectModal(classId = ''){
    try{
      const ins = await api.getAllInstructors()
      const list = Array.isArray(ins) ? ins : []
      setInstructors(list)
    }catch{
      setInstructors([])
    }
    setForm({ name: '', subject_code: '', description: '', instructor: '', class_obj: classId || '' })
    setModalOpen(true)
    setTimeout(()=>{ modalRef.current?.querySelector('input,select,button,textarea')?.focus() }, 20)
  }

  function closeModal(){ setModalOpen(false) }

  async function handleAddSubject(e){
    e.preventDefault()
    if (!form.name) return (toast?.error || alert)('Subject name required')
    if (!form.description) return (toast?.error || alert)('Subject description required')
    if (!form.class_obj) return (toast?.error || alert)('Please select a class')
    if (!form.instructor) return (toast?.error || alert)('Please select an instructor')
    const payload = {
      name: form.name,
      subject_code: form.subject_code || undefined,
      description: form.description,
      class_obj: Number(form.class_obj),
      instructor: Number(form.instructor),
    }
    setIsSaving(true)
    try{
      await api.addSubject(payload)
      if (toast?.success) toast.success('Subject added')
      else if (toast?.showToast) toast.showToast('Subject added', { type: 'success' })
      closeModal()
      // refresh subjects
      const s = await api.getAllSubjects()
      const subjList = Array.isArray(s) ? s : []
      setSubjects(subjList)
    }catch(err){
      const d = err?.data
      if (d && typeof d === 'object'){
        const parts = []
        Object.keys(d).forEach(k => {
          if (Array.isArray(d[k])) parts.push(`${k}: ${d[k].join(' ')}`)
          else parts.push(`${k}: ${String(d[k])}`)
        })
        const combined = parts.join(' | ')
        if (toast?.error) toast.error(combined)
        else if (toast?.showToast) toast.showToast(combined, { type: 'error' })
        else reportError(combined)
        return
      }
      const msg = err?.message || 'Failed to add subject'
      if (toast?.error) toast.error(msg)
      else if (toast?.showToast) toast.showToast(msg, { type: 'error' })
      else reportError(msg)
    }finally{
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Subjects</h2>
          <p className="text-sm text-neutral-500">Manage subjects with sorting and filters</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => openAddSubjectModal()} className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 transition shadow-sm whitespace-nowrap">Add Subject</button>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col gap-3">
          {/* Search input and filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
                placeholder="Search subjects, classes, instructors, service numbers, or ranks..."
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="w-full sm:w-48">
              <select
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value)
                  setPage(1)
                }}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All Classes</option>
                {classes.filter(c => showInactive || c.is_active).map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name || cls.class_code || `Class ${cls.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-48">
              <select
                value={selectedInstructor}
                onChange={(e) => {
                  setSelectedInstructor(e.target.value)
                  setPage(1)
                }}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All Instructors</option>
                {instructors.map((ins) => (
                  <option key={ins.id} value={ins.id}>
                    {ins.full_name || `${ins.first_name || ''} ${ins.last_name || ''}`.trim()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => {
                setShowInactive(e.target.checked)
                setPage(1)
              }} className="w-4 h-4" />
              <span>Show inactive classes</span>
            </label>
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedClass('all')
                setSelectedInstructor('all')
                setPage(1)
              }}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear Filters
            </button>
          </div>

          {/* Filter summary badges */}
          {(searchTerm || selectedClass !== 'all' || selectedInstructor !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
              <span className="text-xs text-neutral-600">Active filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Search: "{searchTerm}"
                  <button onClick={() => { setSearchTerm(''); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedClass !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Class: {classes.find(c => String(c.id) === String(selectedClass))?.name || 'Unknown'}
                  <button onClick={() => { setSelectedClass('all'); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedInstructor !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                  Instructor: {instructors.find(i => String(i.id) === String(selectedInstructor))?.full_name || 'Unknown'}
                  <button onClick={() => { setSelectedInstructor('all'); setPage(1) }} className="hover:bg-indigo-100 rounded-full p-0.5">
                    <LucideIcons.X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-center">Error loading subjects: {error.message || String(error)}</div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading subjects…</div>
      ) : totalCount === 0 ? (
        <div className="p-8 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No subjects found.</div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left bg-neutral-50">
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Subject Name <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('class')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Class <SortIcon field="class" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('svcNumber')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Service No <SortIcon field="svcNumber" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('rank')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Rank <SortIcon field="rank" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('instructor')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Instructor <SortIcon field="instructor" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSubjects.map((s) => (
                  <tr key={s.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-700 font-medium">{s.name ?? s.title ?? 'Untitled'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs">{s.className}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{s.instructorSvcNumber}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{s.instructorRank}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{s.instructorName}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="px-3 py-1.5 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition"
                          aria-label={`Edit ${s.name || s.title || 'subject'}`}
                        >Edit</button>
                        <button
                          disabled={deletingId === s.id}
                          onClick={() => handleDelete(s)}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          aria-label={`Remove ${s.name || s.title || 'subject'}`}
                        >{deletingId === s.id ? 'Deleting...' : 'Remove'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet View */}
          <div className="hidden md:block lg:hidden bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left bg-neutral-50">
                  <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Subject <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('class')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Class <SortIcon field="class" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('svcNumber')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Service No <SortIcon field="svcNumber" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    <button onClick={() => handleSort('instructor')} className="flex items-center gap-1 hover:text-indigo-600 transition">
                      Instructor <SortIcon field="instructor" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-sm text-neutral-600 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSubjects.map((s) => (
                  <tr key={s.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-black text-sm">{s.name ?? s.title ?? 'Untitled'}</div>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs">{s.className}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm text-neutral-700">{s.instructorSvcNumber}</div>
                      <div className="text-xs text-neutral-500">{s.instructorRank}</div>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-700">{s.instructorName}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-stretch gap-1.5">
                        <button
                          onClick={() => openEdit(s)}
                          className="px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition whitespace-nowrap text-center"
                        >Edit</button>
                        <button
                          disabled={deletingId === s.id}
                          onClick={() => handleDelete(s)}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-xs text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap text-center"
                        >{deletingId === s.id ? 'Deleting...' : 'Remove'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {paginatedSubjects.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                <div className="space-y-3">
                  <div>
                    <div className="font-medium text-black text-lg">{s.name ?? s.title ?? 'Untitled'}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-24 flex-shrink-0">Class:</span>
                      <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs">{s.className}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-24 flex-shrink-0">Service No:</span>
                      <span className="text-sm text-neutral-700">{s.instructorSvcNumber}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-24 flex-shrink-0">Rank:</span>
                      <span className="text-sm text-neutral-700">{s.instructorRank}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-24 flex-shrink-0">Instructor:</span>
                      <span className="text-sm text-neutral-700">{s.instructorName}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-neutral-100">
                    <button
                      onClick={() => openEdit(s)}
                      className="flex-1 px-3 py-2 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition"
                    >Edit</button>
                    <button
                      disabled={deletingId === s.id}
                      onClick={() => handleDelete(s)}
                      className="flex-1 px-3 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >{deletingId === s.id ? 'Deleting...' : 'Remove'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Results info */}
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> subjects
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2">
              {/* Previous button */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const pages = []
                  const maxVisible = 5

                  if (totalPages <= maxVisible) {
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                            page === i
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }
                  } else {
                    // Always show first page
                    pages.push(
                      <button
                        key={1}
                        onClick={() => setPage(1)}
                        className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                          page === 1
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        1
                      </button>
                    )

                    // Show ellipsis if needed
                    if (page > 3) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }

                    // Show pages around current page
                    const start = Math.max(2, page - 1)
                    const end = Math.min(totalPages - 1, page + 1)
                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                            page === i
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }

                    // Show ellipsis if needed
                    if (page < totalPages - 2) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }

                    // Always show last page
                    pages.push(
                      <button
                        key={totalPages}
                        onClick={() => setPage(totalPages)}
                        className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition ${
                          page === totalPages
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              {/* Next button */}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>

              {/* Page size selector */}
              <div className="ml-2 flex items-center gap-2">
                <span className="text-sm text-neutral-600 hidden sm:inline">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="border border-neutral-200 rounded-lg px-2 py-1 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl">
            <div ref={modalRef} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add subject to class</h4>
                </div>
                <button type="button" aria-label="Close" onClick={closeModal} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <form onSubmit={handleAddSubject} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                <input placeholder="Subject name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                <input placeholder="Subject code" value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black" />
                  <select value={form.class_obj} onChange={(e) => setForm({ ...form, class_obj: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black">
                  <option value="">— Select class —</option>
                  {classes.filter(c => showInactive || c.is_active).map(cl => <option key={cl.id} value={cl.id}>{cl.name || cl.class_code}</option>)}
                </select>
                <textarea placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black md:col-span-3" rows={3} />
                <select value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} className="p-2 rounded-md border border-neutral-200 text-black">
                  <option value="">— Select instructor —</option>
                  {instructors.map(ins => <option key={ins.id} value={ins.id}>{ins.full_name || ins.username}</option>)}
                </select>

                <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                  <button type="button" onClick={closeModal} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{isSaving ? 'Saving...' : 'Add subject'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <form onSubmit={submitEdit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit subject</h4>
                  <p className="text-sm text-neutral-500">Update subject details.</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <div className="mt-4">
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Name</div>
                  <input value={editForm.name} onChange={(e) => handleEditChange('name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Code</div>
                  <input value={editForm.code} onChange={(e) => handleEditChange('code', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Instructor</div>
                  <select value={editForm.instructor} onChange={(e) => handleEditChange('instructor', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                    <option value="">Unassigned</option>
                    {instructors.map((ins) => (
                      <option key={ins.id} value={ins.id}>{ins.full_name || ins.name || `${ins.first_name || ''} ${ins.last_name || ''}`}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Confirm delete</h4>
              <p className="text-sm text-neutral-600 mt-2">Are you sure you want to delete <strong>{confirmDelete.name || confirmDelete.subject_code || confirmDelete.code || confirmDelete.id}</strong>? This action cannot be undone.</p>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm transition">Cancel</button>
                <button onClick={() => performDelete(confirmDelete)} disabled={deletingId === confirmDelete.id} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === confirmDelete.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}