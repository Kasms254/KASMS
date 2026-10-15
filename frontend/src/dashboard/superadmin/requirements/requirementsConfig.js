// Question set for the Role Requirements Assessment form. The form, the
// review-before-submit screen and the detail page all render from this list,
// so the questions are defined once. Required flags mirror the backend's
// completeness rules (core/role_requirement_serializers.py); the backend is
// the authority and its errors are always shown.

export const SECTIONS = [
  {
    key: 'A',
    title: 'Stakeholder and role',
    intro: 'Who is giving these requirements, for which office, and who validates them.',
    fields: [
      { name: 'assessed_role', label: 'Office being assessed', type: 'select', choices: 'assessed_roles', required: true },
      { name: 'stakeholder_name', label: 'Full name', type: 'text', required: true },
      { name: 'stakeholder_designation', label: 'Official designation', type: 'text', required: true },
      { name: 'organizational_unit', label: 'Department, unit or section', type: 'text', required: true },
      {
        name: 'stakeholder_contact', label: 'Contact (optional)', type: 'text', sensitive: true,
        help: 'Only if needed for follow-up. Visible to superadmins only and never shown in summaries.',
      },
      { name: 'validator_name', label: 'Name of the person validating these requirements', type: 'text', required: true },
      { name: 'validator_designation', label: 'Designation of the validator', type: 'text', required: true },
      { name: 'submission_type', label: 'Initial request or revision', type: 'select', choices: 'submission_types', required: true },
      {
        name: 'revises', label: 'Submission being revised', type: 'revises', required: true,
        showIf: (f) => f.submission_type === 'revision',
      },
    ],
  },
  {
    key: 'B',
    title: 'Responsibilities and objectives',
    intro: 'What the office is responsible for and what it must decide.',
    fields: [
      { name: 'main_responsibilities', label: 'What are your main responsibilities in your current appointment?', type: 'textarea', required: true },
      { name: 'key_tasks', label: 'What are the three most important tasks you expect to accomplish using KASMS?', type: 'tasks', required: true },
      { name: 'decisions_requiring_information', label: 'What decisions do you make that require information from the system?', type: 'textarea', required: true },
      { name: 'time_consuming_activities', label: 'Which activities currently consume the most time?', type: 'textarea' },
      { name: 'hard_to_obtain_information', label: 'What information do you regularly need but struggle to obtain?', type: 'textarea' },
    ],
  },
  {
    key: 'C',
    title: 'Current problem and workflow',
    intro: 'Describe a real operational problem. "I need a dashboard" is not a problem description.',
    fields: [
      {
        name: 'problem_statement', label: 'What specific problem are you experiencing?', type: 'textarea', required: true,
        help: 'Say who is affected and what goes wrong (at least one full sentence).',
      },
      { name: 'affected_people_processes', label: 'Which people or processes are affected?', type: 'textarea', required: true },
      { name: 'current_workflow', label: 'How is the work currently performed?', type: 'textarea', required: true },
      { name: 'current_tools', label: 'Existing tools, registers, spreadsheets or manual processes involved', type: 'textarea' },
      { name: 'problem_frequency', label: 'How often does the problem occur?', type: 'select', choices: 'frequencies', required: true },
      { name: 'problem_consequences', label: 'What are the consequences of the problem?', type: 'textarea', required: true },
      { name: 'estimated_effort_lost', label: 'Estimated time, effort or resources lost', type: 'textarea' },
      { name: 'partial_existing_feature', label: 'Any existing KASMS feature that partially addresses the problem', type: 'textarea' },
      {
        name: 'recent_example', label: 'Give a concrete example of a recent occurrence', type: 'textarea', required: true,
        help: 'Do not include sensitive operational details or personal information.',
      },
    ],
  },
  {
    key: 'D',
    title: 'Expected outcomes',
    intro: 'What success looks like and how it will be measured.',
    fields: [
      { name: 'desired_capability', label: 'What should KASMS enable you to do that you cannot do effectively today?', type: 'textarea', required: true },
      { name: 'expected_improvement', label: 'What should be easier, faster, more accurate or more transparent?', type: 'textarea' },
      { name: 'baseline', label: 'Current baseline (where available)', type: 'textarea', help: 'e.g. "Consolidation takes three working days each month."' },
      { name: 'measurable_result', label: 'What measurable result would show the problem is solved?', type: 'textarea', required: true },
      { name: 'success_determination', label: 'How would you determine whether the solution is successful?', type: 'textarea', required: true },
    ],
  },
  {
    key: 'E',
    title: 'Functional requirements',
    intro: 'Each capability the office needs. Requesting a capability does not grant any permission.',
    fields: [{ name: 'capabilities', type: 'capabilities', required: true }],
  },
  {
    key: 'F',
    title: 'Information and reporting needs',
    intro: 'The exact information required. Do not paste sensitive records as examples.',
    fields: [
      { name: 'information_needs', type: 'information', required: true },
      { name: 'sample_reports_description', label: 'Describe any reports or registers you currently use (no attachments, no sensitive data)', type: 'textarea' },
    ],
  },
  {
    key: 'G',
    title: 'Interface preference and dashboard justification',
    intro: 'The preference is input for technical analysis, not a decision. A reviewer decides whether a dashboard is justified.',
    fields: [
      { name: 'preferred_interface', label: 'Preferred interface', type: 'select', choices: 'preferred_interfaces', required: true },
      {
        name: 'preferred_interface_other', label: 'Describe the preferred interface', type: 'text', required: true,
        showIf: (f) => f.preferred_interface === 'other',
      },
      {
        name: 'consolidated_overview_needed', label: 'A consolidated overview drawing on several sources might be necessary', type: 'checkbox',
        showIf: (f) => f.preferred_interface !== 'dashboard',
      },
      { name: 'recurring_decisions', label: 'What recurring decisions must you make using information from multiple sources?', type: 'textarea', required: true, showIf: dashboardRequested },
      { name: 'monitored_indicators', label: 'Which indicators must you monitor regularly?', type: 'textarea', required: true, showIf: dashboardRequested },
      { name: 'indicator_change_frequency', label: 'How frequently do these indicators change?', type: 'select', choices: 'frequencies', required: true, showIf: dashboardRequested },
      { name: 'threshold_actions', label: 'What action do you take when an indicator changes or crosses a threshold?', type: 'textarea', required: true, showIf: dashboardRequested },
      { name: 'alternatives_insufficient_reason', label: 'Why would a report, searchable table, notification or existing page be insufficient?', type: 'textarea', required: true, showIf: dashboardRequested },
      { name: 'overview_usage_frequency', label: 'How often would you use a consolidated overview?', type: 'select', choices: 'frequencies', required: true, showIf: dashboardRequested },
    ],
  },
  {
    key: 'H',
    title: 'Access and organizational boundaries',
    intro: 'What the office says it needs. Access is validated against approved policy; nothing is granted from this form.',
    fields: [
      { name: 'access_records', label: 'Which records should this office access?', type: 'textarea', required: true },
      { name: 'access_level', label: 'Read-only or including changes?', type: 'select', choices: 'access_levels', required: true },
      { name: 'access_boundaries', label: 'Organizational boundaries the access should be limited to', type: 'boundaries', required: true },
      { name: 'access_boundary_notes', label: 'Notes on boundaries', type: 'textarea' },
      { name: 'needs_approval_authority', label: 'Does the office require approval authority?', type: 'select', choices: 'yes_no_unsure', required: true },
      { name: 'needs_cross_unit_aggregates', label: 'Does it need aggregated information across organizational units?', type: 'select', choices: 'yes_no_unsure', required: true },
      { name: 'restricted_to_assignments', label: 'Should access be restricted to assigned responsibilities?', type: 'select', choices: 'yes_no_unsure', required: true },
      { name: 'needs_audit_trail', label: "Does the office's activity require an audit trail?", type: 'select', choices: 'yes_no_unsure', required: true },
    ],
  },
]

