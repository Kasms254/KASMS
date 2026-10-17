import { AlertCircle } from 'lucide-react'
import {
  STATUS_STYLES, PRIORITY_STYLES, SECTIONS, CAPABILITY_FIELDS, INFORMATION_FIELDS, labelFor,
} from './requirementsConfig'

const inputBase =
  'w-full border rounded-lg px-3 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'

export function StatusBadge({ status, label }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-700'}`}>
      {label || status}
    </span>
  )
}

export function PriorityBadge({ priority, label }) {
  if (!priority) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_STYLES[priority] || ''}`}>
      {label || priority}
    </span>
  )
}

export function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-48" role="status" aria-label="Loading">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  )
}

// Generic labelled input for one question. `id` must be unique on the page.
export function FieldInput({ id, field, value, onChange, choices, error }) {
  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const border = error ? 'border-red-400' : 'border-neutral-200'
  const options = field.choices ? choices?.[field.choices] || [] : []

  let control
  if (field.type === 'checkbox') {
    return (
      <div>
        <label htmlFor={id} className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-200"
          />
          <span>{field.label}</span>
        </label>
        {error && <p id={`${id}-error`} className="text-red-600 text-xs mt-1">{error}</p>}
      </div>
    )
  }
  if (field.type === 'multi') {
    const selected = value || []
    const toggle = (v) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])
    control = (
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
        {options.map((opt) => (
          <label key={opt.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${selected.includes(opt.value) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-neutral-200 text-neutral-700'}`}>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-200"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    )
  } else if (field.type === 'select') {
    control = (
      <select
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${inputBase} ${border}`}
      >
        <option value="">Select…</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    )
  } else if (field.type === 'textarea') {
    control = (
      <textarea
        id={id}
        rows={3}
        value={value || ''}
        maxLength={5000}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${inputBase} ${border} resize-y`}
      />
    )
  } else {
    control = (
      <input
        id={id}
        type="text"
        value={value || ''}
        maxLength={field.type === 'text' ? 200 : 2000}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${inputBase} ${border}`}
      />
    )
  }

  return (
    <div>
      <label id={`${id}-label`} htmlFor={field.type === 'multi' ? undefined : id} className="block text-sm font-medium text-neutral-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-600" aria-hidden="true"> *</span>}
        {field.required && <span className="sr-only"> (required)</span>}
      </label>
      {control}
      {field.help && <p id={`${id}-help`} className="text-xs text-neutral-500 mt-1">{field.help}</p>}
      {error && <p id={`${id}-error`} className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  )
}

// Read-only rendering of one answer (used by review step and detail page).
export function AnswerView({ field, value, choices }) {
  let text
  if (field.type === 'checkbox') text = value ? 'Yes' : 'No'
  else if (field.type === 'select') text = labelFor(choices?.[field.choices], value)
  else if (field.type === 'multi') text = (value || []).map((v) => labelFor(choices?.[field.choices], v)).join(', ')
  else text = value
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{field.label}</dt>
      <dd className="text-sm text-black whitespace-pre-wrap break-words mt-0.5">
        {text ? text : <span className="text-neutral-400 italic">Not provided</span>}
      </dd>
    </div>
  )
}

function ItemList({ items, fields, title, choices }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-neutral-400 italic">None provided</p>
  }
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-neutral-200 p-3">
          <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">{title} {index + 1}</p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.name} className={f.wide ? 'md:col-span-2' : ''}>
                <AnswerView field={f} value={item[f.name]} choices={choices} />
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

// Full read-only rendering of a submission, section by section. `errors`
// highlights fields still missing (review-before-submit screen).
export function SubmissionAnswers({ record, choices, errors = {}, revisesLabel, onEditSection }) {
  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => {
        const sectionErrors = section.fields.filter((f) => errors[f.name])
        return (
          <section key={section.key} aria-labelledby={`answers-${section.key}`} className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 id={`answers-${section.key}`} className="font-semibold text-black">
                Section {section.key}: {section.title}
              </h3>
              {onEditSection && (
                <button type="button" onClick={() => onEditSection(section.key)} className="text-sm text-indigo-600 hover:text-indigo-700">
                  Edit
                </button>
              )}
            </div>
            {sectionErrors.length > 0 && (
              <ul className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2 space-y-1">
                {sectionErrors.map((f) => (
                  <li key={f.name}>{f.label ? `${f.label}: ` : ''}{errors[f.name]}</li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((field) => {
                if (field.showIf && !field.showIf(record)) return null
                if (field.type === 'capabilities') {
                  return (
                    <div key={field.name} className="md:col-span-2">
                      <ItemList items={record.capabilities} fields={CAPABILITY_FIELDS} title="Requirement" choices={choices} />
                    </div>
                  )
                }
                if (field.type === 'information') {
                  return (
                    <div key={field.name} className="md:col-span-2">
                      <ItemList items={record.information_needs} fields={INFORMATION_FIELDS} title="Information need" choices={choices} />
                    </div>
                  )
                }
                if (field.type === 'tasks') {
                  const tasks = (record.key_tasks || []).filter((t) => t && t.trim())
                  return (
                    <div key={field.name} className="md:col-span-2">
                      <dt className="text-xs font-medium text-neutral-500">{field.label}</dt>
                      <dd className="mt-0.5">
                        {tasks.length ? (
                          <ol className="list-decimal list-inside text-sm text-black space-y-0.5">
                            {tasks.map((t, i) => <li key={i}>{t}</li>)}
                          </ol>
                        ) : <span className="text-sm text-neutral-400 italic">Not provided</span>}
                      </dd>
                    </div>
                  )
                }
                if (field.type === 'boundaries') {
                  return (
                    <AnswerView
                      key={field.name}
                      field={{ ...field, type: 'multi', choices: 'access_boundaries' }}
                      value={record.access_boundaries}
                      choices={choices}
                    />
                  )
                }
                if (field.type === 'revises') {
                  return <AnswerView key={field.name} field={{ ...field, type: 'text' }} value={revisesLabel || record.revises} />
                }
                const wide = field.type === 'textarea'
                return (
                  <div key={field.name} className={wide ? 'md:col-span-2' : ''}>
                    <AnswerView field={field} value={record[field.name]} choices={choices} />
                  </div>
                )
              })}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
