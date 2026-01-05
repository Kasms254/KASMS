import React, { useState, useMemo, useEffect } from 'react'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminInstructors() {
  const toast = useToast()
  const reportError = (msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    console.error(msg)
  }
  const [instructors, setInstructors] = useState([])
  const [classesList, setClassesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)
  // edit/delete UI state
  const [editingInstructor, setEditingInstructor] = useState(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', svc_number: '', email: '', phone_number: '', is_active: true })
  const [editLoading, setEditLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // fetch instructors
  useEffect(() => {
    let mounted = true
    // Fetch instructors and classes in parallel so we can show assigned classes
    Promise.all([api.getInstructors(), api.getClasses()])
      .then(([insData, classesData]) => {
        if (!mounted) return
        if (Array.isArray(insData)) setInstructors(insData)
        else if (insData && Array.isArray(insData.results)) setInstructors(insData.results)
        else setInstructors(insData || [])

        // classesData may be paginated (results) or an array
        const classes = Array.isArray(classesData) ? classesData : (classesData && Array.isArray(classesData.results) ? classesData.results : classesData || [])
        setClassesList(classes)
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

  const filtered = useMemo(() => {
    if (!debouncedQuery) return instructors
    const q = debouncedQuery.toLowerCase()
    return instructors.filter((it) => {
      const full = (it.full_name || `${it.first_name || ''} ${it.last_name || ''}` || '').toLowerCase()
      return (
        full.includes(q) ||
        (it.svc_number || '').toLowerCase().includes(q) ||
        (it.email || '').toLowerCase().includes(q) ||
        (it.phone_number || '').toLowerCase().includes(q)
      )
    })
  }, [instructors, debouncedQuery])

  function handleDelete(it) {
    setConfirmDelete(it)
  }

  async function performDelete(it) {
    if (!it) return
    setDeletingId(it.id)
    try {
      await api.deleteUser(it.id)
      setInstructors((s) => s.filter((x) => x.id !== it.id))
      setConfirmDelete(null)
    } catch (err) {
      setError(err)
      reportError('Failed to delete instructor: ' + (err.message || String(err)))
    } finally {
      setDeletingId(null)
    }
  }

  function openEdit(it) {
    setEditingInstructor(it)
    setEditForm({
      first_name: it.first_name || '',
      last_name: it.last_name || '',
      svc_number: it.svc_number || '',
      email: it.email || '',
      phone_number: it.phone_number || '',
      rank: it.rank || it.rank_display || '',
      is_active: !!it.is_active,
    })
  }

  function closeEdit() {
    setEditingInstructor(null)
    setEditForm({ first_name: '', last_name: '', svc_number: '', email: '', phone_number: '', is_active: true, rank: '' })
  }

  function handleEditChange(k, v) {
    setEditForm((f) => ({ ...f, [k]: v }))
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingInstructor) return
    setEditLoading(true)
    try {
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        svc_number: editForm.svc_number,
        email: editForm.email,
        phone_number: editForm.phone_number,
        rank: editForm.rank || undefined,
        is_active: editForm.is_active,
      }
      const updated = await api.partialUpdateUser(editingInstructor.id, payload)
      const norm = {
        id: updated.id,
        first_name: updated.first_name,
        last_name: updated.last_name,
        full_name: updated.full_name || `${updated.first_name || ''} ${updated.last_name || ''}`.trim(),
        svc_number: updated.svc_number,
        email: updated.email,
        phone_number: updated.phone_number,
        rank: updated.rank || updated.rank_display || '',
        role: updated.role,
        role_display: updated.role_display,
        is_active: updated.is_active,
        created_at: updated.created_at,
      }
      setInstructors((s) => s.map((x) => (x.id === norm.id ? { ...x, ...norm } : x)))
      closeEdit()
    } catch (err) {
      setError(err)
      reportError('Failed to update instructor: ' + (err.message || String(err)))
    } finally {
      setEditLoading(false)
    }
  }

  function downloadCSV() {
    // Service No first, then Rank, Name, then the rest
    const rows = [['Service No', 'Rank', 'Name', 'Email', 'Phone', 'Role', 'Active', 'Created']]
    const list = filtered
    list.slice(0, visibleCount).forEach((it) => {
      const svc = it.svc_number || ''
      const name = it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || '')
      const email = it.email || ''
      const phone = it.phone_number || ''
      const role = it.role_display || it.role || ''
      const active = it.is_active ? 'Yes' : 'No'
      const created = it.created_at ? new Date(it.created_at).toLocaleString() : ''
      rows.push([svc, (it.rank || it.rank_display) || '', name, email, phone, role, active, created])
    })

    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'instructors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function getInstructorClasses(instId) {
    if (!classesList || classesList.length === 0) return []
    return classesList.filter((c) => {
      // backend may return instructor as id or nested object
      const iid = c.instructor && typeof c.instructor === 'object' ? c.instructor.id : c.instructor
      // Only return active classes
      return String(iid) === String(instId) && c.is_active
    })
  }

  function loadMore() {
    setVisibleCount((v) => v + 50)
  }

  return (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Instructors</h2>
          <p className="text-sm text-neutral-500">Manage instructors — quick table view</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="px-3 py-2 rounded-md bg-green-600 text-sm text-white hover:bg-green-700 transition shadow-sm whitespace-nowrap">Download CSV</button>
        </div>
      </header>

      <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search instructors..." className="flex-1 border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        <button onClick={() => setDebouncedQuery(searchTerm.trim())} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition whitespace-nowrap">Search</button>
      </div>

      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-center">Error loading instructors: {error.message || String(error)}</div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading instructors…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No instructors yet.</div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto max-w-full">
            <table className="w-full table-fixed">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-normal">Service No</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-normal">Rank</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-normal">Name</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-normal">Phone</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-normal">Classes</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, visibleCount).map((it) => (
                  <tr key={it.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-700">{it.svc_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{it.rank || it.rank_display || '-'}</td>
                    <td className="px-4 py-3 ">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {initials(it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || ''))}
                        </div>
                        <div>
                          <div className="font-medium text-black">{it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || '-')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-normal">{it.phone_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-normal break-words">
                      {(() => {
                        const cls = getInstructorClasses(it.id)
                        if (!cls || cls.length === 0) return '-'
                        // show up to 3 classes, display class name
                        const labels = cls.slice(0, 3).map((c) => {
                          return c.name || c.class_obj_name || '-'
                        })
                        return (
                          <div className="flex flex-wrap gap-2">
                            {labels.map((l, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">{l}</span>
                            ))}
                            {cls.length > 3 ? <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full">+{cls.length - 3} more</span> : null}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(it)} className="px-3 py-1 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition">Edit</button>
                        <button disabled={deletingId === it.id} onClick={() => handleDelete(it)} className="px-3 py-1 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === it.id ? 'Deleting...' : 'Remove'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filtered.slice(0, visibleCount).map((it) => (
              <div key={it.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                {/* Header with avatar and name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base shadow-lg flex-shrink-0">
                    {initials(it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || ''))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-black truncate">{it.first_name ? `${it.first_name} ${it.last_name}` : (it.full_name || it.svc_number || '-')}</div>
                    <div className="text-xs text-neutral-500">{it.svc_number || '-'}</div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  {it.rank || it.rank_display ? (
                    <div className="flex items-start">
                      <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Rank:</span>
                      <span className="text-sm text-neutral-700">{it.rank || it.rank_display}</span>
                    </div>
                  ) : null}

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Phone:</span>
                    <span className="text-sm text-neutral-700">{it.phone_number || '-'}</span>
                  </div>

                  <div className="flex items-start">
                    <span className="text-xs text-neutral-500 w-20 flex-shrink-0">Classes:</span>
                    <div className="flex-1">
                      {(() => {
                        const cls = getInstructorClasses(it.id)
                        if (!cls || cls.length === 0) return <span className="text-sm text-neutral-700">-</span>
                        const labels = cls.slice(0, 3).map((c) => {
                          return c.name || c.class_obj_name || '-'
                        })
                        return (
                          <div className="flex flex-wrap gap-2">
                            {labels.map((l, idx) => (
                              <span key={idx} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">{l}</span>
                            ))}
                            {cls.length > 3 ? <span className="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full">+{cls.length - 3} more</span> : null}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-neutral-100">
                  <button onClick={() => openEdit(it)} className="flex-1 px-3 py-2 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition">Edit</button>
                  <button disabled={deletingId === it.id} onClick={() => handleDelete(it)} className="flex-1 px-3 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === it.id ? 'Deleting...' : 'Remove'}</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {filtered.length > visibleCount && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} className="px-3 py-2 rounded-md border bg-white text-sm">Load more</button>
        </div>
      )}
      {/* Edit modal */}
      {editingInstructor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeEdit} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <form onSubmit={submitEdit} className="transform transition-all duration-200 bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit instructor</h4>
                  <p className="text-sm text-neutral-500">Update instructor details.</p>
                </div>
                <button type="button" aria-label="Close" onClick={closeEdit} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition flex-shrink-0">✕</button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <div className="text-sm text-neutral-600 mb-1">First name</div>
                  <input value={editForm.first_name} onChange={(e) => handleEditChange('first_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </label>

                <label className="block">
                  <div className="text-sm text-neutral-600 mb-1">Last name</div>
                  <input value={editForm.last_name} onChange={(e) => handleEditChange('last_name', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </label>

                <label className="block">
                  <div className="text-sm text-neutral-600 mb-1">Service No</div>
                  <input value={editForm.svc_number} onChange={(e) => handleEditChange('svc_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </label>

                <label className="block">
                  <div className="text-sm text-neutral-600 mb-1">Rank</div>
                  <select value={editForm.rank || ''} onChange={(e) => handleEditChange('rank', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm">
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

                <label className="block">
                  <div className="text-sm text-neutral-600 mb-1">Email</div>
                  <input value={editForm.email} onChange={(e) => handleEditChange('email', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </label>

                <label className="block">
                  <div className="text-sm text-neutral-600 mb-1">Phone</div>
                  <input value={editForm.phone_number} onChange={(e) => handleEditChange('phone_number', e.target.value)} className="w-full border border-neutral-200 rounded px-3 py-2 text-black text-sm" />
                </label>

                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={!!editForm.is_active} onChange={(e) => handleEditChange('is_active', e.target.checked)} />
                  <span className="text-sm text-neutral-600">Active</span>
                </label>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-4">
                <button type="button" onClick={closeEdit} className="w-full sm:w-auto px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={editLoading} className="w-full sm:w-auto px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{editLoading ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Confirm delete</h4>
              <p className="text-sm text-neutral-600 mt-2">Are you sure you want to delete <strong>{confirmDelete.first_name ? `${confirmDelete.first_name} ${confirmDelete.last_name}` : (confirmDelete.full_name || confirmDelete.svc_number || confirmDelete.id)}</strong>? This action cannot be undone.</p>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-4">
                <button onClick={() => setConfirmDelete(null)} className="w-full sm:w-auto px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button onClick={() => performDelete(confirmDelete)} disabled={deletingId === confirmDelete.id} className="w-full sm:w-auto px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">{deletingId === confirmDelete.id ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Edit modal and confirm-delete modal appended outside main component render