export function dashboardRequested(form) {
  return form.preferred_interface === 'dashboard' || Boolean(form.consolidated_overview_needed)
}

// Section E + I fields collected for every requested capability.
export const CAPABILITY_FIELDS = [
  { name: 'capability', label: 'Capability', type: 'select', choices: 'capability_types', required: true },
  { name: 'description', label: 'What do you need to do?', required: true },
  { name: 'rationale', label: 'Why is it necessary?', required: true },
  { name: 'information_required', label: 'Which information is required?' },
  { name: 'initiator', label: 'Who initiates the process?', required: true },
  { name: 'actioned_by', label: 'Who reviews, approves or acts on the result?' },
  { name: 'expected_output', label: 'What output or outcome is expected?', required: true },
  { name: 'frequency', label: 'How often is it used?', type: 'select', choices: 'frequencies', required: true },
  // Section I — priority and acceptance criteria
  { name: 'priority', label: 'Priority', type: 'select', choices: 'priorities', required: true },
  { name: 'users_affected', label: 'Number or category of users affected' },
  { name: 'impact_if_unresolved', label: 'Impact if unresolved' },
  { name: 'dependencies', label: 'Dependencies on other workflows or data' },
  {
    name: 'acceptance_criteria', label: 'Testable acceptance criteria', required: true, wide: true,
    help: 'Describe an observable result, e.g. "When an authorized user filters by reporting period, only records for that period and their scope are shown." Avoid "should be user-friendly".',
  },
]

export const INFORMATION_FIELDS = [
  { name: 'data_fields', label: 'Required data fields', required: true, wide: true },
  { name: 'source', label: 'Source of the information' },
  { name: 'exists_in_kasms', label: 'Does it already exist in KASMS?', type: 'select', choices: 'yes_no_unsure' },
  { name: 'capture_method', label: 'Entered manually or retrieved automatically?', type: 'select', choices: 'capture_methods' },
  { name: 'filters', label: 'Required search filters' },
  { name: 'reporting_periods', label: 'Required reporting periods' },
  { name: 'formats', label: 'Formats needed', type: 'multi', choices: 'information_formats', required: true, wide: true },
  { name: 'authorized_viewers', label: 'Who is authorized to view it?', required: true },
  { name: 'update_frequency', label: 'How often must it be updated?', type: 'select', choices: 'frequencies' },
]

