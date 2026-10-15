import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Plus, Save, Send, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import * as api from '../../../lib/api'
import useToast from '../../../hooks/useToast'
import useRequirementChoices from './useRequirementChoices'
import { FieldInput, ErrorBanner, Spinner, StatusBadge, SubmissionAnswers } from './RequirementFields'
import {
  SECTIONS, CAPABILITY_FIELDS, INFORMATION_FIELDS, EMPTY_FORM, EMPTY_CAPABILITY, EMPTY_INFORMATION,
  fromRecord, toPayload, missingRequired, sectionOfField,
} from './requirementsConfig'

const REVIEW_STEP = SECTIONS.length

// DRF returns {field: [msg]} for save errors and {detail, errors:{field: msg}}
// for submit errors; normalise both to {field: 'msg'}.
function extractFieldErrors(err) {
  const data = err?.data
  if (!data || typeof data !== 'object') return {}
  const source = data.errors && typeof data.errors === 'object' ? data.errors : data
  const out = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === 'detail') continue
    out[key] = Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ') : String(value)
  }
  return out
}

export default function RequirementForm() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { choices, error: choicesError } = useRequirementChoices()

  const [recordId, setRecordId] = useState(routeId || null)
  const [record, setRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  // Keep the current section when /new is replaced by /:id/edit after the first save.
  const [step, setStep] = useState(() => location.state?.step ?? 0)
  const [loading, setLoading] = useState(Boolean(routeId))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [revisable, setRevisable] = useState([])

  const notify = useCallback((msg, type = 'success') => {
    if (type === 'error') {
      if (toast?.error) return toast.error(msg)
    } else if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type })
  }, [toast])

  // Load an existing draft / clarification submission.
  useEffect(() => {
    if (!routeId) return
    let cancelled = false
    api.getRoleRequirement(routeId)
      .then((data) => {
        if (cancelled) return
        setRecord(data)
        setForm(fromRecord(data))
        setErrors(data.completeness_errors || {})
      })
      .catch((err) => { if (!cancelled) setBanner(err.message || 'Could not load the submission.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [routeId])

  // Submissions this one can revise: same office, already submitted.
  useEffect(() => {
    if (form.submission_type !== 'revision' || !form.assessed_role) return
    let cancelled = false
    api.getRoleRequirements(`assessed_role=${encodeURIComponent(form.assessed_role)}&page_size=100&ordering=-submitted_at`)
      .then((data) => {
        if (cancelled) return
        const rows = (data.results || data || []).filter((r) => r.status !== 'draft' && r.id !== recordId)
        setRevisable(rows)
      })
      .catch(() => { if (!cancelled) setRevisable([]) })
    return () => { cancelled = true }
  }, [form.submission_type, form.assessed_role, recordId])

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    setDirty(true)
    setErrors((e) => {
      if (!e[name]) return e
      const next = { ...e }
      delete next[name]
      return next
    })
  }

  const setRow = (listName, index, key, value) => {
    setForm((f) => {
      const rows = f[listName].map((row, i) => (i === index ? { ...row, [key]: value } : row))
      return { ...f, [listName]: rows }
    })
    setDirty(true)
  }
  const addRow = (listName, empty) => { setForm((f) => ({ ...f, [listName]: [...f[listName], { ...empty }] })); setDirty(true) }
  const removeRow = (listName, index) => {
    setForm((f) => ({ ...f, [listName]: f[listName].filter((_, i) => i !== index) }))
    setDirty(true)
  }

  const editable = !record || (record.allowed_actions || []).includes('edit')

  // Persist to the server. Returns the saved record or null on failure.
  const saveDraft = async ({ quiet = false } = {}) => {
    if (!form.assessed_role) {
      setErrors((e) => ({ ...e, assessed_role: 'Select the office being assessed before saving.' }))
      setStep(0)
      return null
    }
    setSaving(true)
    setBanner('')
    try {
      const payload = toPayload(form)
      const saved = recordId
        ? await api.updateRoleRequirement(recordId, payload)
        : await api.createRoleRequirement(payload)
      setRecord(saved)
      setErrors(saved.completeness_errors || {})
      setDirty(false)
      setSavedAt(new Date())
      if (!recordId) {
        setRecordId(saved.id)
        navigate(`/superadmin/requirements/${saved.id}/edit`, { replace: true, state: { step } })
      }
      if (!quiet) notify('Draft saved to the server.')
      return saved
    } catch (err) {
      const fieldErrors = extractFieldErrors(err)
      setErrors(fieldErrors)
      setBanner(err.message || 'The draft could not be saved.')
      const first = Object.keys(fieldErrors)[0]
      const sectionKey = first && sectionOfField(first)
      if (sectionKey) setStep(SECTIONS.findIndex((s) => s.key === sectionKey))
      return null
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    const saved = await saveDraft({ quiet: true })
    if (!saved) return
    setSaving(true)
    try {
      await api.roleRequirementAction(saved.id, 'submit')
      setDirty(false)
      notify('Requirements submitted for review.')
      navigate(`/superadmin/requirements/${saved.id}`, { state: { justSubmitted: true } })
    } catch (err) {
      setErrors(extractFieldErrors(err))
      setBanner(err.message || 'The submission is incomplete.')
      setStep(REVIEW_STEP)
    } finally {
      setSaving(false)
    }
  }

  const clientMissing = useMemo(() => missingRequired(form), [form])
  const reviewErrors = { ...clientMissing, ...errors }
  const sectionHasError = (section) => section.fields.some((f) => errors[f.name])

  const revisesLabel = useMemo(() => {
    const hit = revisable.find((r) => r.id === form.revises)
    return hit ? `${hit.assessed_role_label} — ${hit.problem_summary}` : form.revises
  }, [revisable, form.revises])

  if (loading || (!choices && !choicesError)) return <Spinner />
  if (choicesError) return <ErrorBanner message={choicesError} />

  if (!editable) {
    return (
      <div className="max-w-2xl space-y-4">
        <ErrorBanner message="This submission can no longer be edited. Only drafts and submissions awaiting clarification can be changed by the person who recorded them." />
        <Link to={`/superadmin/requirements/${recordId}`} className="text-indigo-600 hover:text-indigo-700 text-sm">View submission</Link>
      </div>
    )
  }

  const section = SECTIONS[step]

  const renderField = (field) => {
    if (field.showIf && !field.showIf(form)) return null
    const id = `rr-${field.name}`
    if (field.type === 'tasks') {
      return (
        <fieldset key={field.name} className="md:col-span-2">
          <legend className="block text-sm font-medium text-neutral-700 mb-1">
            {field.label}<span className="text-red-600" aria-hidden="true"> *</span>
          </legend>
          <div className="space-y-2">
            {form.key_tasks.map((task, i) => (
              <input
                key={i}
                aria-label={`Task ${i + 1}`}
                type="text"
                maxLength={2000}
                value={task}
                onChange={(e) => setField('key_tasks', form.key_tasks.map((t, j) => (j === i ? e.target.value : t)))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder={`Task ${i + 1}${i === 0 ? '' : ' (optional)'}`}
              />
            ))}
          </div>
          {errors.key_tasks && <p className="text-red-600 text-xs mt-1">{errors.key_tasks}</p>}
        </fieldset>
      )
    }
    if (field.type === 'boundaries') {
      return (
        <div key={field.name} className="md:col-span-2">
          <FieldInput
            id={id}
            field={{ ...field, type: 'multi', choices: 'access_boundaries' }}
            value={form.access_boundaries}
            onChange={(v) => setField('access_boundaries', v)}
            choices={choices}
            error={errors.access_boundaries}
          />
        </div>
      )
    }
    if (field.type === 'revises') {
      return (
        <div key={field.name} className="md:col-span-2">
          <label htmlFor={id} className="block text-sm font-medium text-neutral-700 mb-1">
            {field.label}<span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <select
            id={id}
            value={form.revises || ''}
            onChange={(e) => setField('revises', e.target.value || null)}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">{form.assessed_role ? 'Select a submitted request…' : 'Select the office first'}</option>
            {revisable.map((r) => (
              <option key={r.id} value={r.id}>{r.status_label} — {r.problem_summary || r.id}</option>
            ))}
          </select>
          {errors.revises && <p className="text-red-600 text-xs mt-1">{errors.revises}</p>}
        </div>
      )
    }
    if (field.type === 'capabilities' || field.type === 'information') {
      const isCap = field.type === 'capabilities'
      const listName = field.name
      const fields = isCap ? CAPABILITY_FIELDS : INFORMATION_FIELDS
      const title = isCap ? 'Requirement' : 'Information need'
      return (
        <div key={field.name} className="md:col-span-2 space-y-4">
          {errors[listName] && <ErrorBanner message={errors[listName]} />}
          {form[listName].map((row, index) => (
            <fieldset key={index} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <legend className="text-sm font-semibold text-black">{title} {index + 1}</legend>
                {form[listName].length > 1 && (
                  <button type="button" onClick={() => removeRow(listName, index)} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1">
                    <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
              {isCap && index === 0 && (
                <p className="text-xs text-neutral-500 mb-3">
                  Priority, impact, dependencies and acceptance criteria (Section I) are captured for each requirement.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <div key={f.name} className={f.wide ? 'md:col-span-2' : ''}>
                    <FieldInput
                      id={`rr-${listName}-${index}-${f.name}`}
                      field={{ ...f, type: f.type || (f.wide ? 'textarea' : 'line') }}
                      value={row[f.name]}
                      onChange={(v) => setRow(listName, index, f.name, v)}
                      choices={choices}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {form[listName].length < 20 && (
            <button
              type="button"
              onClick={() => addRow(listName, isCap ? EMPTY_CAPABILITY : EMPTY_INFORMATION)}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Add {title.toLowerCase()}
            </button>
          )}
        </div>
      )
    }
    const wide = field.type === 'textarea'
    return (
      <div key={field.name} className={wide ? 'md:col-span-2' : ''}>
        <FieldInput
          id={id}
          field={field}
          value={form[field.name]}
          onChange={(v) => setField(field.name, v)}
          choices={choices}
          error={errors[field.name]}
        />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link to="/superadmin/requirements" className="text-sm text-indigo-600 hover:text-indigo-700">← All requirements</Link>
          <h2 className="text-xl sm:text-2xl font-semibold text-black mt-1">
            {recordId ? 'Edit requirements assessment' : 'New requirements assessment'}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            Record the office's operational problem and needs. Requests are reviewed before anything is built or any access is granted.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500" aria-live="polite">
          {record && <StatusBadge status={record.status} label={record.status_label} />}
          {dirty ? <span className="text-amber-700">Unsaved changes</span>
            : savedAt ? <span>Saved {savedAt.toLocaleTimeString()}</span> : null}
        </div>
      </header>

      {record?.status === 'clarification_required' && record.clarification_request && (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div><p className="font-medium">Clarification requested by the reviewer</p><p className="whitespace-pre-wrap">{record.clarification_request}</p></div>
        </div>
      )}
      <ErrorBanner message={banner} />

      {/* Step navigation */}
      <nav aria-label="Form sections" className="overflow-x-auto">
        <ol className="flex gap-2 min-w-max">
          {SECTIONS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={step === i ? 'step' : undefined}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${step === i ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'}`}
              >
                {s.key}. {s.title}
                {sectionHasError(s) && <span className="ml-1 inline-block w-2 h-2 rounded-full bg-red-500" aria-label="has errors" />}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setStep(REVIEW_STEP)}
              aria-current={step === REVIEW_STEP ? 'step' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${step === REVIEW_STEP ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'}`}
            >
              Review &amp; submit
            </button>
          </li>
        </ol>
      </nav>

      {step < REVIEW_STEP ? (
        <section aria-labelledby="section-title" className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
          <h3 id="section-title" className="text-lg font-semibold text-black">Section {section.key}: {section.title}</h3>
          <p className="text-sm text-neutral-500 mb-4">{section.intro}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map(renderField)}
          </div>
        </section>
      ) : (
        <section aria-labelledby="review-title" className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <h3 id="review-title" className="text-lg font-semibold text-black">Review before submission</h3>
            {Object.keys(reviewErrors).length === 0 ? (
              <p className="text-sm text-emerald-700 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> All required questions are answered. The server will validate again on submit.
              </p>
            ) : (
              <p className="text-sm text-red-700 mt-1">
                {Object.keys(reviewErrors).length} item(s) still need attention. They are listed under each section below.
              </p>
            )}
          </div>
          <SubmissionAnswers
            record={toPayload(form)}
            choices={choices}
            errors={reviewErrors}
            revisesLabel={revisesLabel}
            onEditSection={(key) => setStep(SECTIONS.findIndex((s) => s.key === key))}
          />
        </section>
      )}

      {/* Footer actions */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
          </button>
          {step < REVIEW_STEP && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(REVIEW_STEP, s + 1))}
              className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-1"
            >
              Next <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => saveDraft()}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-indigo-200 bg-white text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 flex items-center gap-2"
          >
            <Save className="w-4 h-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save draft'}
          </button>
          {step === REVIEW_STEP && (
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
            >
              <Send className="w-4 h-4" aria-hidden="true" /> Submit for review
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
