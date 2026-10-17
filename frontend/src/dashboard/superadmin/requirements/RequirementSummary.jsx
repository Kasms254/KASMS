import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { HelpCircle } from 'lucide-react'
import * as api from '../../../lib/api'
import useRequirementChoices from './useRequirementChoices'
import { ErrorBanner, Spinner } from './RequirementFields'
import { labelFor } from './requirementsConfig'

function TextList({ title, items, render }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 italic">None validated yet</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={`${item.submission}-${i}`} className="text-sm text-black">
              {render ? render(item) : <span className="whitespace-pre-wrap">{item.text}</span>}{' '}
              <Link to={`/superadmin/requirements/${item.submission}`} className="text-xs text-indigo-600 hover:text-indigo-700">source</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RequirementSummary() {
  const { choices } = useRequirementChoices()
  const [role, setRole] = useState('')
  // Results are tagged with the role they were fetched for, so a stale
  // response is never shown while the next one loads.
  const [result, setResult] = useState({ role: null, data: null, error: '' })

  useEffect(() => {
    let cancelled = false
    api.getRoleRequirementSummary(role)
      .then((res) => { if (!cancelled) setResult({ role, data: res, error: '' }) })
      .catch((err) => { if (!cancelled) setResult({ role, data: null, error: err.message || 'Could not load the summary.' }) })
    return () => { cancelled = true }
  }, [role])

  const current = result.role === role
  const data = current ? result.data : null
  const error = current ? result.error : ''

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Link to="/superadmin/requirements" className="text-sm text-indigo-600 hover:text-indigo-700">← All requirements</Link>
          <h2 className="text-xl sm:text-2xl font-semibold text-black mt-1">Requirements by office</h2>
          <p className="text-xs sm:text-sm text-neutral-500 max-w-2xl">
            Counts include every submitted request. Responsibilities, problems, outcomes and requirements are shown
            only once a reviewer has approved them. Names and contact details are never included.
          </p>
        </div>
        <select
          aria-label="Office"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All offices</option>
          {(choices?.assessed_roles || []).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </header>

      <ErrorBanner message={error} />
      {!data && !error && <Spinner />}

      {data && data.map((s) => (
        <section key={s.assessed_role} aria-labelledby={`sum-${s.assessed_role}`} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 id={`sum-${s.assessed_role}`} className="text-lg font-semibold text-black">{s.assessed_role_label}</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-neutral-100 text-neutral-700">{s.submission_count} submitted</span>
              {s.awaiting_review > 0 && <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-700">{s.awaiting_review} awaiting review</span>}
              {Object.entries(s.status_counts).map(([st, n]) => (
                <span key={st} className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">{labelFor(choices?.statuses, st)}: {n}</span>
              ))}
            </div>
          </div>

          {s.submission_count === 0 ? (
            <p className="text-sm text-neutral-500">No requirements have been submitted for this office yet.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <TextList title="Main responsibilities" items={s.responsibilities} />
              <TextList title="Problems reported" items={s.problems} />
              <TextList title="Desired outcomes" items={s.desired_outcomes} />
              <TextList
                title="Approved functional requirements"
                items={s.approved_requirements}
                render={(r) => (
                  <>
                    <span className="font-medium">{r.capability_label || r.capability}:</span> {r.description}
                    {r.reviewer_priority && <span className="ml-1 text-xs text-neutral-500">({labelFor(choices?.priorities, r.reviewer_priority)} priority)</span>}
                  </>
                )}
              />
              <TextList
                title="Reporting needs"
                items={s.reporting_needs}
                render={(r) => (
                  <>
                    {r.data_fields}
                    {r.formats?.length > 0 && <span className="text-xs text-neutral-500"> — {r.formats.join(', ')}</span>}
                  </>
                )}
              />
              <div>
                <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">Dashboard requests and decisions</h4>
                <p className="text-sm text-black">
                  Requested in {s.dashboard.requested} submission(s) · justified {s.dashboard.justified} · not justified {s.dashboard.not_justified}
                </p>
                <ul className="mt-1 space-y-1">
                  {s.dashboard.decisions.map((d) => (
                    <li key={d.submission} className="text-sm text-neutral-700">
                      <span className={d.justified ? 'text-emerald-700 font-medium' : 'text-neutral-700 font-medium'}>{d.justified ? 'Justified' : 'Not justified'}:</span>{' '}
                      {d.rationale}{' '}
                      <Link to={`/superadmin/requirements/${d.submission}`} className="text-xs text-indigo-600 hover:text-indigo-700">source</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:col-span-2">
                <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" /> Outstanding questions
                </h4>
                {s.outstanding_questions.length === 0 ? (
                  <p className="text-sm text-neutral-400 italic">None</p>
                ) : (
                  <ul className="space-y-1">
                    {s.outstanding_questions.map((q) => (
                      <li key={q.submission} className="text-sm text-amber-800">
                        {q.text} <Link to={`/superadmin/requirements/${q.submission}`} className="text-xs text-indigo-600 hover:text-indigo-700">source</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
