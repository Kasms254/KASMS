import { useEffect, useState, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import useToast from '../../hooks/useToast'
import ConfirmModal from '../../components/ConfirmModal'
import EmptyState from '../../components/EmptyState'
import { SentenceCase } from '../../components/SentenceCase'
import {
  getCertificateTemplatesPaginated,
  getCertificateTemplate,
  addCertificateTemplate,
  updateCertificateTemplate,
  deleteCertificateTemplate,
  setDefaultCertificateTemplate,
} from '../../lib/api'

const TEMPLATE_TYPES = [
  { value: 'completion', label: 'Completion' },
  { value: 'achievement', label: 'Achievement' },
  { value: 'participation', label: 'Participation' },
  { value: 'excellence', label: 'Excellence' },
]

const TYPE_BADGE = {
  completion: 'bg-indigo-100 text-indigo-700',
  achievement: 'bg-amber-100 text-amber-700',
  participation: 'bg-sky-100 text-sky-700',
  excellence: 'bg-emerald-100 text-emerald-700',
}

const EMPTY_FORM = {
  name: '',
  template_type: 'completion',
  description: '',
  header_text: 'Certificate of Completion',
  body_template: '',
  footer_text: '',
  signatory_name: '',
  signatory_title: '',
  secondary_signatory_name: '',
  secondary_signatory_title: '',
  use_school_branding: true,
  is_active: true,
}

function sanitizeInput(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\0/g, '')
}

