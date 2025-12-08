import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'

export default function SubjectsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [subjects, setSubjects] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await api.getMySubjects()
        const arr = Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : [])
        if (mounted) setSubjects(arr)
      } catch (err) {
        console.error('Failed to load subjects', err)
        if (mounted) setError(err)
        toast.error(err?.message || 'Failed to load subjects')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [toast])

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return subjects
    return subjects.filter(s => {
      return (s.name || '').toLowerCase().includes(q) || (s.subject_code || '').toLowerCase().includes(q) || (s.class_name || s.class_obj?.name || '').toLowerCase().includes(q)
    })
  }, [subjects, query])

  const gradientClasses = [
    'bg-gradient-to-r from-indigo-50 to-indigo-100 text-black',
    'bg-gradient-to-r from-rose-50 to-rose-100 text-black',
    'bg-gradient-to-r from-emerald-50 to-emerald-100 text-black',
    'bg-gradient-to-r from-yellow-50 to-yellow-100 text-black',
    'bg-gradient-to-r from-sky-50 to-sky-100 text-black',
    'bg-gradient-to-r from-violet-50 to-violet-100 text-black',
    'bg-gradient-to-r from-pink-50 to-pink-100 text-black',
  ]

  return (
    <div className="p-4 text-black">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">My subjects</h2>
          <p className="text-sm text-gray-600">Subjects you teach and the class each subject belongs to.</p>
        </div>
      </header>

      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search subjects, code or class" className="p-2 rounded border w-full sm:w-64" />
      </div>

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {!loading && error && <div className="text-sm text-red-600">Failed to load subjects: {error.message || String(error)}</div>}

      {!loading && !subjects.length && (
        <div className="text-sm text-neutral-600">No subjects found. If you teach subjects they will appear here.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s, idx) => (
          <div key={s.id} className={`rounded-xl p-4 hover:shadow-lg transition cursor-pointer ${gradientClasses[idx % gradientClasses.length] || ''}`} onClick={() => {
            // navigate to class page with subject context if available
            const clsId = s.class_obj?.id || s.class_obj || s.class_id || s.class_obj_id
            if (clsId) navigate(`/list/classes/${clsId}?subject=${s.id}`)
          }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-black truncate">{s.name || 'Untitled'}</div>
                <div className="text-sm text-neutral-600 mt-1">{s.subject_code || ''}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-neutral-600">Class</div>
                <div className="text-sm font-medium text-black">{s.class_name || s.class_obj?.name || '—'}</div>
              </div>
            </div>
            <div className="mt-3 text-sm text-neutral-600">
              <div><span className="font-medium text-black">Subject:</span> <span className="ml-1">{s.name || '—'}</span></div>
              <div className="mt-1"><span className="font-medium text-black">Class:</span> <span className="ml-1">{s.class_name || s.class_obj?.name || '—'}</span></div>
              {s.subject_code ? <div className="mt-1"><span className="font-medium text-black">Code:</span> <span className="ml-1">{s.subject_code}</span></div> : null}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); navigate(`/list/classes/${s.class_obj?.id || s.class_obj || s.class_id || ''}?subject=${s.id}`) }} className="px-3 py-1 rounded bg-white text-black text-sm shadow-sm">View class</button>
              <button onClick={(e) => { e.stopPropagation(); navigate(`/list/exams?subject=${s.id}`) }} className="px-3 py-1 rounded border bg-white text-black text-sm">View exams</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
