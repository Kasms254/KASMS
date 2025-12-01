import React, { useState, useMemo, useEffect } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminStudents() {
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    console.error(msg)
  }
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // edit / delete UI state
  const [editingStudent, setEditingStudent] = useState(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', is_active: true, class_obj: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [classesList, setClassesList] = useState([])
  const [currentEnrollment, setCurrentEnrollment] = useState(null)
  const [enrollmentsList, setEnrollmentsList] = useState([])
  

  // fetch students from API on mount
  useEffect(() => {
    let mounted = true
    api
      .getStudents()
      .then((data) => {
        if (!mounted) return
        // unwrap paginated responses
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : data || [])
        // normalize shape used by this component
        const mapped = list.map((u) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          full_name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          // normalize svc_number to a string so client-side searches are consistent
          svc_number: u.svc_number != null ? String(u.svc_number) : '',
          email: u.email,
          phone_number: u.phone_number,
          rank: u.rank || u.rank_display || '',
          is_active: u.is_active,
          created_at: u.created_at,
          // backend may include class name under different keys; fall back to 'Unassigned'
          className: u.class_name || u.class || u.class_obj_name || u.className || 'Unassigned',
        }))
        setStudents(mapped)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const groups = useMemo(() => {
    const g = {}
    students.forEach((s) => {
      const k = s.className || s.class_name || 'Unassigned'
      if (!g[k]) g[k] = []
      g[k].push(s)
    })
    return g
  }, [students])

  // Accordion + search state
  const [openSections, setOpenSections] = useState({})
  const [visibleCounts, setVisibleCounts] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // debounce query to avoid heavy work on each keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  function toggleSection(name) {
    setOpenSections((s) => {
      const isOpen = !!s[name]
      // If already open, close it. If closed, open only this one (close others)
      if (isOpen) return { ...s, [name]: false }
      return { [name]: true }
    })
    // when opening, ensure visible count exists
    setVisibleCounts((c) => ({ ...c, [name]: c[name] || 50 }))
  }

  function loadMore(name) {
    setVisibleCounts((c) => ({ ...c, [name]: (c[name] || 50) + 50 }))
  }

  // compute filtered groups based on debounced query
    const filteredGroups = useMemo(() => {
    if (!debouncedQuery) return groups
    const q = debouncedQuery.toLowerCase()
    const res = {}
    Object.keys(groups).forEach((cls) => {
      const matches = groups[cls].filter((st) =>
        (st.name || '').toLowerCase().includes(q) ||
        // ensure svc_number and phone are strings before lowercasing (may be numeric from API)
        String(st.svc_number || '').toLowerCase().includes(q) ||
        (st.email || '').toLowerCase().includes(q) ||
        String(st.phone_number || '').toLowerCase().includes(q) ||
        (st.className || '').toLowerCase().includes(q)
      )
      if (matches.length) res[cls] = matches
    })
    return res
  }, [groups, debouncedQuery])

  const totalMatches = useMemo(() => {
    if (!debouncedQuery) return 0
    return Object.values(filteredGroups).reduce((acc, arr) => acc + arr.length, 0)
  }, [filteredGroups, debouncedQuery])

  

  function downloadCSV() {
    // Export Service No first, then Rank, Name, Class, Email, Phone, Active, Created
  const rows = [['Service No', 'Rank', 'Name', 'Class', 'Email', 'Phone', 'Active', 'Created']]

    const classes = Object.keys(groups).sort()
    classes.forEach((c) => {
  groups[c].forEach((st) => rows.push([st.svc_number || '', st.rank || '', st.name || '', c, st.email || '', st.phone_number || '', st.is_active ? 'Yes' : 'No', st.created_at ? new Date(st.created_at).toLocaleString() : '']))
    })

    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ----- Edit / Delete handlers -----
  function openEdit(st) {
    setEditingStudent(st)
    setEditForm({
      first_name: st.first_name || '',
      last_name: st.last_name || '',
      email: st.email || '',
      phone_number: st.phone_number || '',
      svc_number: st.svc_number || '',
      is_active: !!st.is_active,
      rank: st.rank || st.rank_display || '',
      // ensure class_obj is a string (select values are strings) and fall back to empty
      class_obj: st.class_obj ? String(st.class_obj) : '',
    })
    // fetch classes (if not loaded) and the student's enrollments to get active class
    if (classesList.length === 0) {
      api.getClasses().then((c) => {
        const list = Array.isArray(c) ? c : (c && c.results) || []
        // normalize ids to strings so <select> option values always match
        const normalized = list.map((cls) => ({ ...cls, id: cls.id != null ? String(cls.id) : cls.id }))
        setClassesList(normalized)
      }).catch(() => {})
    }
    api.getUserEnrollments(st.id).then((d) => {
      const list = Array.isArray(d) ? d : (d && Array.isArray(d.results) ? d.results : d && d.results ? d.results : (d && d.enrollments) || [])
      // store full list (used to detect existing enrollments)
      setEnrollmentsList(list)
      // pick the active enrollment if any
      const active = (list && list.find((e) => e.is_active)) || null
      setCurrentEnrollment(active)
      if (active && active.class_obj) {
        // backend may return a pk or nested object; normalize to primitive id
        const classId = typeof active.class_obj === 'object' && active.class_obj !== null ? active.class_obj.id : active.class_obj
        // keep select values as strings so they match option values
        setEditForm((f) => ({ ...f, class_obj: classId != null ? String(classId) : '' }))
      }
    }).catch(() => { setEnrollmentsList([]); setCurrentEnrollment(null) })
  }

  function closeEdit() {
    setEditingStudent(null)
    setEditForm({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', is_active: true, rank: '' })
  }

  function handleEditChange(key, value) {
    setEditForm((f) => ({ ...f, [key]: value }))
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingStudent) return
    setEditLoading(true)
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        svc_number: editForm.svc_number,
        rank: editForm.rank || undefined,
        is_active: editForm.is_active,
      }
      const updated = await api.partialUpdateUser(editingStudent.id, payload)
      // normalize returned user into the shape used by this component
      const norm = {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        full_name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        svc_number: updated.svc_number,
        email: updated.email,
        rank: updated.rank || updated.rank_display || '',
        phone_number: updated.phone_number,
        is_active: updated.is_active,
        created_at: updated.created_at,
        className: updated.class_name || updated.class || updated.class_obj_name || updated.className || 'Unassigned',
      }
      setStudents((s) => s.map((x) => (x.id === norm.id ? norm : x)))
      // if class changed, create a new enrollment
      try {
        const selectedClass = editForm.class_obj
        const currentClassId = currentEnrollment && currentEnrollment.class_obj ? (typeof currentEnrollment.class_obj === 'object' ? currentEnrollment.class_obj.id : currentEnrollment.class_obj) : null
        if (selectedClass && String(selectedClass) !== String(currentClassId)) {
          // check if there's an existing enrollment record for this class
          const existing = enrollmentsList && enrollmentsList.find((e) => {
            const cid = typeof e.class_obj === 'object' && e.class_obj !== null ? e.class_obj.id : e.class_obj
            return String(cid) === String(selectedClass)
          })

          // Before creating/reactivating, withdraw any other active enrollments so the student
          // is active in only one class at a time on the backend.
          const activeOthers = (enrollmentsList || []).filter((e) => {
            const cid = typeof e.class_obj === 'object' && e.class_obj !== null ? e.class_obj.id : e.class_obj
            return e.is_active && String(cid) !== String(selectedClass)
          })
          for (const a of activeOthers) {
            try {
              await api.withdrawEnrollment(a.id)
              // update local copy
              setEnrollmentsList((lst) => lst.map((x) => x.id === a.id ? { ...x, is_active: false } : x))
            } catch (err) {
              // non-fatal: continue but inform user
              console.warn('Failed to withdraw previous enrollment', err)
            }
          }

          if (existing) {
            if (existing.is_active) {
              // already active — nothing to do
            } else {
              // reactivate existing enrollment instead of creating duplicate
              await api.reactivateEnrollment(existing.id)
              // update local state to reflect reactivation
              setCurrentEnrollment({ ...existing, is_active: true })
              setEnrollmentsList((lst) => lst.map((e) => e.id === existing.id ? { ...e, is_active: true } : e))
            }
          } else {
            // POST enrollment { student, class_obj }
            await api.addEnrollment({ student: editingStudent.id, class_obj: selectedClass })
          }

          // update local student's className from classesList if available
          const cls = classesList.find((c) => String(c.id) === String(selectedClass))
          if (cls) {
            setStudents((s) => s.map((x) => (x.id === norm.id ? { ...x, className: cls.name } : x)))
          }
        }
          } catch (err) {
            // enrollment error: inform user via toast
            reportError('Failed to update enrollment: ' + (err.message || String(err)))
          }
      closeEdit()
    } catch (err) {
      setError(err)
      // simple user feedback
      reportError('Failed to update student: ' + (err.message || String(err)))
    } finally {
      setEditLoading(false)
    }
  }

  // show confirm modal (instead of window.confirm)
  function handleDelete(st) {
    setConfirmDelete(st)
  }

  async function performDelete(st) {
    if (!st) return
    setDeletingId(st.id)
    try {
      await api.deleteUser(st.id)
      setStudents((s) => s.filter((x) => x.id !== st.id))
      setConfirmDelete(null)
    } catch (err) {
      setError(err)
      // prefer toast later; keep simple for now
      reportError('Failed to delete student: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">Students</h2>
          <p className="text-sm text-neutral-500">Manage student records by class</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="px-3 py-2 rounded-md border border-neutral-200 bg-green-600 text-white hover:shadow">Download CSV</button>
        </div>
      </header>

      <section className="grid gap-6">
        {/* Search bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search students or classes..."
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
          <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-center">Error loading students: {error.message || String(error)}</div>
        ) : loading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading students…</div>
        ) : Object.keys(groups).length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No students yet. Use "Add student" to create one.</div>
        ) : null}

  <div className="flex flex-col gap-6">
          {Object.keys(filteredGroups).length === 0 && !debouncedQuery && (
            <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 col-span-full text-center">No students yet. Use "Add student" to create one.</div>
          )}

          {Object.keys(filteredGroups).sort().map((className) => {
            const list = filteredGroups[className]
            const isOpen = !!openSections[className]
            const visible = visibleCounts[className] || 50
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
                    <span className="text-sm bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{list.length} students</span>
                  </div>
                  <div className="text-sm text-neutral-500">{isOpen ? 'Collapse' : 'Expand'}</div>
                </button>

                {isOpen && (
                  <div className="p-4">
                    <div className="overflow-x-auto">
                      <table className="min-w-full table-auto">
                        <thead>
                          <tr className="text-left">
                            <th className="px-4 py-2 text-sm text-neutral-600">Service No</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Rank</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Name</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Email</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Phone</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Active</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Created</th>
                            <th className="px-4 py-2 text-sm text-neutral-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.slice(0, visible).map((st) => (
                            <tr key={st.id} className="border-t last:border-b hover:bg-neutral-50">
                              <td className="px-4 py-3 text-sm text-neutral-700">{st.svc_number || '-'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-700">{st.rank || '-'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">{initials(st.name || st.svc_number)}</div>
                                  <div>
                                    <div className="font-medium text-black">{st.name || '-'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-700">{st.email || '-'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-700">{st.phone_number || '-'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-700">{st.is_active ? 'Yes' : 'No'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-700">{st.created_at ? new Date(st.created_at).toLocaleString() : '-'}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => openEdit(st)} className="px-3 py-1 rounded-md border bg-indigo-600 text-sm text-white">Edit</button>
                                  <button disabled={deletingId === st.id} onClick={() => handleDelete(st)} className="px-3 py-1 rounded-md border bg-red-600 text-sm text-white">{deletingId === st.id ? 'Deleting...' : 'Remove'}</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {list.length > visible && (
                      <div className="mt-3 text-center">
                        <button onClick={() => loadMore(className)} className="px-3 py-1 rounded-md border bg-white text-sm">Load more</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeEdit} />

          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <form onSubmit={submitEdit} className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit student</h4>
                  <p className="text-sm text-neutral-500">Update student details (class assignment is handled via enrollments).</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-red-700 hover:bg-neutral-100">✕</button>
              </div>

              <div className="mt-4">
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">First name</div>
                  <input value={editForm.first_name} onChange={(e) => handleEditChange('first_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Last name</div>
                  <input value={editForm.last_name} onChange={(e) => handleEditChange('last_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Service No</div>
                  <input value={editForm.svc_number} onChange={(e) => handleEditChange('svc_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Rank</div>
                  <select value={editForm.rank || ''} onChange={(e) => handleEditChange('rank', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                    <option value="">Unassigned</option>
                    <option value="general">General</option>
                    <option value="lieutenant colonel">Lieutenant Colonel</option>
                    <option value="major">Major</option>
                    <option value="captain">Captain</option>
                    <option value="lieutenant">Lieutenant</option>
                    <option value="warrant_officer">Warrant Officer I</option>
                    <option value="warrant_officer">Warrant Officer II</option>
                    <option value="seniorsergeant">Senior Sergeant</option>
                    <option value="sergeant">Sergeant</option>
                    <option value="corporal">Corporal</option>
                    <option value="lance_corporal">Lance Corporal</option>
                    <option value="private">Private</option>
                  </select>
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Class</div>
                  <select value={editForm.class_obj || ''} onChange={(e) => handleEditChange('class_obj', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black">
                    <option value="">Unassigned</option>
                    {classesList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Email</div>
                  <input value={editForm.email} onChange={(e) => handleEditChange('email', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Phone</div>
                  <input value={editForm.phone_number} onChange={(e) => handleEditChange('phone_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black" />
                </label>

                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={!!editForm.is_active} onChange={(e) => handleEditChange('is_active', e.target.checked)} />
                  <span className="text-sm text-neutral-600">Active</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-md border text-sm bg-red-600">Cancel</button>
                <button type="submit" disabled={editLoading} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm">{editLoading ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Confirm delete</h4>
              <p className="text-sm text-neutral-600 mt-2">Are you sure you want to delete <strong>{confirmDelete.name || confirmDelete.svc_number || confirmDelete.id}</strong>? This action cannot be undone.</p>

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
