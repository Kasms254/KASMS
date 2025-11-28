import React, { useEffect, useState } from 'react'
import useToast from '../../hooks/useToast'
import ConfirmModal from '../../components/ConfirmModal'
import * as api from '../../lib/api'

export default function TeachingAssignments() {
  const toast = useToast()
  const [instructors, setInstructors] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // Search UX mirrors AdminStudents: a typing input (searchTerm) and a debouncedQuery that triggers searches
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [ordering, setOrdering] = useState('class')
  const [loadingAssignments, setLoadingAssignments] = useState(false)

  const [form, setForm] = useState({ instructor: '', class: '', subject: '' })
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState({ open: false, id: null, label: '' })
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [ins, cls, subs] = await Promise.all([
          api.getInstructors(),
          // only active classes
          api.getClasses('is_active=true'),
          // don't fetch subjects here — we'll load paginated assignments below
          api.getSubjects('is_active=true'),
        ])
        setInstructors(Array.isArray(ins) ? ins : [])
        setClasses(Array.isArray(cls) ? cls : [])
        // subjects can include instructor field; existing assignments are subjects with instructor set
        setAssignments(Array.isArray(subs) ? (subs.filter(s => s.instructor)) : [])
      } catch (err) {
        toast?.push?.({ message: err.message || 'Failed to load initial data', type: 'error' })
      }
    })()
  }, [toast])

  // Fetch paginated subjects (assignments) based on filters
  async function fetchAssignments({ page: p = page, pageSize: ps = pageSize, search: searchParam = debouncedSearch, ordering: ord = ordering } = {}) {
    setLoadingAssignments(true)
    try {
      const orderMap = {
        class: 'class_obj__name',
        subject: 'name',
      }
      const params = new URLSearchParams()
      params.append('is_active', 'true')
  if (searchParam) params.append('search', searchParam)
      if (ord && orderMap[ord]) params.append('ordering', orderMap[ord])
      params.append('page', p)
      params.append('page_size', ps)

      const data = await api.getSubjectsPaginated(params.toString())
      // data expected { count, results: [...] }
      const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : [])
  // If a search query exists, apply a client-side filter that includes instructor svc_number
  const q = (searchParam || '').toString().trim().toLowerCase()
      const matchesQuery = (s) => {
        if (!q) return true
        const instr = s.instructor || {}
        const instrName = (s.instructor_name || (instr.first_name ? `${instr.first_name} ${instr.last_name || ''}` : '') || '').toString().toLowerCase()
        const instrSvc = (s.instructor_svc || instr.svc_number || instr.svc || '').toString().toLowerCase()
        const instrRank = (s.instructor_rank || instr.rank || instr.rank_display || '').toString().toLowerCase()
        const subj = (s.name || s.title || '').toString().toLowerCase()
        const cls = (s.class_name || s.class_obj?.name || '').toString().toLowerCase()
        return instrName.includes(q) || instrSvc.includes(q) || subj.includes(q) || cls.includes(q) || instrRank.includes(q)
      }

      const filtered = q ? results.filter(matchesQuery) : results
      setAssignments(filtered.filter(s => s.instructor))
      setTotalCount(typeof data.count === 'number' ? data.count : filtered.length)
      setPage(p)
      setPageSize(ps)
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to load assignments', type: 'error' })
    } finally {
      setLoadingAssignments(false)
    }
  }

  useEffect(() => {
    // initial paginated load
    fetchAssignments({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // debounce search input to avoid firing on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // when debounced search or ordering changes, reload page 1
  useEffect(() => {
    fetchAssignments({ page: 1, search: debouncedSearch, ordering })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, ordering])

  async function onClassChange(classId) {
    setForm({ ...form, class: classId, subject: '' })
    if (!classId) {
      setSubjects([])
      return
    }

    try {
      const resp = await api.getClassSubjects(classId)
      // ClassViewSet.subjects returns { class, count, subjects }
      const subs = Array.isArray(resp?.subjects) ? resp.subjects : (Array.isArray(resp) ? resp : [])
      // filter out subjects already assigned for this class (subjects with instructor set)
      const available = subs.filter(s => !s.instructor)
      setSubjects(available)
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to load subjects for class', type: 'error' })
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.instructor || !form.class || !form.subject) {
      toast?.push?.({ message: 'Please select instructor, class and subject', type: 'warning' })
      return
    }
    setLoading(true)
    try {
      // use subject assign endpoint: /api/subjects/<id>/assign_instructor/
      await api.assignInstructorToSubject(form.subject, form.instructor)
      toast?.push?.({ message: 'Assignment created', type: 'success' })
  // refresh assignments (subjects with instructor set)
  await fetchAssignments({ page: 1 })
      // refresh available subjects for selected class
      await onClassChange(form.class)
      setForm({ instructor: '', class: '', subject: '' })
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to create assignment', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleRemoveClick(assignment) {
    setConfirm({ open: true, id: assignment.id, label: assignment.name || assignment.title || 'this assignment' })
  }

  async function confirmRemove() {
    if (!confirm.id) return
    setRemoving(true)
    try {
      await api.removeInstructorFromSubject(confirm.id)
      toast?.push?.({ message: 'Assignment removed', type: 'success' })
  await fetchAssignments({ page })
      if (form.class) await onClassChange(form.class)
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to remove assignment', type: 'error' })
    } finally {
      setRemoving(false)
      setConfirm({ open: false, id: null, label: '' })
    }
  }

  return (
    <div className="p-4 text-black">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">Teaching Assignments</h2>
        <p className="text-sm text-black">Assign instructors to subjects for a class</p>
      </div>

      <form className="bg-white p-4 rounded shadow mb-6" onSubmit={submit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-black mb-1">Instructor</label>
            <select
              value={form.instructor}
              onChange={(e) => setForm({ ...form, instructor: e.target.value })}
              className="w-full border rounded px-3 py-2 text-black"
            >
              <option value="">Select instructor</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.first_name ? `${i.first_name} ${i.last_name || ''}` : (i.svc_number || i.username)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-black mb-1">Class</label>
            <select
              value={form.class}
              onChange={(e) => onClassChange(e.target.value)}
              className="w-full border rounded px-3 py-2 text-black"
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.title || `Class ${c.id}`}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-black mb-1">Subject</label>
            <select
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full border rounded px-3 py-2 text-black"
              disabled={!form.class}
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <button disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? 'Saving...' : 'Create assignment'}
          </button>
        </div>
      </form>

      <div className="bg-white p-4 rounded shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-black">Existing assignments</h3>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                placeholder="Search subjects or instructors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <select value={ordering} onChange={(e) => setOrdering(e.target.value)} className="border border-neutral-200 rounded px-3 py-2 text-black">
              <option value="class">Sort by class</option>
              <option value="subject">Sort by subject</option>
            </select>
            <button onClick={() => setDebouncedSearch(searchTerm.trim())} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm">Search</button>
            <button onClick={() => { setSearchTerm(''); setDebouncedSearch('') }} className="px-3 py-2 rounded-md border bg-indigo-600 text-white text-sm">Clear</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-black">
                <th className="py-2">Service No</th>
                <th className="py-2">Rank</th>
                <th className="py-2">Instructor</th>
                <th className="py-2">Class</th>
                <th className="py-2">Subject</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(!assignments || assignments.length === 0) && !loadingAssignments && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-black">No assignments yet</td>
                </tr>
              )}
              {loadingAssignments && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-black">Loading...</td>
                </tr>
              )}
              {assignments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="py-2 text-black">{a.instructor?.svc_number || a.instructor?.svc || a.instructor_svc || (typeof a.instructor === 'string' ? a.instructor : '-')}</td>
                  <td className="py-2 text-black">{a.instructor?.rank || a.instructor?.rank_display || a.instructor_rank || '-'}</td>
                  <td className="py-2 text-black">{
                    // Prefer serializer-provided instructor_name (string). If backend returned a nested object,
                    // fall back to building the full name; otherwise show svc_number or id.
                    a.instructor_name || (a.instructor?.first_name ? `${a.instructor.first_name} ${a.instructor.last_name || ''}` : (a.instructor?.svc_number || a.instructor))
                  }</td>
                  <td className="py-2 text-black">{a.class_name || a.class_obj?.name || a.class_obj?.title || (a.class && (a.class.name || a.class))}</td>
                  <td className="py-2 text-black">{a.name || a.title}</td>
                  <td className="py-2">
                    <button onClick={() => handleRemoveClick(a)} className="text-red-600 hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between mt-3">
          <div className="text-sm text-gray-600">Total: {totalCount}</div>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => fetchAssignments({ page: page - 1 })} className="px-2 py-1 border rounded">Prev</button>
            <div className="px-2">Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize) || 1)}</div>
            <button disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => fetchAssignments({ page: page + 1 })} className="px-2 py-1 border rounded">Next</button>
            <select value={pageSize} onChange={(e) => fetchAssignments({ page: 1, pageSize: Number(e.target.value) })} className="border rounded px-2 py-1">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>
        </div>
      </div>
      
      <ConfirmModal
        open={confirm.open}
        title="Remove assignment"
        message={`Remove ${confirm.label}?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={confirmRemove}
        onCancel={() => setConfirm({ open: false, id: null, label: '' })}
        loading={removing}
      />
    </div>
  )
}
