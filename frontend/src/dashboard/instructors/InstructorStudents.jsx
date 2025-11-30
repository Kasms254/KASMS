import React, { useEffect, useState, useMemo } from 'react'
import useAuth from '../../hooks/useAuth'
import { getMyClasses, getClassEnrolledStudents } from '../../lib/api'

function initials(name = '') {
  return name
    .split(' ')
    .map((s) => s[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function InstructorStudents() {
  const { user } = useAuth()
  const [classesList, setClassesList] = useState([])
  const [classStudents, setClassStudents] = useState({}) // map classId -> students array
  const [classLoading, setClassLoading] = useState({})
  const [classError, setClassError] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Accordion + search state (same UX as AdminStudents)
  const [openSections, setOpenSections] = useState({})
  const [visibleCounts, setVisibleCounts] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!user) return
      setLoading(true)
      try {
        const res = await getMyClasses().catch(() => null)
        const list = res && Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
        if (!mounted) return
        const mapped = (list || []).map((c) => ({
          id: c.id,
          name: c.name || c.class_name || c.display_name || c.title || `Class ${c.id}`,
          student_count: c.current_enrollment ?? c.enrollment_count ?? 0,
        }))
        setClassesList(mapped)
      } catch (err) {
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [user])

  const filteredClasses = useMemo(() => {
    if (!debouncedQuery) return classesList
    const q = debouncedQuery.toLowerCase()
    return classesList.filter((c) => (c.name || '').toLowerCase().includes(q))
  }, [classesList, debouncedQuery])

  async function toggleSection(classId) {
    setOpenSections((s) => {
      const isOpen = !!s[classId]
      if (isOpen) return { ...s, [classId]: false }
      return { [classId]: true }
    })
    setVisibleCounts((c) => ({ ...c, [classId]: c[classId] || 50 }))
  // if opening, load students for the class (only when we haven't loaded this class before)
  if (!(classId in classStudents)) await loadStudentsForClass(classId)
  }

  function loadMore(classId) {
    setVisibleCounts((c) => ({ ...c, [classId]: (c[classId] || 50) + 50 }))
  }

  async function loadStudentsForClass(classId) {
    if (!classId) return
    if (classStudents[classId]) return
    setClassLoading((s) => ({ ...s, [classId]: true }))
    try {
  const res = await getClassEnrolledStudents(classId)
  const list = res && Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : [])
      const mapped = (list || []).map((u) => {
        const student = u.student || u
        return {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          full_name: student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
          name: student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
          svc_number: student.svc_number != null ? String(student.svc_number) : '',
          email: student.email,
          phone_number: student.phone_number,
          rank: student.rank || student.rank_display || '',
          is_active: student.is_active,
          created_at: student.created_at,
        }
      })
      setClassStudents((s) => ({ ...s, [classId]: mapped }))
    } catch (err) {
      setClassError((s) => ({ ...s, [classId]: err }))
    } finally {
      setClassLoading((s) => ({ ...s, [classId]: false }))
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">My students</h2>
          <p className="text-sm text-neutral-500">Students enrolled in classes you teach</p>
        </div>
      </header>

      <section className="grid gap-6">
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
          <div className="text-sm text-neutral-600">Found {filteredClasses.length} class(es) for "{debouncedQuery}"</div>
        ) : null}

        {error ? (
          <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-center">Error loading classes: {error.message || String(error)}</div>
        ) : loading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">Loading classes…</div>
        ) : classesList.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-center">No classes yet.</div>
        ) : null}

        <div className="flex flex-col gap-6">
          {filteredClasses.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((cls) => {
            const studentsForClass = classStudents[cls.id] || []
            const isOpen = !!openSections[cls.id]
            const visible = visibleCounts[cls.id] || 50
            const loadingStudents = !!classLoading[cls.id]
            const err = classError[cls.id]
            return (
              <div key={cls.id} className="bg-white rounded-xl p-0 border border-neutral-200 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(cls.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-neutral-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm text-neutral-500">Class</span>
                      <span className="text-lg font-medium text-black">{cls.name}</span>
                    </div>
                    <span className="text-sm bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{cls.student_count || studentsForClass.length} students</span>
                  </div>
                  <div className="text-sm text-neutral-500">{isOpen ? 'Collapse' : 'Expand'}</div>
                </button>

                {isOpen && (
                  <div className="p-4">
                    {loadingStudents ? (
                      <div className="p-4 text-neutral-500">Loading students…</div>
                    ) : err ? (
                      <div className="p-4 text-red-600">Error loading students: {err.message || String(err)}</div>
                    ) : (
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
                            </tr>
                          </thead>
                          <tbody>
                            {studentsForClass.slice(0, visible).map((st) => (
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {studentsForClass.length > visible && (
                      <div className="mt-3 text-center">
                        <button onClick={() => loadMore(cls.id)} className="px-3 py-1 rounded-md border bg-white text-sm">Load more</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
