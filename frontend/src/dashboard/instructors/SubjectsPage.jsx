import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
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
    'bg-gradient-to-r from-fill-indigo-50 to-fill-indigo-100 text-fg',
    'bg-gradient-to-r from-fill-rose-50 to-fill-rose-100 text-fg',
    'bg-gradient-to-r from-fill-emerald-50 to-fill-emerald-100 text-fg',
    'bg-gradient-to-r from-fill-yellow-50 to-fill-yellow-100 text-fg',
    'bg-gradient-to-r from-fill-sky-50 to-fill-sky-100 text-fg',
    'bg-gradient-to-r from-fill-violet-50 to-fill-violet-100 text-fg',
    'bg-gradient-to-r from-fill-pink-50 to-fill-pink-100 text-fg',
  ]

  return (
    <div className="p-4 text-fg">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">My subjects</h2>
          <p className="text-sm text-fg-muted">Subjects you teach and the class each subject belongs to.</p>
        </div>
      </header>

      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search subjects, code or class" className="p-2 rounded border w-full sm:w-64" />
      </div>

      {loading && <div className="text-sm text-fg-soft">Loading…</div>}
      {!loading && error && <div className="text-sm text-mark-red-600">Failed to load subjects: {error.message || String(error)}</div>}

      {!loading && !subjects.length && (
        <div className="text-sm text-fg-muted">No subjects found. If you teach subjects they will appear here.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s, idx) => (
          <div key={s.id} className={`rounded-xl p-4 hover:shadow-lg transition cursor-pointer flex flex-col h-full min-h-[200px] ${gradientClasses[idx % gradientClasses.length] || ''}`} onClick={() => {
            // navigate to class page with subject context if available
            const clsId = s.class_obj?.id || s.class_obj || s.class_id || s.class_obj_id
            if (clsId) navigate(`/list/classes/${clsId}?subject=${s.id}`)
          }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-fg truncate" title={s.name || 'Untitled'}>{s.name || 'Untitled'}</div>
                <div className="text-sm text-fg-muted mt-1 truncate">{s.subject_code || ''}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm text-fg-muted">Class</div>
                <div className="text-sm font-medium text-fg truncate max-w-[120px]" title={s.class_name || s.class_obj?.name || '—'}>{s.class_name || s.class_obj?.name || '—'}</div>
              </div>
            </div>
            {s.description && (
              <div className="mt-2 text-sm text-fg-muted line-clamp-2" title={s.description}>
                {s.description}
              </div>
            )}
            <div className="mt-3 text-sm text-fg-muted flex-1">
              <div className="truncate"><span className="font-medium text-fg">Subject:</span> <span className="ml-1">{s.name || '—'}</span></div>
              <div className="mt-1 truncate"><span className="font-medium text-fg">Class:</span> <span className="ml-1">{s.class_name || s.class_obj?.name || '—'}</span></div>
              {s.subject_code ? <div className="mt-1 truncate"><span className="font-medium text-fg">Code:</span> <span className="ml-1">{s.subject_code}</span></div> : null}
            </div>
            <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${s.grading_mode === 'POLICY' ? 'bg-fill-amber-50 text-mark-amber-700' : 'bg-surface-2 text-fg-soft'}`}>
                {s.grading_mode === 'POLICY' ? 'Policy' : 'Legacy'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-line">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/list/classes/${s.class_obj?.id || s.class_obj || s.class_id || ''}?subject=${s.id}`)
                }}
                className="px-3 py-1.5 rounded-md bg-fill-indigo-600 text-sm text-white hover:bg-fill-indigo-700 transition"
              >
                View class
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/list/exams?subject=${s.id}`)
                }}
                className="px-3 py-1.5 rounded-md bg-fill-emerald-600 text-sm text-white hover:bg-fill-emerald-700 transition"
              >
                View exams
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
