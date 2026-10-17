import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { CheckCircle2, AlertTriangle, History, Copy, Pencil, Trash2, Send } from 'lucide-react'
import * as api from '../../../lib/api'
import useToast from '../../../hooks/useToast'
import ConfirmModal from '../../../components/ConfirmModal'
import useRequirementChoices from './useRequirementChoices'
import { ErrorBanner, PriorityBadge, Spinner, StatusBadge, SubmissionAnswers } from './RequirementFields'
import { labelFor } from './requirementsConfig'

const textareaClass = 'w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200'
const selectClass = 'w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'

// One reviewer/delivery action: a titled card with its inputs and a button.
function ActionCard({ title, description, children, buttonLabel, tone = 'indigo', busy, onSubmit }) {
  const tones = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    red: 'bg-red-600 hover:bg-red-700',
    amber: 'bg-amber-600 hover:bg-amber-700',
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit() }}
      className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3"
    >
      <div>
        <h4 className="font-semibold text-black text-sm">{title}</h4>
        {description && <p className="text-xs text-neutral-500">{description}</p>}
      </div>
      {children}
      <button type="submit" disabled={busy} className={`px-4 py-2 rounded-lg text-white text-sm disabled:opacity-60 ${tones[tone]}`}>
        {busy ? 'Working…' : buttonLabel}
      </button>
    </form>
  )
}

function LabeledTextarea({ id, label, value, onChange, required, help }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-neutral-700 mb-1">
        {label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}
      </label>
      <textarea id={id} rows={3} maxLength={5000} value={value} onChange={(e) => onChange(e.target.value)} className={textareaClass} required={required} />
      {help && <p className="text-xs text-neutral-500 mt-1">{help}</p>}
    </div>
  )
}

