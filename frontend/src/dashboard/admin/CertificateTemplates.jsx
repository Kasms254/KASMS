import { useEffect, useState, useCallback } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'

const TEMPLATE_TYPES = [
  { value: 'completion', label: 'Course Completion' },
  { value: 'achievement', label: 'Achievement' },
  { value: 'participation', label: 'Participation' },
  { value: 'excellence', label: 'Excellence Award' },
]

const INITIAL_FORM = {
  name: '',
  description: '',
  header_text: 'Certificate of Completion',
  body_template: '',
  footer_text: '',
  signatory_name: '',
  signatory_title: '',
  secondary_signatory_name: '',
  secondary_signatory_title: '',
  is_default: false,
  template_type: 'completion',
  use_school_branding: true,
  custom_logo: null,
  signature_image: null,
  secondary_signature_image: null,
}

export default function CertificateTemplates() {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showPreview, setShowPreview] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm.trim()) params.append('search', searchTerm.trim())
      if (filterType) params.append('template_type', filterType)
      const res = await api.getCertificateTemplates(params.toString())
      setTemplates(res?.results || (Array.isArray(res) ? res : []))
    } catch {
      toast?.error?.('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, filterType])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setForm(INITIAL_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  function handleEdit(template) {
    setForm({
      name: template.name || '',
      description: template.description || '',
      header_text: template.header_text || '',
      body_template: template.body_template || '',
      footer_text: template.footer_text || '',
      signatory_name: template.signatory_name || '',
      signatory_title: template.signatory_title || '',
      secondary_signatory_name: template.secondary_signatory_name || '',
      secondary_signatory_title: template.secondary_signatory_title || '',
      is_default: template.is_default || false,
      template_type: template.template_type || 'completion',
      use_school_branding: template.use_school_branding !== false,
      custom_logo: null,
      signature_image: null,
      secondary_signature_image: null,
    })
    setEditingId(template.id)
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name?.trim()) {
      toast?.error?.('Template name is required')
      return
    }
    setSubmitting(true)
    try {
      if (editingId) {
        await api.updateCertificateTemplate(editingId, form)
        toast?.success?.('Template updated')
      } else {
        await api.createCertificateTemplate(form)
        toast?.success?.('Template created')
      }
      resetForm()
      await load()
    } catch (err) {
      const details = err?.data || err?.message || 'Failed to save template'
      const msg = typeof details === 'string' ? details : JSON.stringify(details)
      toast?.error?.(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    setDeleting(true)
    try {
      await api.deleteCertificateTemplate(id)
      toast?.success?.('Template deleted')
      setShowDeleteConfirm(null)
      await load()
    } catch (err) {
      toast?.error?.(err?.data?.error || err?.message || 'Failed to delete template')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSetDefault(id) {
    try {
      await api.setCertificateTemplateDefault(id)
      toast?.success?.('Template set as default')
      await load()
    } catch (err) {
      toast?.error?.(err?.data?.error || err?.message || 'Failed to set default')
    }
  }

  async function handlePreview(id) {
    try {
      const data = await api.previewCertificateTemplate(id)
      setShowPreview(data)
    } catch {
      toast?.error?.('Failed to load preview')
    }
  }

  function getTypeLabel(value) {
    return TEMPLATE_TYPES.find(t => t.value === value)?.label || value
  }

  function getTypeBadgeClasses(type) {
    switch (type) {
      case 'completion': return 'bg-emerald-100 text-emerald-700'
      case 'achievement': return 'bg-amber-100 text-amber-700'
      case 'participation': return 'bg-blue-100 text-blue-700'
      case 'excellence': return 'bg-purple-100 text-purple-700'
      default: return 'bg-neutral-100 text-neutral-700'
    }
  }

  const filtered = templates

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificate Templates</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage certificate templates used when issuing certificates</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition whitespace-nowrap"
        >
          <LucideIcons.Plus className="w-4 h-4" />
          New Template
        </button>
      </header>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search templates..."
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">All Types</option>
            {TEMPLATE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {(searchTerm || filterType) && (
            <button
              onClick={() => { setSearchTerm(''); setFilterType('') }}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Loader2" title="Loading templates..." variant="minimal" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200">
          <EmptyState
            icon="FileText"
            title="No templates found"
            description={searchTerm || filterType ? 'Try adjusting your search or filter.' : 'Create your first certificate template to get started.'}
            actionLabel={!searchTerm && !filterType ? 'Create Template' : undefined}
            onAction={!searchTerm && !filterType ? () => { resetForm(); setShowForm(true) } : undefined}
          />
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="lg:hidden space-y-3">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-black truncate">{t.name}</span>
                      {t.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex-shrink-0">Default</span>
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getTypeBadgeClasses(t.template_type)}`}>
                      {getTypeLabel(t.template_type)}
                    </span>
                  </div>
                </div>
                {t.description && <p className="text-xs text-neutral-500 mb-3 line-clamp-2">{t.description}</p>}
                <div className="space-y-1 text-xs mb-3">
                  {t.signatory_name && (
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-500">Signatory:</span>
                      <span className="text-black">{t.signatory_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-neutral-500">Branding:</span>
                    <span className="text-black">{t.use_school_branding ? 'School' : 'Custom'}</span>
                  </div>
                  {t.has_signature && (
                    <div className="flex justify-between gap-2">
                      <span className="text-neutral-500">Signature:</span>
                      <span className="text-emerald-600">Uploaded</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handlePreview(t.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-neutral-100 text-neutral-700 text-xs hover:bg-neutral-200 transition">
                    <LucideIcons.Eye className="w-3 h-3" /> Preview
                  </button>
                  <button onClick={() => handleEdit(t)} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-neutral-100 text-neutral-700 text-xs hover:bg-neutral-200 transition">
                    <LucideIcons.Pencil className="w-3 h-3" /> Edit
                  </button>
                  {!t.is_default && (
                    <button onClick={() => handleSetDefault(t.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 text-xs hover:bg-amber-100 transition">
                      <LucideIcons.Star className="w-3 h-3" /> Set Default
                    </button>
                  )}
                  <button onClick={() => setShowDeleteConfirm(t)} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-50 text-red-600 text-xs hover:bg-red-100 transition">
                    <LucideIcons.Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Template</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Signatory</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Branding</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {filtered.map(t => (
                    <tr key={t.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-black">{t.name}</div>
                        {t.description && <div className="text-xs text-neutral-500 mt-0.5 max-w-xs truncate">{t.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTypeBadgeClasses(t.template_type)}`}>
                          {getTypeLabel(t.template_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.signatory_name ? (
                          <div>
                            <div className="text-sm text-black">{t.signatory_name}</div>
                            {t.signatory_title && <div className="text-xs text-neutral-500">{t.signatory_title}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {t.use_school_branding ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              <LucideIcons.Building2 className="w-3 h-3" /> School
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                              <LucideIcons.Palette className="w-3 h-3" /> Custom
                            </span>
                          )}
                          {t.has_signature && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <LucideIcons.PenTool className="w-3 h-3" /> Sig
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {t.is_default ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                            <LucideIcons.Check className="w-3 h-3" /> Default
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handlePreview(t.id)} className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition" title="Preview">
                            <LucideIcons.Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleEdit(t)} className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition" title="Edit">
                            <LucideIcons.Pencil className="w-4 h-4" />
                          </button>
                          {!t.is_default && (
                            <button onClick={() => handleSetDefault(t.id)} className="p-1.5 rounded-md text-amber-500 hover:bg-amber-50 hover:text-amber-700 transition" title="Set as default">
                              <LucideIcons.Star className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => setShowDeleteConfirm(t)} className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition" title="Delete">
                            <LucideIcons.Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={resetForm} />
          <div className="relative z-10 max-w-2xl w-full bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-black">{editingId ? 'Edit Template' : 'Create New Template'}</h3>
              <button onClick={resetForm} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                <LucideIcons.X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[70vh]">
              <div className="p-6 space-y-5">
                {/* Basic Info */}
                <div>
                  <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                    <LucideIcons.FileText className="w-4 h-4 text-neutral-400" /> Basic Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Template Name <span className="text-red-500">*</span></label>
                      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Completion Certificate" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Template Type</label>
                      <select value={form.template_type} onChange={(e) => setForm({ ...form, template_type: e.target.value })} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200">
                        {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Header Text</label>
                      <input value={form.header_text} onChange={(e) => setForm({ ...form, header_text: e.target.value })} placeholder="Certificate of Completion" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Description</label>
                      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description for internal reference" rows={2} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Body Template</label>
                      <textarea value={form.body_template} onChange={(e) => setForm({ ...form, body_template: e.target.value })} placeholder="Custom body text. Use {student_name}, {course_name}, {class_name}, {completion_date}, {grade}" rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none font-mono" />
                      <p className="mt-1 text-[11px] text-neutral-400">Placeholders: {'{student_name}'}, {'{course_name}'}, {'{class_name}'}, {'{completion_date}'}, {'{grade}'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Footer Text</label>
                      <input value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} placeholder="e.g. Accreditation information" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                  </div>
                </div>

                {/* Signatory Info */}
                <div>
                  <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                    <LucideIcons.PenTool className="w-4 h-4 text-neutral-400" /> Signatory Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Primary Signatory Name</label>
                      <input value={form.signatory_name} onChange={(e) => setForm({ ...form, signatory_name: e.target.value })} placeholder="e.g. Col. John Smith" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Primary Signatory Title</label>
                      <input value={form.signatory_title} onChange={(e) => setForm({ ...form, signatory_title: e.target.value })} placeholder="e.g. Commandant" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Secondary Signatory Name</label>
                      <input value={form.secondary_signatory_name} onChange={(e) => setForm({ ...form, secondary_signatory_name: e.target.value })} placeholder="Optional" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-1">Secondary Signatory Title</label>
                      <input value={form.secondary_signatory_title} onChange={(e) => setForm({ ...form, secondary_signatory_title: e.target.value })} placeholder="Optional" className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                  </div>
                </div>

                {/* Branding & Files */}
                <div>
                  <h4 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
                    <LucideIcons.Palette className="w-4 h-4 text-neutral-400" /> Branding & Images
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                      <input
                        id="use_school_branding"
                        type="checkbox"
                        checked={form.use_school_branding}
                        onChange={(e) => setForm({ ...form, use_school_branding: e.target.checked })}
                        className="w-4 h-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="use_school_branding" className="text-sm text-black">
                        Use school branding
                        <span className="block text-xs text-neutral-500">Uses your school's logo and colours automatically</span>
                      </label>
                    </div>

                    {!form.use_school_branding && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 border border-neutral-200 rounded-lg bg-neutral-50">
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">Custom Logo</label>
                          <input type="file" accept="image/*" onChange={(e) => setForm({ ...form, custom_logo: e.target.files[0] || null })} className="w-full text-xs text-neutral-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-neutral-200 file:text-neutral-700 hover:file:bg-neutral-300" />
                        </div>
                        <div />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Primary Signature Image</label>
                        <input type="file" accept="image/*" onChange={(e) => setForm({ ...form, signature_image: e.target.files[0] || null })} className="w-full text-xs text-neutral-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-neutral-200 file:text-neutral-700 hover:file:bg-neutral-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Secondary Signature Image</label>
                        <input type="file" accept="image/*" onChange={(e) => setForm({ ...form, secondary_signature_image: e.target.files[0] || null })} className="w-full text-xs text-neutral-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-neutral-200 file:text-neutral-700 hover:file:bg-neutral-300" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Default Toggle */}
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <input
                    id="is_default"
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                    className="w-4 h-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="is_default" className="text-sm text-black">
                    Set as default template
                    <span className="block text-xs text-neutral-500">This template will be used automatically when issuing certificates</span>
                  </label>
                </div>
              </div>

              {/* Form Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-100 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 transition">
                  {submitting ? <LucideIcons.Loader2 className="w-4 h-4 animate-spin" /> : <LucideIcons.Check className="w-4 h-4" />}
                  {submitting ? 'Saving...' : editingId ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative z-10 max-w-md w-full bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <LucideIcons.Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-black">Delete Template</h3>
                <p className="text-sm text-neutral-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-neutral-700 mb-6">
              Are you sure you want to delete <span className="font-medium text-black">"{showDeleteConfirm.name}"</span>? Any certificates already issued with this template will not be affected.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-100 transition">
                Cancel
              </button>
              <button onClick={() => handleDelete(showDeleteConfirm.id)} disabled={deleting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50 transition">
                {deleting ? <LucideIcons.Loader2 className="w-4 h-4 animate-spin" /> : <LucideIcons.Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPreview(null)} />
          <div className="relative z-10 max-w-3xl w-full bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-black">Certificate Preview</h3>
              <button onClick={() => setShowPreview(null)} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">
                <LucideIcons.X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[75vh]">
              <div className="border-2 border-neutral-200 rounded-lg p-8 bg-white" style={{ borderColor: showPreview.primary_color || '#e5e5e5' }}>
                {/* Certificate Header */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: showPreview.primary_color || '#000' }}>
                      {showPreview.school_name || 'Training Institution'}
                    </h3>
                  </div>
                  {showPreview.logo_base64 && (
                    <img src={showPreview.logo_base64} alt="School logo" className="h-16 w-16 object-contain" />
                  )}
                </div>

                {/* Certificate Body */}
                <div className="text-center my-8">
                  <div className="inline-block px-6 py-2 mb-4 border-b-2" style={{ borderColor: showPreview.accent_color || '#FFC107' }}>
                    <h2 className="text-2xl font-bold" style={{ color: showPreview.primary_color || '#000' }}>
                      {showPreview.header_text || 'Certificate'}
                    </h2>
                  </div>
                  <p className="text-sm text-neutral-500 mt-4">This is to certify that</p>
                  <div className="text-2xl font-bold text-black mt-2">{showPreview.student_name}</div>
                  <div className="text-sm text-neutral-600 mt-1">{showPreview.student_rank} — {showPreview.student_svc_number}</div>
                  <p className="text-sm text-neutral-500 mt-4">has successfully completed</p>
                  <div className="text-lg font-semibold text-black mt-2">{showPreview.course_name}</div>
                  <div className="text-sm text-neutral-600">{showPreview.class_name}</div>
                  {showPreview.final_grade && (
                    <div className="mt-3 text-sm text-neutral-700">
                      Grade: <span className="font-semibold text-black">{showPreview.final_grade}</span>
                      {showPreview.final_percentage && <span className="ml-2">({showPreview.final_percentage}%)</span>}
                    </div>
                  )}
                  <div className="text-sm text-neutral-500 mt-4">
                    Date: {showPreview.completion_date ? new Date(showPreview.completion_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                  </div>
                </div>

                {/* Signatures */}
                <div className="mt-12 flex items-end justify-around">
                  <div className="text-center">
                    {showPreview.signature_image ? (
                      <img src={showPreview.signature_image} alt="Primary signature" className="h-14 object-contain mx-auto" />
                    ) : (
                      <div className="h-14 w-32 border-b border-neutral-300" />
                    )}
                    <div className="mt-2 font-semibold text-sm text-black">{showPreview.signatory_name}</div>
                    <div className="text-xs text-neutral-500">{showPreview.signatory_title}</div>
                  </div>
                  {(showPreview.secondary_signatory_name || showPreview.secondary_signature_image) && (
                    <div className="text-center">
                      {showPreview.secondary_signature_image ? (
                        <img src={showPreview.secondary_signature_image} alt="Secondary signature" className="h-14 object-contain mx-auto" />
                      ) : (
                        <div className="h-14 w-32 border-b border-neutral-300" />
                      )}
                      <div className="mt-2 font-semibold text-sm text-black">{showPreview.secondary_signatory_name}</div>
                      <div className="text-xs text-neutral-500">{showPreview.secondary_signatory_title}</div>
                    </div>
                  )}
                </div>

                {/* Certificate Footer */}
                <div className="mt-8 pt-4 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-400">
                  <span>Certificate No: {showPreview.certificate_number}</span>
                  <span>Verification: {showPreview.verification_code}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
