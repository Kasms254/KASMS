import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'
import { SentenceCase } from '../../components/SentenceCase'
import ModernDatePicker from '../../components/ModernDatePicker'
import {
  getAllClasses,
  getClassEnrollments,
  getCertificateTemplatesPaginated,
  addCertificate,
} from '../../lib/api'

export default function CertificateIssue() {
  const navigate = useNavigate()
  const toast = useToast()
  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])
  const reportSuccess = useCallback((msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }, [toast])

  // Dropdowns
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [templates, setTemplates] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(false)
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)

  // Form
  const [form, setForm] = useState({
    class_id: '',
    enrollment_id: '',
    template_id: '',
    final_grade: '',
    final_percentage: '',
    attendance_percentage: '',
    issue_date: '',
    expiry_date: '',
  })
  const [formErrors, setFormErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Helpers for preview
  function toLetter(percent) {
    const p = typeof percent === 'number' ? percent : parseFloat(percent)
    if (Number.isNaN(p)) return null
    if (p >= 90) return 'A'
    if (p >= 80) return 'B'
    if (p >= 70) return 'C'
    if (p >= 60) return 'D'
    return 'F'
  }

  const gradeColor = {
    A: 'bg-emerald-100 text-emerald-700',
    B: 'bg-indigo-100 text-indigo-700',
    C: 'bg-amber-100 text-amber-700',
    D: 'bg-orange-100 text-orange-700',
    F: 'bg-rose-100 text-rose-700',
    '-': 'bg-neutral-100 text-neutral-600',
  }

  // Load classes and templates on mount
  useEffect(() => {
    setLoadingClasses(true)
    Promise.all([
      getAllClasses().catch(() => []),
      getCertificateTemplatesPaginated('is_active=true&page_size=100').catch(() => ({ results: [] })),
    ]).then(([cls, tpl]) => {
      setClasses(Array.isArray(cls) ? cls : cls?.results || [])
      setTemplates(Array.isArray(tpl) ? tpl : tpl?.results || [])
    }).finally(() => setLoadingClasses(false))
  }, [])

  // Load enrollments when class changes
  useEffect(() => {
    if (!form.class_id) {
      setEnrollments([])
      return
    }
    setLoadingEnrollments(true)
    setForm((prev) => ({ ...prev, enrollment_id: '' }))
    getClassEnrollments(form.class_id)
      .then((data) => {
        // The endpoint returns { enrollments: [...] }
        const list = data?.enrollments || data?.results || (Array.isArray(data) ? data : [])
        // Show all enrollments but highlight completed ones
        setEnrollments(list)
      })
      .catch(() => setEnrollments([]))
      .finally(() => setLoadingEnrollments(false))
  }, [form.class_id])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: null }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormErrors({})

    if (!form.enrollment_id) {
      setFormErrors({ enrollment_id: 'Please select a student enrollment' })
      return
    }

    setSubmitting(true)
    try {
      const payload = { enrollment_id: form.enrollment_id }
      if (form.template_id) payload.template_id = form.template_id
      if (form.final_grade) payload.final_grade = form.final_grade
      if (form.final_percentage) payload.final_percentage = parseFloat(form.final_percentage)
      if (form.attendance_percentage) payload.attendance_percentage = parseFloat(form.attendance_percentage)
      if (form.issue_date) payload.issue_date = form.issue_date
      if (form.expiry_date) payload.expiry_date = form.expiry_date

      await addCertificate(payload)
      reportSuccess('Certificate issued successfully')
      navigate('/list/certificates')
    } catch (err) {
      // Map field errors from API
      if (err?.data && typeof err.data === 'object') {
        const d = err.data
        const fieldErrors = {}
        Object.keys(d).forEach((k) => {
          if (Array.isArray(d[k])) fieldErrors[k] = d[k].join(' ')
          else if (typeof d[k] === 'string') fieldErrors[k] = d[k]
        })
        if (Object.keys(fieldErrors).length) {
          setFormErrors(fieldErrors)
          // Show a general error too if there's a non-field error
          if (fieldErrors.non_field_errors) reportError(fieldErrors.non_field_errors)
          else if (fieldErrors.enrollment_id) reportError(fieldErrors.enrollment_id)
          return
        }
      }
      reportError(err?.message || 'Failed to issue certificate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Issue Certificate</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Issue a certificate for a completed enrollment.</p>
        </div>
        <button
          onClick={() => navigate('/list/certificates')}
          className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
        >
          Back to Certificates
        </button>
      </div>

      {(() => {
        const selectedClass = classes.find((c) => String(c.id) === String(form.class_id))
        const selectedEnrollment = enrollments.find((e) => String(e.id) === String(form.enrollment_id))
        const selectedTemplate = templates.find((t) => String(t.id) === String(form.template_id))
        const finalPct = form.final_percentage ? parseFloat(form.final_percentage) : null
        const attendancePct = form.attendance_percentage ? parseFloat(form.attendance_percentage) : null
        const letter = (form.final_grade || '').trim() || toLetter(finalPct) || '-'

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-neutral-200">
          <div className="space-y-4">
            {/* Class Selection */}
            <div>
              <label className="text-sm text-neutral-600 mb-1 block">Class *</label>
              <select
                className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${formErrors.class_id ? 'border-rose-500' : 'border-neutral-200'}`}
                value={form.class_id}
                onChange={(e) => updateField('class_id', e.target.value)}
                disabled={loadingClasses}
              >
                <option value="">{loadingClasses ? 'Loading classes...' : 'Select a class'}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.course_name ? ` (${c.course_name})` : c.course?.name ? ` (${c.course.name})` : ''}
                  </option>
                ))}
              </select>
              {formErrors.class_id && <div className="text-xs text-rose-600 mt-1">{formErrors.class_id}</div>}
            </div>

            {/* Enrollment Selection */}
            <div>
              <label className="text-sm text-neutral-600 mb-1 block">Student Enrollment *</label>
              <select
                className={`w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${formErrors.enrollment_id ? 'border-rose-500' : 'border-neutral-200'}`}
                value={form.enrollment_id}
                onChange={(e) => updateField('enrollment_id', e.target.value)}
                disabled={!form.class_id || loadingEnrollments}
              >
                <option value="">
                  {!form.class_id ? 'Select a class first' : loadingEnrollments ? 'Loading enrollments...' : 'Select a student'}
                </option>
                {enrollments.map((enr) => {
                  const name = enr.student_name || `Student ${enr.student}`
                  const completed = !!enr.completion_date
                  return (
                    <option key={enr.id} value={enr.id}>
                      {name}{enr.student_svc_number ? ` (${enr.student_svc_number})` : ''}{completed ? ' - Completed' : ' - In Progress'}
                    </option>
                  )
                })}
              </select>
              {formErrors.enrollment_id && <div className="text-xs text-rose-600 mt-1">{formErrors.enrollment_id}</div>}
              {form.class_id && !loadingEnrollments && enrollments.length === 0 && (
                <div className="text-xs text-amber-600 mt-1">No enrollments found for this class</div>
              )}
            </div>

            {/* Template */}
            <div>
              <label className="text-sm text-neutral-600 mb-1 block">Certificate Template</label>
              <select
                className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.template_id}
                onChange={(e) => updateField('template_id', e.target.value)}
              >
                <option value="">Use default template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
                ))}
              </select>
              {formErrors.template_id && <div className="text-xs text-rose-600 mt-1">{formErrors.template_id}</div>}
            </div>

            {/* Grade & Percentage */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-neutral-600 mb-1 block">Final Grade</label>
                <input
                  className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="e.g. A, B, C"
                  value={form.final_grade}
                  maxLength={10}
                  onChange={(e) => updateField('final_grade', e.target.value)}
                />
                <div className="text-xs text-neutral-400 mt-0.5">Auto-calculated if empty</div>
              </div>
              <div>
                <label className="text-sm text-neutral-600 mb-1 block">Final Percentage</label>
                <input
                  type="number"
                  className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="0-100"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.final_percentage}
                  onChange={(e) => updateField('final_percentage', e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-neutral-600 mb-1 block">Attendance %</label>
                <input
                  type="number"
                  className="w-full p-2 rounded-md text-black text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="0-100"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.attendance_percentage}
                  onChange={(e) => updateField('attendance_percentage', e.target.value)}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-neutral-600 mb-1 block">Issue Date</label>
                <ModernDatePicker
                  value={form.issue_date}
                  onChange={(v) => updateField('issue_date', v)}
                  placeholder="Select issue date"
                />
                <div className="text-xs text-neutral-400 mt-0.5">Defaults to today if empty</div>
              </div>
              <div>
                <label className="text-sm text-neutral-600 mb-1 block">Expiry Date</label>
                <ModernDatePicker
                  value={form.expiry_date}
                  onChange={(v) => updateField('expiry_date', v)}
                  placeholder="Select expiry date"
                  minDate={form.issue_date || null}
                />
              </div>
            </div>

            {/* Non-field errors */}
            {formErrors.non_field_errors && (
              <div className="p-3 rounded-md bg-red-50 text-sm text-red-700">{formErrors.non_field_errors}</div>
            )}
            {formErrors.detail && (
              <div className="p-3 rounded-md bg-red-50 text-sm text-red-700">{formErrors.detail}</div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={() => navigate('/list/certificates')} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Issuing...' : 'Issue Certificate'}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-neutral-200">
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-semibold text-black">Preview</h3>
            {selectedTemplate ? (
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-neutral-100 text-neutral-700">
                <SentenceCase>{selectedTemplate.name}</SentenceCase>
              </span>
            ) : (
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-neutral-100 text-neutral-600">Default Template</span>
            )}
          </div>

          {!form.enrollment_id ? (
            <EmptyState variant="minimal" icon="UserRound" title="Select a student to preview" />
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${gradeColor[letter] || gradeColor['-']}`}>
                  <span className="text-lg font-bold">{letter}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-black truncate">{selectedEnrollment?.student_name || 'Student'}</div>
                  <div className="text-xs text-neutral-600 truncate">{selectedClass?.name}{selectedClass?.course_name ? ` • ${selectedClass.course_name}` : ''}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Final %</div>
                  <div className="text-base font-semibold text-neutral-900">{finalPct != null && !Number.isNaN(finalPct) ? `${finalPct}%` : '-'}</div>
                </div>
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Attendance %</div>
                  <div className="text-base font-semibold text-neutral-900">{attendancePct != null && !Number.isNaN(attendancePct) ? `${attendancePct}%` : '-'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Issue Date</div>
                  <div className="text-sm font-medium text-neutral-900">{form.issue_date || '—'}</div>
                </div>
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Expiry Date</div>
                  <div className="text-sm font-medium text-neutral-900">{form.expiry_date || '—'}</div>
                </div>
              </div>

              <div className="text-xs text-neutral-600">Grade shown uses your input; if empty, it is derived from Final %.</div>
            </div>
          )}
        </div>
      </div>
        )
      })()}
    </div>
  )
}