export default function RequirementDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { choices } = useRequirementChoices()

  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [duplicates, setDuplicates] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [inputs, setInputs] = useState({
    clarification_request: '', review_outcome: '', reviewer_priority: '', approved_acceptance_criteria: '',
    dashboard_decision_rationale: '', review_notes: '', rejection_reason: '', reject_outcome: '',
    note: '', implementation_reference: '', development_notes: '', implemented_notes: '', verification_notes: '',
  })
  const setInput = (key) => (value) => setInputs((s) => ({ ...s, [key]: value }))

  const notify = useCallback((msg, type = 'success') => {
    if (type === 'error' && toast?.error) return toast.error(msg)
    if (type !== 'error' && toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type })
  }, [toast])

  useEffect(() => {
    let cancelled = false
    api.getRoleRequirement(id)
      .then((data) => { if (!cancelled) { setRecord(data); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the submission.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const can = (action) => (record?.allowed_actions || []).includes(action)

  useEffect(() => {
    if (!record || !(can('link_duplicate') || can('unlink_duplicate'))) return
    let cancelled = false
    api.getRoleRequirementDuplicates(record.id)
      .then((rows) => { if (!cancelled) setDuplicates(rows) })
      .catch(() => { if (!cancelled) setDuplicates([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.status])

  const run = async (action, payload, successMessage) => {
    setBusy(true)
    setError('')
    try {
      const updated = await api.roleRequirementAction(record.id, action, payload)
      setRecord(updated)
      notify(successMessage)
      return true
    } catch (err) {
      const data = err.data && typeof err.data === 'object' ? err.data : null
      const fieldMsgs = data
        ? Object.entries(data).filter(([k]) => k !== 'detail').map(([, v]) => (Array.isArray(v) ? v.join(' ') : String(v)))
        : []
      setError([err.message, ...fieldMsgs].filter(Boolean).join(' '))
      return false
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.deleteRoleRequirement(record.id)
      notify('Draft deleted.')
      navigate('/superadmin/requirements')
    } catch (err) {
      setError(err.message || 'Could not delete the draft.')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <Spinner />
  if (!record) return <ErrorBanner message={error || 'Submission not found.'} />

  const approvable = (choices?.review_outcomes || []).filter((o) => (choices?.approvable_outcomes || []).includes(o.value))
  const needsDashboardRationale = record.dashboard_requested || inputs.review_outcome === 'dashboard_justified'
  const hasReviewActions = ['start_review', 'request_clarification', 'approve', 'reject', 'add_note',
    'mark_in_development', 'mark_implemented', 'verify'].some(can)

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <Link to="/superadmin/requirements" className="text-sm text-indigo-600 hover:text-indigo-700">← All requirements</Link>
          <h2 className="text-xl sm:text-2xl font-semibold text-black mt-1 flex flex-wrap items-center gap-2">
            {record.assessed_role_label} requirements
            <StatusBadge status={record.status} label={record.status_label} />
            <PriorityBadge priority={record.reviewer_priority} label={labelFor(choices?.priorities, record.reviewer_priority)} />
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            Recorded by {record.is_mine ? 'you' : record.created_by_name}
            {record.submitted_at && <> · submitted {new Date(record.submitted_at).toLocaleString()}</>}
            {record.content_version > 1 && <> · version {record.content_version}</>}
            {record.reviewed_by_name && <> · reviewer {record.reviewed_by_name}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('edit') && (
            <Link to={`/superadmin/requirements/${record.id}/edit`} className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2">
              <Pencil className="w-4 h-4" aria-hidden="true" /> {record.status === 'draft' ? 'Continue editing' : 'Edit and resubmit'}
            </Link>
          )}
          {can('submit') && (
            <button onClick={() => run('submit', {}, 'Submitted for review.')} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
              <Send className="w-4 h-4" aria-hidden="true" /> Submit
            </button>
          )}
          {can('delete') && (
            <button onClick={() => setConfirmDelete(true)} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete draft
            </button>
          )}
        </div>
      </header>

      {location.state?.justSubmitted && record.status === 'submitted' && (
        <div role="status" className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>Submitted. A different superadmin must review it; you can track its status here.</p>
        </div>
      )}
      {record.is_mine && ['submitted', 'under_review'].includes(record.status) && (
        <p className="text-xs text-neutral-500">You recorded this submission, so review decisions must be taken by another superadmin.</p>
      )}
      <ErrorBanner message={error} />

      {record.status === 'clarification_required' && (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div><p className="font-medium">Clarification requested</p><p className="whitespace-pre-wrap">{record.clarification_request}</p></div>
        </div>
      )}
      {record.status === 'rejected' && (
        <div className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
          <p className="font-medium">Rejected</p>
          <p className="whitespace-pre-wrap">{record.rejection_reason}</p>
        </div>
      )}

      {/* Preference vs. decision */}
      <section aria-labelledby="decision-title" className="bg-white rounded-xl border border-neutral-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <h3 id="decision-title" className="sr-only">Stakeholder preference and reviewer decision</h3>
        <div>
          <p className="text-xs font-medium text-neutral-500">Stakeholder's preferred interface (input only)</p>
          <p className="text-sm text-black">
            {labelFor(choices?.preferred_interfaces, record.preferred_interface) || '—'}
            {record.consolidated_overview_needed && ' · consolidated overview may be needed'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-neutral-500">Reviewer decision</p>
          <p className="text-sm text-black">{labelFor(choices?.review_outcomes, record.review_outcome) || 'Not decided'}</p>
        </div>
        {record.approved_acceptance_criteria && (
          <div className="md:col-span-2">
            <p className="text-xs font-medium text-neutral-500">Approved acceptance criteria</p>
            <p className="text-sm text-black whitespace-pre-wrap">{record.approved_acceptance_criteria}</p>
          </div>
        )}
        {record.dashboard_decision_rationale && (
          <div className="md:col-span-2">
            <p className="text-xs font-medium text-neutral-500">Dashboard decision rationale</p>
            <p className="text-sm text-black whitespace-pre-wrap">{record.dashboard_decision_rationale}</p>
          </div>
        )}
        {record.implementation_reference && (
          <div>
            <p className="text-xs font-medium text-neutral-500">Implementation reference</p>
            <p className="text-sm text-black break-words">{record.implementation_reference}</p>
          </div>
        )}
        {record.verification_notes && (
          <div>
            <p className="text-xs font-medium text-neutral-500">Verification ({record.verified_by_name})</p>
            <p className="text-sm text-black whitespace-pre-wrap">{record.verification_notes}</p>
          </div>
        )}
        {record.duplicate_of && (
          <div className="md:col-span-2 text-sm">
            <span className="text-amber-700 font-medium">Linked as a duplicate of </span>
            <Link to={`/superadmin/requirements/${record.duplicate_of}`} className="text-indigo-600 hover:text-indigo-700">another submission</Link>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <SubmissionAnswers record={record} choices={choices} />
        </div>

        <aside className="space-y-4" aria-label="Review and tracking">
          {hasReviewActions && <h3 className="font-semibold text-black">Review and tracking</h3>}

          {can('start_review') && (
            <ActionCard title="Start review" description="Take ownership of this review." buttonLabel="Start review" busy={busy}
              onSubmit={() => run('start_review', {}, 'Review started.')} />
          )}

          {can('approve') && (
            <ActionCard title="Approve" tone="emerald" buttonLabel="Approve requirement" busy={busy}
              description="Approval validates the requirement; it does not mark it as built or grant any access."
              onSubmit={() => run('approve', {
                review_outcome: inputs.review_outcome,
                reviewer_priority: inputs.reviewer_priority,
                approved_acceptance_criteria: inputs.approved_acceptance_criteria,
                dashboard_decision_rationale: inputs.dashboard_decision_rationale,
                review_notes: inputs.review_notes,
              }, 'Requirement approved.')}
            >
              <div>
                <label htmlFor="rv-outcome" className="block text-xs font-medium text-neutral-700 mb-1">Classification<span className="text-red-600" aria-hidden="true"> *</span></label>
                <select id="rv-outcome" value={inputs.review_outcome} onChange={(e) => setInput('review_outcome')(e.target.value)} className={selectClass} required>
                  <option value="">Select…</option>
                  {approvable.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="rv-priority" className="block text-xs font-medium text-neutral-700 mb-1">Priority<span className="text-red-600" aria-hidden="true"> *</span></label>
                <select id="rv-priority" value={inputs.reviewer_priority} onChange={(e) => setInput('reviewer_priority')(e.target.value)} className={selectClass} required>
                  <option value="">Select…</option>
                  {(choices?.priorities || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <LabeledTextarea id="rv-criteria" label="Approved acceptance criteria" required value={inputs.approved_acceptance_criteria}
                onChange={setInput('approved_acceptance_criteria')} help="Observable, testable results derived from the stakeholder's requirement." />
              {needsDashboardRationale && (
                <LabeledTextarea id="rv-dashboard" label="Is a dashboard justified? Why?" required value={inputs.dashboard_decision_rationale}
                  onChange={setInput('dashboard_decision_rationale')}
                  help="Consider the recurring decisions, frequency of use and whether a report, register or notification would suffice." />
              )}
              <LabeledTextarea id="rv-notes" label="Review notes" value={inputs.review_notes} onChange={setInput('review_notes')} />
            </ActionCard>
          )}

          {can('request_clarification') && (
            <ActionCard title="Request clarification" tone="amber" buttonLabel="Send back for clarification" busy={busy}
              onSubmit={() => run('request_clarification', { clarification_request: inputs.clarification_request }, 'Clarification requested.')}>
              <LabeledTextarea id="rv-clarify" label="What information is missing?" required value={inputs.clarification_request} onChange={setInput('clarification_request')} />
            </ActionCard>
          )}

          {can('reject') && (
            <ActionCard title="Reject" tone="red" buttonLabel="Reject requirement" busy={busy}
              onSubmit={() => run('reject', { rejection_reason: inputs.rejection_reason, review_outcome: inputs.reject_outcome }, 'Requirement rejected.')}>
              <div>
                <label htmlFor="rv-reject-outcome" className="block text-xs font-medium text-neutral-700 mb-1">Classification (optional)</label>
                <select id="rv-reject-outcome" value={inputs.reject_outcome} onChange={(e) => setInput('reject_outcome')(e.target.value)} className={selectClass}>
                  <option value="">Select…</option>
                  {(choices?.review_outcomes || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <LabeledTextarea id="rv-reject" label="Reason for rejection" required value={inputs.rejection_reason} onChange={setInput('rejection_reason')} />
            </ActionCard>
          )}

          {can('mark_in_development') && (
            <ActionCard title="Link to implementation work" buttonLabel="Mark in development" busy={busy}
              description="Only once dependencies are understood and the acceptance criteria are agreed."
              onSubmit={() => run('mark_in_development', { implementation_reference: inputs.implementation_reference, notes: inputs.development_notes }, 'Marked in development.')}>
              <div>
                <label htmlFor="rv-impl" className="block text-xs font-medium text-neutral-700 mb-1">Issue, PR or work reference<span className="text-red-600" aria-hidden="true"> *</span></label>
                <input id="rv-impl" type="text" maxLength={300} required value={inputs.implementation_reference} onChange={(e) => setInput('implementation_reference')(e.target.value)} className={textareaClass} />
              </div>
              <LabeledTextarea id="rv-dev-notes" label="Notes" value={inputs.development_notes} onChange={setInput('development_notes')} />
            </ActionCard>
          )}

          {can('mark_implemented') && (
            <ActionCard title="Delivered" buttonLabel="Mark implemented" busy={busy}
              onSubmit={() => run('mark_implemented', { notes: inputs.implemented_notes }, 'Marked implemented.')}>
              <LabeledTextarea id="rv-done" label="What was delivered?" required value={inputs.implemented_notes} onChange={setInput('implemented_notes')} />
            </ActionCard>
          )}

          {can('verify') && (
            <ActionCard title="Verify acceptance criteria" tone="emerald" buttonLabel="Mark verified" busy={busy}
              onSubmit={() => run('verify', { verification_notes: inputs.verification_notes }, 'Verified.')}>
              <LabeledTextarea id="rv-verify" label="Who confirmed the acceptance criteria, and how?" required value={inputs.verification_notes} onChange={setInput('verification_notes')} />
            </ActionCard>
          )}

          {(can('link_duplicate') || can('unlink_duplicate')) && (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3" aria-labelledby="dup-title">
              <h4 id="dup-title" className="font-semibold text-black text-sm flex items-center gap-2"><Copy className="w-4 h-4" aria-hidden="true" /> Similar requests</h4>
              {can('unlink_duplicate') && (
                <button onClick={() => run('unlink_duplicate', {}, 'Duplicate link removed.')} disabled={busy} className="text-sm text-red-600 hover:text-red-700">
                  Remove duplicate link
                </button>
              )}
              {duplicates === null ? <p className="text-xs text-neutral-500">Checking…</p>
                : duplicates.length === 0 ? <p className="text-xs text-neutral-500">No similar submitted requests found.</p>
                  : (
                    <ul className="space-y-2">
                      {duplicates.map((d) => (
                        <li key={d.id} className="text-sm border border-neutral-100 rounded-lg p-2">
                          <div className="flex items-center justify-between gap-2">
                            <Link to={`/superadmin/requirements/${d.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">{d.assessed_role_label}</Link>
                            <span className="text-xs text-neutral-500">{Math.round(d.similarity * 100)}% similar</span>
                          </div>
                          <p className="text-xs text-neutral-600 line-clamp-2">{d.problem_summary}</p>
                          {can('link_duplicate') && (
                            <button onClick={() => run('link_duplicate', { duplicate_of: d.id }, 'Linked as duplicate.')} disabled={busy} className="mt-1 text-xs text-indigo-600 hover:text-indigo-700">
                              Link as duplicate of this
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
              <p className="text-xs text-neutral-500">Linking never deletes or rejects a request.</p>
            </section>
          )}

          {can('add_note') && (
            <ActionCard title="Add review note" buttonLabel="Add note" busy={busy}
              onSubmit={async () => { if (await run('add_note', { notes: inputs.note }, 'Note added.')) setInput('note')('') }}>
              <LabeledTextarea id="rv-note" label="Note" required value={inputs.note} onChange={setInput('note')} />
            </ActionCard>
          )}

          <section className="rounded-xl border border-neutral-200 bg-white p-4" aria-labelledby="history-title">
            <h4 id="history-title" className="font-semibold text-black text-sm flex items-center gap-2 mb-3"><History className="w-4 h-4" aria-hidden="true" /> History</h4>
            <ol className="space-y-3">
              {(record.audit_logs || []).map((log) => (
                <li key={log.id} className="text-sm border-l-2 border-indigo-200 pl-3">
                  <p className="text-black font-medium">{log.action_label}</p>
                  <p className="text-xs text-neutral-500">{log.performed_by_name || 'Unknown'} · {new Date(log.timestamp).toLocaleString()}</p>
                  {log.notes && <p className="text-xs text-neutral-700 whitespace-pre-wrap mt-1">{log.notes}</p>}
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-indigo-600 cursor-pointer">{Object.keys(log.changes).length} field(s) changed</summary>
                      <ul className="mt-1 space-y-1">
                        {Object.entries(log.changes).map(([field, change]) => (
                          <li key={field} className="text-xs text-neutral-700">
                            <span className="font-medium">{field}</span>: <span className="line-through text-neutral-400">{JSON.stringify(change.old)}</span> → {JSON.stringify(change.new)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Delete draft?"
        message="This draft has never been submitted and will be permanently removed."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={busy}
      />
    </div>
  )
}
