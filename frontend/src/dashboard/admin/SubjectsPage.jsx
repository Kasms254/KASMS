import React, { useEffect, useState, useMemo } from 'react'
import * as api from '../../lib/api'


export default function SubjectsPage() {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [openSections, setOpenSections] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  // edit/delete state
  const [editingSubject, setEditingSubject] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', instructor: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [instructors, setInstructors] = useState([])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => {
    let mounted = true
    Promise.all([api.getClasses().catch(() => null), api.getSubjects().catch(() => null)])
      .then(([clsData, subjData]) => {
        if (!mounted) return
        const clsList = Array.isArray(clsData) ? clsData : (clsData && Array.isArray(clsData.results) ? clsData.results : clsData || [])
        const subjList = Array.isArray(subjData) ? subjData : (subjData && Array.isArray(subjData.results) ? subjData.results : subjData || [])
        setClasses(clsList)
        setSubjects(subjList)
        // fetch instructors for editing dropdown
        api.getInstructors().then((ins) => {
          if (!mounted) return
          const list = Array.isArray(ins) ? ins : (ins && Array.isArray(ins.results) ? ins.results : ins || [])
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

  const groups = useMemo(() => {
    // Map class name -> subjects[]
    const map = {}
    // index classes by id
    const byId = {}
    classes.forEach((c) => { byId[c.id] = c })

    subjects.forEach((s) => {
      const cid = s.class_obj || s.class || (s.class_obj_id ?? null)
      const cls = byId[cid]
      const name = cls ? (cls.name || cls.class_name) : (s.class_name || 'Unassigned')
      if (!map[name]) map[name] = []
      map[name].push(s)
    })

    // ensure classes with no subjects still show
    classes.forEach((c) => {
      const name = c.name || c.class_name || `Class ${c.id}`
      if (!map[name]) map[name] = []
    })

    return map
  }, [classes, subjects])

  const filteredGroups = useMemo(() => {
    if (!debouncedQuery) return groups
    const q = debouncedQuery.toLowerCase()
    const res = {}
    Object.keys(groups).forEach((cls) => {
      const matches = groups[cls].filter((s) => {
        return (s.name || s.title || '').toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)
      })
      if (cls.toLowerCase().includes(q) || matches.length) res[cls] = matches
    })
    return res
  }, [groups, debouncedQuery])

  function toggleSection(name) {
    setOpenSections((s) => ({ ...s, [name]: !s[name] }))
  }

  function openEdit(subj) {
    setEditingSubject(subj)
    setEditForm({
      name: subj.name || subj.title || '',
      code: subj.code || '',
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
  const payload = { name: editForm.name, code: editForm.code }
  if (editForm.instructor) payload.instructor = Number(editForm.instructor)
      const updated = await api.partialUpdateSubject(editingSubject.id, payload)
      // update local subjects list
      setSubjects((s) => s.map((x) => (x.id === updated.id ? updated : x)))
      closeEdit()
    } catch (err) {
      alert('Failed to update subject: ' + (err.message || String(err)))
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
      alert('Failed to delete subject: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  const totalMatches = useMemo(() => {
    if (!debouncedQuery) return 0
    return Object.values(filteredGroups).reduce((acc, arr) => acc + arr.length, 0)
  }, [filteredGroups, debouncedQuery])

  return (
    <div className="max-w-7xl mx-auto px-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">Subjects</h2>
          <p className="text-sm text-neutral-500">Browse subjects by class</p>
        </div>
      </header>

      <section className="grid gap-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search subjects or classes..."
              className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button onClick={() => setDebouncedQuery(searchTerm.trim())} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm">Search</button>
          <button onClick={() => { setSearchTerm(''); setDebouncedQuery('') }} className="px-3 py-2 rounded-md border bg-indigo-600 text-white text-sm">Clear</button>
        </div>

        {debouncedQuery ? (
          <div className="text-sm text-neutral-600">Found {totalMatches} result{totalMatches !== 1 ? 's' : ''} for "{debouncedQuery}"</div>
        ) : null}

        {error ? (
          <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-center">Error loading subjects: {error.message || String(error)}</div>
        ) : loading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading…</div>
        ) : Object.keys(groups).length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No classes or subjects yet.</div>
        ) : null}

        <div className="flex flex-col gap-6">
          {Object.keys(filteredGroups).sort().map((className) => {
            const list = filteredGroups[className]
            const isOpen = !!openSections[className]
            return (
              <div key={className} className="bg-white rounded-xl p-0 border border-neutral-200 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(className)}
                  className="w-full flex items-center justify-between p-4 hover:bg-neutral-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm text-neutral-500">Class</span>
                      <span className="text-lg font-medium text-black">{className}</span>
                    </div>
                    <span className="text-sm bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{(groups[className] || []).length} subjects</span>
                  </div>
                  <div className="text-sm text-neutral-500">{isOpen ? 'Collapse' : 'Expand'}</div>
                </button>

                {isOpen && (
                  <div className="p-4">
                    {(list || []).length === 0 ? (
                      <div className="text-sm text-neutral-500">No subjects in this class.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full table-auto">
                          <thead>
                            <tr className="text-left">
                              <th className="px-4 py-2 text-sm text-neutral-600">Name</th>
                              <th className="px-4 py-2 text-sm text-neutral-600">Code</th>
                              <th className="px-4 py-2 text-sm text-neutral-600">Instructor</th>
                              <th className="px-4 py-2 text-sm text-neutral-600 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((s) => (
                              <tr key={s.id} className="border-t last:border-b hover:bg-neutral-50">
                                <td className="px-4 py-3 text-sm text-neutral-700">{s.name ?? s.title ?? 'Untitled'}</td>
                                <td className="px-4 py-3 text-sm text-neutral-700">{s.code || '-'}</td>
                                <td className="px-4 py-3 text-sm text-neutral-700">{(s.instructor && (s.instructor.full_name || s.instructor.name)) || s.instructor_name || '-'}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => openEdit(s)} className="px-3 py-1 rounded-md border bg-indigo-600 text-sm text-white">Edit</button>
                                    <button disabled={deletingId === s.id} onClick={() => handleDelete(s)} className="px-3 py-1 rounded-md border bg-red-600 text-sm text-white">{deletingId === s.id ? 'Deleting...' : 'Remove'}</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {editingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeEdit} />

          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <form onSubmit={submitEdit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit subject</h4>
                  <p className="text-sm text-neutral-500">Update subject details.</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
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
                <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md border text-sm bg-red-600 text-white">Cancel</button>
                <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm">{editLoading ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Confirm delete</h4>
              <p className="text-sm text-neutral-600 mt-2">Are you sure you want to delete <strong>{confirmDelete.name || confirmDelete.code || confirmDelete.id}</strong>? This action cannot be undone.</p>

              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md border bg-indigo-600 text-sm">Cancel</button>
                <button onClick={() => performDelete(confirmDelete)} disabled={deletingId === confirmDelete.id} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm">{deletingId === confirmDelete.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
