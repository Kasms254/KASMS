import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'

const COMPONENT_TYPE_LABELS = {
  cat: 'Continuous Assessment Test',
  theory: 'Theory Exam',
  practical: 'Practical Exam',
  project: 'Project',
  other: 'Other',
}

const RETAKE_EVAL_LABELS = {
  latest: 'Latest Attempt',
  best: 'Best Attempt',
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

function sanitize(v) {
  if (typeof v !== 'string') return v
  return v.replace(/<[^>]+>/g, '').replace(CONTROL_CHARS, '')
}

const emptyForm = {
  name: '',
  component_type: 'other',
  description: '',
  total_marks: '100',
  weight: '',
  pass_mark: '50',
  is_critical: false,
  retake_allowed: false,
  max_retake_attempts: '0',
  retake_evaluation: 'latest',
  sort_order: '0',
}

export default function AssessmentComponents() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const subjectId = searchParams.get('subject_id')

  const [subject, setSubject] = useState(null)
  const [components, setComponents] = useState([])
  const [weightSummary, setWeightSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingComponent, setEditingComponent] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadData = useCallback(async () => {
    if (!subjectId) return
    setLoading(true)
    try {
      const [comps, summary] = await Promise.all([
        api.getComponentsBySubject(subjectId),
        api.getComponentWeightSummary(subjectId),
      ])
      setComponents(Array.isArray(comps) ? comps : [])
      setWeightSummary(summary)
    } catch (err) {
      toast.error(err?.message || 'Failed to load components')
    } finally {
      setLoading(false)
    }
  }, [subjectId, toast])

  useEffect(() => {
    if (!subjectId) return
    async function loadSubject() {
      try {
        const data = await api.request?.(`/api/subjects/${subjectId}/`) ?? null
        if (data) setSubject(data)
      } catch {
        // subject name is optional display info
      }
    }
    loadSubject()
    loadData()
  }, [subjectId, loadData])

  function openAdd() {
    setEditingComponent(null)
    setForm({ ...emptyForm, weight: components.length === 0 ? '100' : '' })
    setModalOpen(true)
  }

  function openEdit(comp) {
    setEditingComponent(comp)
    setForm({
      name: comp.name || '',
      component_type: comp.component_type || 'other',
      description: comp.description || '',
      total_marks: String(comp.total_marks ?? 100),
      weight: String(comp.weight ?? ''),
      pass_mark: String(comp.pass_mark ?? 50),
      is_critical: !!comp.is_critical,
      retake_allowed: !!comp.retake_allowed,
      max_retake_attempts: String(comp.max_retake_attempts ?? 0),
      retake_evaluation: comp.retake_evaluation || 'latest',
      sort_order: String(comp.sort_order ?? 0),
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingComponent(null)
    setForm(emptyForm)
  }

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Component name is required')
    if (!form.weight) return toast.error('Weight is required')

    const totalWeight = parseFloat(form.weight) || 0
    const existingWeight = components
      .filter(c => !editingComponent || c.id !== editingComponent.id)
      .reduce((sum, c) => sum + parseFloat(c.weight || 0), 0)

    if (existingWeight + totalWeight > 100.01) {
      return toast.error(`Total weight would exceed 100%. Remaining: ${(100 - existingWeight).toFixed(2)}%`)
    }

    const payload = {
      subject: subjectId,
      name: sanitize(form.name.trim()),
      component_type: form.component_type,
      description: sanitize(form.description),
      total_marks: parseInt(form.total_marks, 10) || 100,
      weight: parseFloat(form.weight),
      pass_mark: parseFloat(form.pass_mark) || 50,
      is_critical: form.is_critical,
      retake_allowed: form.retake_allowed,
      max_retake_attempts: parseInt(form.max_retake_attempts, 10) || 0,
      retake_evaluation: form.retake_evaluation,
      sort_order: parseInt(form.sort_order, 10) || 0,
    }

    setSaving(true)
    try {
      if (editingComponent) {
        await api.updateAssessmentComponent(editingComponent.id, payload)
        toast.success('Component updated')
      } else {
        await api.createAssessmentComponent(payload)
        toast.success('Component added')
      }
      closeModal()
      loadData()
    } catch (err) {
      const d = err?.data
      if (d && typeof d === 'object') {
        const msg = Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' | ')
        toast.error(msg)
      } else {
        toast.error(err?.message || 'Failed to save component')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(comp) {
    setDeletingId(comp.id)
    try {
      await api.deleteAssessmentComponent(comp.id)
      toast.success('Component removed')
      setConfirmDelete(null)
      loadData()
    } catch (err) {
      toast.error(err?.message || 'Failed to delete component')
    } finally {
      setDeletingId(null)
    }
  }

  if (!subjectId) {
    return (
      <div className="p-6 text-black">
        <p className="text-sm text-neutral-500">No subject selected. Navigate here from a subject.</p>
        <button onClick={() => navigate(-1)} className="mt-3 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm">Go back</button>
      </div>
    )
  }

  const totalWeight = components.reduce((sum, c) => sum + parseFloat(c.weight || 0), 0)
  const weightOk = Math.abs(totalWeight - 100) < 0.01

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 text-black">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline mb-1 inline-block">← Back</button>
          <h2 className="text-xl sm:text-2xl font-semibold">Assessment Components</h2>
          {subject && (
            <p className="text-sm text-neutral-500">{subject.name} — {subject.class_name || ''}</p>
          )}
        </div>
        <button onClick={openAdd} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition text-sm whitespace-nowrap">
          Add Component
        </button>
      </header>

      {/* Weight summary */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-neutral-700">Total weight assigned</span>
          <span className={`text-sm font-semibold ${weightOk ? 'text-green-600' : totalWeight > 100 ? 'text-red-600' : 'text-amber-600'}`}>
            {totalWeight.toFixed(2)}% / 100%
          </span>
        </div>
        <div className="w-full bg-neutral-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${totalWeight > 100 ? 'bg-red-500' : weightOk ? 'bg-green-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(totalWeight, 100)}%` }}
          />
        </div>
        {!weightOk && totalWeight < 100 && (
          <p className="text-xs text-amber-600 mt-1">{(100 - totalWeight).toFixed(2)}% remaining — components should total 100%</p>
        )}
        {totalWeight > 100 && (
          <p className="text-xs text-red-600 mt-1">Weight exceeds 100% — please adjust component weights</p>
        )}
      </div>

      {loading && <div className="text-sm text-neutral-500 py-8 text-center">Loading components…</div>}

      {!loading && components.length === 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-8 text-center">
          <p className="text-neutral-500 text-sm">No assessment components yet.</p>
          <p className="text-xs text-neutral-400 mt-1">Add components to define how this subject is graded.</p>
          <button onClick={openAdd} className="mt-4 px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 transition">Add First Component</button>
        </div>
      )}

      {!loading && components.length > 0 && (
        <div className="space-y-3">
          {components.map(comp => (
            <div key={comp.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-black">{comp.name}</span>
                    {comp.is_critical && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 font-medium">Critical</span>
                    )}
                    {comp.retake_allowed && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">Retake allowed</span>
                    )}
                    {!comp.is_active && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-neutral-100 text-neutral-500">Inactive</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">{COMPONENT_TYPE_LABELS[comp.component_type] || comp.component_type}</div>
                  {comp.description && <div className="text-sm text-neutral-600 mt-1 line-clamp-2">{comp.description}</div>}

                  <div className="flex flex-wrap gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-neutral-500">Marks:</span>
                      <span className="ml-1 font-medium">{comp.total_marks}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Weight:</span>
                      <span className="ml-1 font-medium">{parseFloat(comp.weight).toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Pass mark:</span>
                      <span className="ml-1 font-medium">{parseFloat(comp.pass_mark).toFixed(1)}%</span>
                    </div>
                    {comp.retake_allowed && (
                      <div>
                        <span className="text-neutral-500">Max retakes:</span>
                        <span className="ml-1 font-medium">{comp.max_retake_attempts === 0 ? 'Unlimited' : comp.max_retake_attempts}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(comp)}
                    className="px-3 py-1.5 rounded-md bg-indigo-600 text-sm text-white hover:bg-indigo-700 transition"
                  >Edit</button>
                  <button
                    onClick={() => setConfirmDelete(comp)}
                    className="px-3 py-1.5 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 transition"
                  >Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg font-medium text-black">{editingComponent ? 'Edit component' : 'Add component'}</h4>
                  <p className="text-sm text-neutral-500">Define an assessment component for this subject.</p>
                </div>
                <button type="button" onClick={closeModal} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Component name *</label>
                    <input
                      value={form.name}
                      maxLength={150}
                      onChange={e => setField('name', sanitize(e.target.value))}
                      placeholder="e.g. CAT 1, Theory Final, Firing Range"
                      className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Component type</label>
                    <select value={form.component_type} onChange={e => setField('component_type', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                      {Object.entries(COMPONENT_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Sort order</label>
                    <input type="number" min="0" value={form.sort_order} onChange={e => setField('sort_order', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Total marks</label>
                    <input type="number" min="1" value={form.total_marks} onChange={e => setField('total_marks', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" required />
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">
                      Weight (%) *
                      {weightSummary && !editingComponent && (
                        <span className="ml-2 text-xs text-amber-600">Max: {parseFloat(weightSummary.remaining || 0).toFixed(2)}% remaining</span>
                      )}
                    </label>
                    <input type="number" min="0" max="100" step="0.01" value={form.weight} onChange={e => setField('weight', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" required />
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Pass mark (%)</label>
                    <input type="number" min="0" max="100" step="0.01" value={form.pass_mark} onChange={e => setField('pass_mark', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm text-neutral-600 mb-1 block">Description</label>
                    <textarea value={form.description} maxLength={500} onChange={e => setField('description', sanitize(e.target.value))} rows={2} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>

                  <div className="sm:col-span-2 flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                      <input type="checkbox" checked={form.is_critical} onChange={e => setField('is_critical', e.target.checked)} className="w-4 h-4" />
                      <span>Critical component — failing this fails the entire subject regardless of overall score</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                      <input type="checkbox" checked={form.retake_allowed} onChange={e => setField('retake_allowed', e.target.checked)} className="w-4 h-4" />
                      <span>Allow retakes</span>
                    </label>
                  </div>

                  {form.retake_allowed && (
                    <>
                      <div>
                        <label className="text-sm text-neutral-600 mb-1 block">Max retake attempts (0 = unlimited)</label>
                        <input type="number" min="0" value={form.max_retake_attempts} onChange={e => setField('max_retake_attempts', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                      <div>
                        <label className="text-sm text-neutral-600 mb-1 block">Retake evaluation</label>
                        <select value={form.retake_evaluation} onChange={e => setField('retake_evaluation', e.target.value)} className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                          {Object.entries(RETAKE_EVAL_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={closeModal} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {saving ? 'Saving…' : editingComponent ? 'Save changes' : 'Add component'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <h4 className="text-lg font-medium text-black">Confirm remove</h4>
              <p className="text-sm text-neutral-600 mt-2">
                Remove <strong>{confirmDelete.name}</strong>? This will also delete all student results for this component.
              </p>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm">Cancel</button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deletingId === confirmDelete.id}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 transition"
                >
                  {deletingId === confirmDelete.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