export default function CertificateTemplates() {
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

  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(10)

  // Add modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ ...EMPTY_FORM })
  const [formErrors, setFormErrors] = useState({})

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM })
  const [editLoading, setEditLoading] = useState(false)

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = `page=${currentPage}&page_size=${pageSize}`
      const data = await getCertificateTemplatesPaginated(params)
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      setTemplates(list)
      if (data && data.count !== undefined) {
        setTotalCount(data.count)
        setTotalPages(Math.ceil(data.count / pageSize))
      }
    } catch (err) {
      reportError(err?.message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, reportError])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    setFormErrors({})
    if (!newTemplate.name) return reportError('Template name is required')
    try {
      await addCertificateTemplate(newTemplate)
      reportSuccess('Template created')
      setNewTemplate({ ...EMPTY_FORM })
      setAddModalOpen(false)
      load()
    } catch (err) {
      if (err?.data && typeof err.data === 'object') {
        const fieldErrors = {}
        Object.keys(err.data).forEach((k) => {
          if (Array.isArray(err.data[k])) fieldErrors[k] = err.data[k].join(' ')
          else if (typeof err.data[k] === 'string') fieldErrors[k] = err.data[k]
        })
        if (Object.keys(fieldErrors).length) return setFormErrors(fieldErrors)
      }
      reportError(err?.message || 'Failed to create template')
    }
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!editingTemplate) return
    setFormErrors({})
    try {
      await updateCertificateTemplate(editingTemplate.id, editForm)
      reportSuccess('Template updated')
      setEditModalOpen(false)
      load()
    } catch (err) {
      if (err?.data && typeof err.data === 'object') {
        const fieldErrors = {}
        Object.keys(err.data).forEach((k) => {
          if (Array.isArray(err.data[k])) fieldErrors[k] = err.data[k].join(' ')
          else if (typeof err.data[k] === 'string') fieldErrors[k] = err.data[k]
        })
        if (Object.keys(fieldErrors).length) return setFormErrors(fieldErrors)
      }
      reportError(err?.message || 'Failed to update template')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCertificateTemplate(deleteTarget.id)
      reportSuccess('Template deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to delete template')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSetDefault(template) {
    try {
      await setDefaultCertificateTemplate(template.id)
      reportSuccess(`"${template.name}" set as default`)
      load()
    } catch (err) {
      reportError(err?.message || 'Failed to set default template')
    }
  }

  async function openEdit(template) {
    setEditingTemplate(template)
    setFormErrors({})
    setEditModalOpen(true)
    // Attempt to fetch full details for the template if API supports it
    try {
      setEditLoading(true)
      if (typeof getCertificateTemplate === 'function') {
        const full = await getCertificateTemplate(template.id)
        const t = full || template
        setEditForm({
          name: t.name || '',
          template_type: t.template_type || 'completion',
          description: t.description || '',
          header_text: t.header_text || '',
          body_template: t.body_template || '',
          footer_text: t.footer_text || '',
          signatory_name: t.signatory_name || '',
          signatory_title: t.signatory_title || '',
          secondary_signatory_name: t.secondary_signatory_name || '',
          secondary_signatory_title: t.secondary_signatory_title || '',
          use_school_branding: t.use_school_branding !== false,
          is_active: t.is_active !== false,
        })
      } else {
        // Fallback to passed-in list item
        setEditForm({
          name: template.name || '',
          template_type: template.template_type || 'completion',
          description: template.description || '',
          header_text: template.header_text || '',
          body_template: template.body_template || '',
          footer_text: template.footer_text || '',
          signatory_name: template.signatory_name || '',
          signatory_title: template.signatory_title || '',
          secondary_signatory_name: template.secondary_signatory_name || '',
          secondary_signatory_title: template.secondary_signatory_title || '',
          use_school_branding: template.use_school_branding !== false,
          is_active: template.is_active !== false,
        })
      }
    } catch (e) {
      // graceful fallback
      setEditForm({
        name: template.name || '',
        template_type: template.template_type || 'completion',
        description: template.description || '',
        header_text: template.header_text || '',
        body_template: template.body_template || '',
        footer_text: template.footer_text || '',
        signatory_name: template.signatory_name || '',
        signatory_title: template.signatory_title || '',
        secondary_signatory_name: template.secondary_signatory_name || '',
        secondary_signatory_title: template.secondary_signatory_title || '',
        use_school_branding: template.use_school_branding !== false,
        is_active: template.is_active !== false,
      })
    } finally {
      setEditLoading(false)
    }
  }

  function applyPlaceholders(tplBody) {
    const sample = {
      student_name: 'Jane Doe',
      course_name: 'Basic First Aid',
      class_name: 'Class A',
      completion_date: '2026-02-12',
      grade: 'A',
    }
    let text = tplBody || ''
    Object.entries(sample).forEach(([k, v]) => {
      const re = new RegExp(`\\{${k}\\}`, 'g')
      text = text.replace(re, v)
    })
    return text
  }

  function renderFormFields(form, setForm) {
    const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-neutral-600 mb-1 block">Name *</label>
            <input
              className={`w-full border rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 ${formErrors.name ? 'border-rose-500' : 'border-neutral-200'}`}
              placeholder="e.g. Default Certificate"
              value={form.name}
              maxLength={200}
              onChange={(e) => update('name', sanitizeInput(e.target.value))}
            />
            {formErrors.name && <div className="text-xs text-rose-600 mt-1">{formErrors.name}</div>}
          </div>
          <div>
            <label className="text-sm text-neutral-600 mb-1 block">Type</label>
            <select
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={form.template_type}
              onChange={(e) => update('template_type', e.target.value)}
            >
              {TEMPLATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm text-neutral-600 mb-1 block">Description</label>
          <input
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Short description"
            value={form.description}
            maxLength={500}
            onChange={(e) => update('description', sanitizeInput(e.target.value))}
          />
        </div>

        <div>
          <label className="text-sm text-neutral-600 mb-1 block">Header Text</label>
          <input
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Certificate of Completion"
            value={form.header_text}
            maxLength={500}
            onChange={(e) => update('header_text', sanitizeInput(e.target.value))}
          />
        </div>

        <div>
          <label className="text-sm text-neutral-600 mb-1 block">Body Template</label>
          <textarea
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            rows={3}
            placeholder="This certifies that {student_name} has completed {course_name}..."
            value={form.body_template}
            onChange={(e) => update('body_template', sanitizeInput(e.target.value))}
          />
          <div className="text-xs text-neutral-400 mt-0.5">
            Placeholders: {'{student_name}'}, {'{course_name}'}, {'{class_name}'}, {'{completion_date}'}, {'{grade}'}
          </div>
        </div>

        <div>
          <label className="text-sm text-neutral-600 mb-1 block">Footer Text</label>
          <input
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Footer text"
            value={form.footer_text}
            maxLength={500}
            onChange={(e) => update('footer_text', sanitizeInput(e.target.value))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-neutral-600 mb-1 block">Signatory Name</label>
            <input
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Director"
              value={form.signatory_name}
              maxLength={200}
              onChange={(e) => update('signatory_name', sanitizeInput(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-600 mb-1 block">Signatory Title</label>
            <input
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Director of Training"
              value={form.signatory_title}
              maxLength={200}
              onChange={(e) => update('signatory_title', sanitizeInput(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-neutral-600 mb-1 block">Secondary Signatory</label>
            <input
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Name"
              value={form.secondary_signatory_name}
              maxLength={200}
              onChange={(e) => update('secondary_signatory_name', sanitizeInput(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-600 mb-1 block">Secondary Title</label>
            <input
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Title"
              value={form.secondary_signatory_title}
              maxLength={200}
              onChange={(e) => update('secondary_signatory_title', sanitizeInput(e.target.value))}
            />
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.use_school_branding}
              onChange={(e) => update('use_school_branding', e.target.checked)}
              className="rounded border-neutral-300"
            />
            Use school branding
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update('is_active', e.target.checked)}
              className="rounded border-neutral-300"
            />
            Active
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificate Templates</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage certificate templates used when issuing certificates.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => { setNewTemplate({ ...EMPTY_FORM }); setFormErrors({}); setAddModalOpen(true) }}
            className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm whitespace-nowrap"
          >
            Add Template
          </button>
        </div>
      </header>

      {/* Template Cards */}
      {loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="LoaderCircle" title="Loading templates..." description="" variant="minimal" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-8">
          <EmptyState
            icon="File"
            title="No Templates Yet"
            description="Create a certificate template to get started."
            actionLabel="Add Template"
            onAction={() => { setNewTemplate({ ...EMPTY_FORM }); setFormErrors({}); setAddModalOpen(true) }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div key={tpl.id} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-black truncate">{tpl.name}</h3>
                  {tpl.description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{tpl.description}</p>}
                </div>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${TYPE_BADGE[tpl.template_type] || 'bg-neutral-100 text-neutral-600'}`}>
                  <SentenceCase>{tpl.template_type}</SentenceCase>
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {tpl.is_default && (
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">Default</span>
                )}
                {!tpl.is_active && (
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Inactive</span>
                )}
                {tpl.is_active && !tpl.is_default && (
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Active</span>
                )}
              </div>

              {(tpl.signatory_name || tpl.header_text) && (
                <div className="space-y-1 text-xs text-neutral-500 mb-3 border-t border-neutral-100 pt-2">
                  {tpl.header_text && (
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-400">Header:</span>
                      <span className="text-neutral-700 truncate">{tpl.header_text}</span>
                    </div>
                  )}
                  {tpl.signatory_name && (
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-400">Signed by:</span>
                      <span className="text-neutral-700 truncate">{tpl.signatory_name}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-neutral-100">
                <button
                  onClick={() => openEdit(tpl)}
                  className="px-2.5 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-700 transition whitespace-nowrap"
                >
                  Edit
                </button>
                {!tpl.is_default && (
                  <button
                    onClick={() => handleSetDefault(tpl)}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 text-xs text-white hover:bg-emerald-700 transition whitespace-nowrap"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget(tpl)}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-xs text-white hover:bg-red-700 transition whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalCount > 10 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((currentPage - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> templates
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>

              <div className="flex items-center gap-1">
                {(() => {
                  const pages = []
                  const maxVisible = 5
                  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
                  let endPage = Math.min(totalPages, startPage + maxVisible - 1)

                  if (endPage - startPage < maxVisible - 1) {
                    startPage = Math.max(1, endPage - maxVisible + 1)
                  }

                  if (startPage > 1) {
                    pages.push(
                      <button key={1} onClick={() => setCurrentPage(1)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        1
                      </button>
                    )
                    if (startPage > 2) {
                      pages.push(<span key="ellipsis1" className="px-2 text-neutral-400">...</span>)
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition ${
                          currentPage === i
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'border border-neutral-200 bg-white text-black hover:bg-neutral-50'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="ellipsis2" className="px-2 text-neutral-400">...</span>)
                    }
                    pages.push(
                      <button key={totalPages} onClick={() => setCurrentPage(totalPages)} className="px-3 py-1.5 text-sm text-black rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition">
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Create Template</h4>
                  <p className="text-sm text-neutral-500">Add a new certificate template</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setAddModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAdd}>
                {renderFormFields(newTemplate, setNewTemplate)}
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Create Template</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit Template</h4>
                  <p className="text-sm text-neutral-500">Update template information</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                  <LucideIcons.X className="w-5 h-5" />
                </button>
              </div>
              {editLoading ? (
                <div className="py-8 text-center text-sm text-neutral-600">Loading template...</div>
              ) : (
                <form onSubmit={handleEdit}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>{renderFormFields(editForm, setEditForm)}</div>
                    <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-black">Preview</h5>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TYPE_BADGE[editForm.template_type] || 'bg-neutral-100 text-neutral-600'}`}>
                          <SentenceCase>{editForm.template_type}</SentenceCase>
                        </span>
                      </div>
                      <div className="mt-2">
                        <div className="text-base font-semibold text-neutral-900">{editForm.header_text || 'Certificate'}</div>
                        <p className="text-sm text-neutral-700 mt-2 whitespace-pre-wrap">{applyPlaceholders(editForm.body_template)}</p>
                      </div>
                      {(editForm.signatory_name || editForm.secondary_signatory_name) && (
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-neutral-700">
                          {editForm.signatory_name && (
                            <div>
                              <div className="font-medium">{editForm.signatory_name}</div>
                              {editForm.signatory_title && <div className="text-neutral-500">{editForm.signatory_title}</div>}
                            </div>
                          )}
                          {editForm.secondary_signatory_name && (
                            <div>
                              <div className="font-medium">{editForm.secondary_signatory_name}</div>
                              {editForm.secondary_signatory_title && <div className="text-neutral-500">{editForm.secondary_signatory_title}</div>}
                            </div>
                          )}
                        </div>
                      )}
                      {editForm.footer_text && (
                        <div className="mt-3 pt-2 border-t border-neutral-200 text-xs text-neutral-600">{editForm.footer_text}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                    <button type="button" onClick={() => { setEditModalOpen(false); setDeleteTarget(editingTemplate) }} className="px-3 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                      <button className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">Save Changes</button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Template"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.` : ''}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
        confirmVariant="danger"
      />
    </div>
  )
}
