import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, ArrowLeft, Loader } from 'lucide-react'
import {
  getCommandantReportDetail,
  createCommandantReport,
  updateCommandantReport,
} from '../../lib/api'
import ModernDatePicker from '../../components/ModernDatePicker'

function Field({ label, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-900">{label}</label>
      {hint && <p className="text-xs text-gray-600 mt-0.5 mb-1.5">{hint}</p>}
      {!hint && <div className="mb-1" />}
      {children}
    </div>
  )
}

function Textarea({ name, value, onChange, placeholder, rows = 5 }) {
  return (
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
    />
  )
}


export default function CommandantReportForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    title: '',
    reporting_period_start: '',
    reporting_period_end: '',
    report_date: new Date().toISOString().split('T')[0],
    observations: '',
    challenges: '',
    achievements: '',
    recommendations: '',
    overall_remarks: '',
  })
  const [errors, setErrors] = useState({})

  const { data: existing, isPending: loadingExisting } = useQuery({
    queryKey: ['commandant-report', id],
    queryFn: () => getCommandantReportDetail(id),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title || '',
        reporting_period_start: existing.reporting_period_start || '',
        reporting_period_end: existing.reporting_period_end || '',
        report_date: existing.report_date || new Date().toISOString().split('T')[0],
        observations: existing.observations || '',
        challenges: existing.challenges || '',
        achievements: existing.achievements || '',
        recommendations: existing.recommendations || '',
        overall_remarks: existing.overall_remarks || '',
      })
    }
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isEdit ? updateCommandantReport(id, data) : createCommandantReport(data),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['commandant-reports'] })
      navigate(`/commandant/reports/${saved.id || id}`)
    },
    onError: (err) => {
      if (err?.data) setErrors(err.data)
    },
  })

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  // ModernDatePicker hands back a plain YYYY-MM-DD string, not an event.
  function handleDateChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.reporting_period_start) errs.reporting_period_start = 'Required'
    if (!form.reporting_period_end) errs.reporting_period_end = 'Required'
    if (form.reporting_period_start && form.reporting_period_end &&
        form.reporting_period_start > form.reporting_period_end) {
      errs.reporting_period_end = 'End date must be after start date'
    }
    if (Object.keys(errs).length) { setErrors(errs); return }
    saveMutation.mutate(form)
  }

  if (isEdit && loadingExisting) return (
    <div className="flex items-center justify-center py-20">
      <Loader className="animate-spin text-blue-600" size={28} />
    </div>
  )

  if (isEdit && existing?.status !== 'draft') return (
    <div className="max-w-2xl mx-auto p-6 text-center">
      <p className="text-gray-900 mb-4">This report has been submitted and is no longer editable.</p>
      <button
        onClick={() => navigate(`/commandant/reports/${id}`)}
        className="text-blue-700 underline text-sm"
      >
        View report
      </button>
    </div>
  )

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-900">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isEdit ? 'Edit Report Draft' : 'New School Report'}
          </h2>
          <p className="text-sm text-gray-900">Statistics are automatically computed on submission.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Report identification */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 border-b pb-2">Report Identification</h3>

          <Field label="Report Title" hint="Leave blank to auto-generate from school name and period.">
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. KACEME — Jan 2025 to Jun 2025"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Period Start *">
              <ModernDatePicker
                value={form.reporting_period_start}
                onChange={(v) => handleDateChange('reporting_period_start', v)}
                placeholder="Select start date"
                maxDate={form.reporting_period_end || null}
              />
              {errors.reporting_period_start && <p className="text-red-500 text-xs mt-1">{errors.reporting_period_start}</p>}
            </Field>

            <Field label="Period End *">
              <ModernDatePicker
                value={form.reporting_period_end}
                onChange={(v) => handleDateChange('reporting_period_end', v)}
                placeholder="Select end date"
                minDate={form.reporting_period_start || null}
              />
              {errors.reporting_period_end && <p className="text-red-500 text-xs mt-1">{errors.reporting_period_end}</p>}
            </Field>

            <Field label="Report Date">
              <ModernDatePicker
                value={form.report_date}
                onChange={(v) => handleDateChange('report_date', v)}
                placeholder="Select report date"
              />
            </Field>
          </div>
        </section>

        {/* Commandant narrative */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 border-b pb-2">Commandant's Narrative</h3>
          <p className="text-xs text-gray-900">
            All statistics (students, instructors, courses, performance) are computed automatically
            from the system at submission time. Use this section for qualitative observations.
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Observations" hint="Key observations about the school's operations during this period.">
              <Textarea name="observations" value={form.observations} onChange={handleChange} placeholder="Describe your observations…" />
            </Field>

            <Field label="Challenges" hint="Significant challenges encountered during the reporting period.">
              <Textarea name="challenges" value={form.challenges} onChange={handleChange} placeholder="List challenges faced…" />
            </Field>

            <Field label="Achievements" hint="Notable achievements and milestones.">
              <Textarea name="achievements" value={form.achievements} onChange={handleChange} placeholder="Describe achievements…" />
            </Field>

            <Field label="Recommendations" hint="Recommendations for improvement or action.">
              <Textarea name="recommendations" value={form.recommendations} onChange={handleChange} placeholder="Provide recommendations…" />
            </Field>

            <Field label="Overall Remarks" hint="Any other remarks or closing statements." className="xl:col-span-2">
              <Textarea name="overall_remarks" value={form.overall_remarks} onChange={handleChange} placeholder="Overall remarks…" />
            </Field>
          </div>
        </section>

        {saveMutation.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Failed to save. Please check the form and try again.
          </div>
        )}

        {/* Footer bar — same card surface as the sections above, so the actions
            read as the end of the form rather than loose page content. */}
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-gray-900 sm:max-w-md">
            Saved as a draft — you can review it and submit to the Chief of Training afterwards.
          </p>
          {/* Stacked and full-width on phones (primary action on top), inline on wider screens */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end sm:shrink-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Draft'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
