import React, { useState, useMemo, useEffect, useRef } from 'react'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminStudents() {
  const [students, setStudents] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', className: '' })
  const nameInputRef = useRef(null)
  const modalRef = useRef(null)

  useEffect(() => {
    if (!modalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // focus first input
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

  const groups = useMemo(() => {
    const g = {}
    students.forEach((s) => {
      const k = s.className || 'Unassigned'
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
      const matches = groups[cls].filter((st) => st.name.toLowerCase().includes(q) || (st.className || '').toLowerCase().includes(q))
      if (matches.length) res[cls] = matches
    })
    return res
  }, [groups, debouncedQuery])

  const totalMatches = useMemo(() => {
    if (!debouncedQuery) return 0
    return Object.values(filteredGroups).reduce((acc, arr) => acc + arr.length, 0)
  }, [filteredGroups, debouncedQuery])

  function openModal() {
    setForm({ name: '', className: '' })
    setModalOpen(true)
  }

  function addStudent(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setStudents((s) => [...s, { id: Date.now(), name: form.name.trim(), className: form.className.trim() }])
    setModalOpen(false)
  }

  function downloadCSV() {
    const rows = [['Class', 'Name']]
    const classes = Object.keys(groups).sort()
    classes.forEach((c) => {
      groups[c].forEach((st) => rows.push([c, st.name]))
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

  return (
    <div className="max-w-7xl mx-auto px-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">Students</h2>
          <p className="text-sm text-neutral-500">Manage student records by class</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="px-3 py-2 rounded-md border border-neutral-200 bg-green-600 text-white text-neutral-700 hover:shadow">Download CSV</button>
          <button onClick={openModal} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm shadow hover:bg-indigo-700">Add student</button>
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
        {Object.keys(groups).length === 0 && (
          <div className="p-8 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No students yet. Use "Add student" to create one.</div>
        )}

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
                    <ul className="divide-y">
                      {(list.slice(0, visible)).map((st) => (
                        <li key={st.id} className="py-3 flex items-center gap-3 hover:bg-neutral-50 rounded-md px-2">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">{initials(st.name)}</div>
                          <div className="flex-1">
                            <div className="font-medium text-black">{st.name}</div>
                          </div>
                          <div className="text-sm text-neutral-500">{st.className || 'Unassigned'}</div>
                        </li>
                      ))}
                    </ul>

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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-student-title"
            className="relative z-10 w-full max-w-md"
          >
            <form
              onSubmit={addStudent}
              ref={modalRef}
              className="transform transition-all duration-200 bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 id="add-student-title" className="text-lg text-black font-medium">Add student</h4>
                  <p className="text-sm text-neutral-500">Create a new student record and assign to a class.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md p-2 text-red-700 hover:bg-neutral-100"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4">
                <label className="block mb-3">
                  <div className="text-sm text-neutral-600 mb-1">Name</div>
                  <input
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="e.g. Alice Johnson"
                    required
                  />
                </label>

                <label className="block mb-4">
                  <div className="text-sm text-neutral-600 mb-1">Class</div>
                  <input
                    value={form.className}
                    onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
                    className="w-full border border-neutral-200 rounded px-3 py-2 text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="e.g. Grade 5A"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-md border text-sm bg-red-700 text-white">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm shadow">Add student</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