export const EMPTY_CAPABILITY = Object.fromEntries(CAPABILITY_FIELDS.map((f) => [f.name, '']))
export const EMPTY_INFORMATION = Object.fromEntries(
  INFORMATION_FIELDS.map((f) => [f.name, f.type === 'multi' ? [] : '']),
)

export const EMPTY_FORM = {
  assessed_role: '',
  stakeholder_name: '',
  stakeholder_designation: '',
  organizational_unit: '',
  stakeholder_contact: '',
  validator_name: '',
  validator_designation: '',
  submission_type: 'initial',
  revises: null,
  main_responsibilities: '',
  key_tasks: ['', '', ''],
  decisions_requiring_information: '',
  time_consuming_activities: '',
  hard_to_obtain_information: '',
  problem_statement: '',
  affected_people_processes: '',
  current_workflow: '',
  current_tools: '',
  problem_frequency: '',
  problem_consequences: '',
  estimated_effort_lost: '',
  partial_existing_feature: '',
  recent_example: '',
  desired_capability: '',
  expected_improvement: '',
  measurable_result: '',
  success_determination: '',
  baseline: '',
  capabilities: [{ ...EMPTY_CAPABILITY }],
  information_needs: [{ ...EMPTY_INFORMATION }],
  sample_reports_description: '',
  preferred_interface: '',
  preferred_interface_other: '',
  consolidated_overview_needed: false,
  recurring_decisions: '',
  monitored_indicators: '',
  indicator_change_frequency: '',
  threshold_actions: '',
  alternatives_insufficient_reason: '',
  overview_usage_frequency: '',
  access_records: '',
  access_level: '',
  access_boundaries: [],
  access_boundary_notes: '',
  needs_approval_authority: '',
  needs_cross_unit_aggregates: '',
  restricted_to_assignments: '',
  needs_audit_trail: '',
}

export const STATUS_STYLES = {
  draft: 'bg-neutral-100 text-neutral-700',
  submitted: 'bg-sky-100 text-sky-700',
  under_review: 'bg-indigo-100 text-indigo-700',
  clarification_required: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  in_development: 'bg-purple-100 text-purple-700',
  implemented: 'bg-teal-100 text-teal-700',
  verified: 'bg-green-600 text-white',
}

export const PRIORITY_STYLES = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-neutral-100 text-neutral-700',
}

export function labelFor(list, value) {
  if (!list || value === null || value === undefined || value === '') return ''
  const hit = list.find((c) => c.value === value)
  return hit ? hit.label : String(value)
}

// Build the PATCH/POST body from form state: drop empty capability /
// information rows and blank key tasks so drafts stay tidy.
export function toPayload(form) {
  const isBlank = (row) => Object.values(row).every((v) => (Array.isArray(v) ? v.length === 0 : !v))
  const payload = {}
  for (const key of Object.keys(EMPTY_FORM)) payload[key] = form[key]
  payload.key_tasks = (form.key_tasks || []).map((t) => t.trim()).filter(Boolean)
  payload.capabilities = (form.capabilities || []).filter((row) => !isBlank(row))
  payload.information_needs = (form.information_needs || []).filter((row) => !isBlank(row))
  if (payload.submission_type !== 'revision') payload.revises = null
  return payload
}

// Merge a server record into form state (fills defaults for missing keys).
export function fromRecord(record) {
  const form = { ...EMPTY_FORM }
  for (const key of Object.keys(EMPTY_FORM)) {
    if (record[key] !== undefined && record[key] !== null) form[key] = record[key]
  }
  form.revises = record.revises || null
  const tasks = [...(record.key_tasks || [])]
  while (tasks.length < 3) tasks.push('')
  form.key_tasks = tasks
  form.capabilities = record.capabilities?.length
    ? record.capabilities.map((c) => ({ ...EMPTY_CAPABILITY, ...c }))
    : [{ ...EMPTY_CAPABILITY }]
  form.information_needs = record.information_needs?.length
    ? record.information_needs.map((n) => ({ ...EMPTY_INFORMATION, ...n }))
    : [{ ...EMPTY_INFORMATION }]
  return form
}

// Client-side mirror of the required-field rules, used only to guide the
// user before the server validates on submit.
export function missingRequired(form) {
  const missing = {}
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      if (!field.required) continue
      if (field.showIf && !field.showIf(form)) continue
      const value = form[field.name]
      if (field.type === 'tasks') {
        if (!(value || []).some((t) => t.trim())) missing[field.name] = 'List at least one task.'
      } else if (field.type === 'capabilities' || field.type === 'information' || field.type === 'boundaries') {
        const rows = toPayload(form)[field.name]
        if (!rows || rows.length === 0) missing[field.name] = 'At least one entry is required.'
      } else if (value === '' || value === null || value === undefined) {
        missing[field.name] = 'This field is required.'
      }
    }
  }
  return missing
}

export function sectionOfField(name) {
  const section = SECTIONS.find((s) => s.fields.some((f) => f.name === name))
  return section ? section.key : null
}
