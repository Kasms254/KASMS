import React, { useState, useMemo, useEffect, useRef } from 'react'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminInstructors() {
  const [instructors, setInstructors] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', department: '', email: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)
  const nameInputRef = useRef(null)

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => {
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => nameInputRef.current?.focus(), 0)
    function onKey(e) {
      if (e.key === 'Escape') setModalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [modalOpen])

  const filtered = useMemo(() => {
    if (!debouncedQuery) return instructors
    const q = debouncedQuery.toLowerCase()
    return instructors.filter((it) =>
      it.name.toLowerCase().includes(q) || (it.department || '').toLowerCase().includes(q) || (it.email || '').toLowerCase().includes(q)
    )
  }, [instructors, debouncedQuery])

  function openModal() {
    setForm({ name: '', department: '', email: '' })
    setModalOpen(true)
  }

  function addInstructor(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setInstructors((s) => [...s, { id: Date.now(), name: form.name.trim(), department: form.department.trim(), email: form.email.trim() }])
    setModalOpen(false)
  }

  function downloadCSV() {
    const rows = [['Name', 'Department', 'Email']]
    const list = filtered
    list.slice(0, visibleCount).forEach((it) => rows.push([it.name, it.department || '', it.email || '']))
    const csv = rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'instructors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function loadMore() {
    setVisibleCount((v) => v + 50)
  }

  return (
    <div className="max-w-7xl mx-auto px-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">Instructors</h2>
          <p className="text-sm text-neutral-500">Manage instructors — quick table view</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="px-3 py-2 rounded-md border border-neutral-200 bg-green-600 text-sm text-white hover:shadow">Download CSV</button>
          <button onClick={openModal} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm shadow hover:bg-indigo-700">Add instructor</button>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search instructors..." className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        <button onClick={() => setDebouncedQuery(searchTerm.trim())} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm">Search</button>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="min-w-full table-auto">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 text-sm text-neutral-600">Name</th>
              <th className="px-4 py-3 text-sm text-neutral-600">Department</th>
              <th className="px-4 py-3 text-sm text-neutral-600">Email</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visibleCount).map((it) => (
              <tr key={it.id} className="border-t last:border-b hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">{initials(it.name)}</div>
                    <div>
                      <div className="font-medium text-black">{it.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700">{it.department || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{it.email || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > visibleCount && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} className="px-3 py-2 rounded-md border bg-white text-sm">Load more</button>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <form onSubmit={addInstructor} className="relative z-10 w-full max-w-md bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg text-black font-medium">Add instructor</h4>
                <p className="text-sm text-neutral-500">Create an instructor record.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setModalOpen(false)} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100">✕</button>
            </div>

            <div className="mt-4">
              <label className="block mb-3">
                <div className="text-sm text-neutral-600 mb-1">Name</div>
                <input ref={nameInputRef} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. John Smith" required />
              </label>
              <label className="block mb-3">
                <div className="text-sm text-neutral-600 mb-1">Department</div>
                <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. Mathematics" />
              </label>
              <label className="block mb-3">
                <div className="text-sm text-neutral-600 mb-1">Email</div>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" placeholder="e.g. john@example.com" />
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md border text-sm bg-red-700">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm shadow">Add instructor</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
