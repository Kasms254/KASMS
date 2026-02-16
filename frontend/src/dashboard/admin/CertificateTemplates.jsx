import { useEffect, useState } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'

export default function CertificateTemplates() {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', header_text: '', body_template: '', footer_text: '', signatory_name: '', signatory_title: '', secondary_signatory_name: '', secondary_signatory_title: '', is_default: false, template_type: 'completion', use_school_branding: true, custom_logo: null, signature_image: null, secondary_signature_image: null })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.getCertificateTemplates()
      setTemplates(res?.results || [])
    } catch (e) {
      toast?.error?.('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDefault(id) {
    try {
      await api.setCertificateTemplateDefault(id)
      toast?.success?.('Template set as default')
      await load()
    } catch (e) {
      toast?.error?.(e?.data?.error || e?.message || 'Failed')
    }
  }

  async function handlePreview(id) {
    try {
      const data = await api.previewCertificateTemplate(id)
      setShowPreview(data)
    } catch (e) {
      toast?.error?.('Failed to load preview')
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name || !form.name.trim()) {
      toast?.error?.('Template name is required')
      return
    }

    setCreating(true)
    try {
      await api.createCertificateTemplate(form)
      toast?.success?.('Template created')
      setForm({ name: '', header_text: '', body_template: '', footer_text: '', signatory_name: '', signatory_title: '', secondary_signatory_name: '', secondary_signatory_title: '', is_default: false, template_type: 'completion', use_school_branding: true, custom_logo: null, signature_image: null, secondary_signature_image: null })
      await load()
    } catch (err) {
      console.error('Create template error', err)
      const details = err?.data || err?.message || err
      try {
        const msg = typeof details === 'string' ? details : JSON.stringify(details)
        toast?.error?.(msg)
      } catch {
        toast?.error?.('Failed to create template')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificate Templates</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage certificate templates used when issuing certificates</p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <form onSubmit={handleCreate} className="p-4 bg-white rounded-xl border border-neutral-200 shadow-sm">
          <h3 className="text-sm font-medium mb-2 text-black">Create Template</h3>
          <input value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} placeholder="Name" className="w-full mb-2 px-3 py-2 border border-neutral-200 rounded text-black" />
          <input value={form.header_text} onChange={(e)=>setForm({...form, header_text:e.target.value})} placeholder="Header text" className="w-full mb-2 px-3 py-2 border border-neutral-200 rounded text-black" />
          <input value={form.signatory_name} onChange={(e)=>setForm({...form, signatory_name:e.target.value})} placeholder="Signatory name" className="w-full mb-2 px-3 py-2 border border-neutral-200 rounded text-black" />
          <input value={form.signatory_title} onChange={(e)=>setForm({...form, signatory_title:e.target.value})} placeholder="Signatory title" className="w-full mb-2 px-3 py-2 border border-neutral-200 rounded text-black" />
          <input value={form.secondary_signatory_name} onChange={(e)=>setForm({...form, secondary_signatory_name:e.target.value})} placeholder="Secondary signatory name (optional)" className="w-full mb-2 px-3 py-2 border border-neutral-200 rounded text-black" />
          <input value={form.secondary_signatory_title} onChange={(e)=>setForm({...form, secondary_signatory_title:e.target.value})} placeholder="Secondary signatory title (optional)" className="w-full mb-2 px-3 py-2 border border-neutral-200 rounded text-black" />
          <div className="mb-2">
            <label className="text-xs text-neutral-600 block mb-1">Use school branding</label>
            <select value={form.use_school_branding ? 'yes' : 'no'} onChange={(e)=>setForm({...form, use_school_branding: e.target.value === 'yes'})} className="w-full px-3 py-2 border border-neutral-200 rounded text-black">
              <option value="yes">Yes (use school logo and colors)</option>
              <option value="no">No (provide custom logo/colors)</option>
            </select>
          </div>
          {!form.use_school_branding && (
            <>
              <label className="text-xs text-neutral-600 block mb-1">Custom Logo</label>
              <input type="file" accept="image/*" onChange={(e)=>setForm({...form, custom_logo: e.target.files[0] || null})} className="w-full mb-2" />
              <label className="text-xs text-neutral-600 block mb-1">Primary signature image</label>
              <input type="file" accept="image/*" onChange={(e)=>setForm({...form, signature_image: e.target.files[0] || null})} className="w-full mb-2" />
              <label className="text-xs text-neutral-600 block mb-1">Secondary signature image</label>
              <input type="file" accept="image/*" onChange={(e)=>setForm({...form, secondary_signature_image: e.target.files[0] || null})} className="w-full mb-2" />
            </>
          )}
          <div className="flex items-center gap-2 mb-2">
            <input id="default" type="checkbox" checked={form.is_default} onChange={(e)=>setForm({...form, is_default:e.target.checked})} />
            <label htmlFor="default" className="text-sm text-black">Set as default</label>
          </div>
          <div className="mb-2">
            <label className="text-xs text-neutral-600 block mb-1">Template Type</label>
            <select value={form.template_type} onChange={(e)=>setForm({...form, template_type: e.target.value})} className="w-full px-3 py-2 border border-neutral-200 rounded text-black">
              <option value="completion">Course Completion</option>
              <option value="achievement">Achievement</option>
              <option value="participation">Participation</option>
              <option value="excellence">Excellence Award</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button className="px-3 py-2 bg-emerald-600 text-white rounded" disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
          </div>
        </form>

        <div className="md:col-span-2 p-4 bg-white rounded-xl border border-neutral-200 shadow-sm">
          <h3 className="text-sm font-medium mb-2 text-black">Existing Templates</h3>
          {loading ? <div className="text-neutral-600">Loading...</div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-2">Name</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Default</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 text-black">{t.name}</td>
                    <td className="py-2 text-neutral-700">{t.template_type}</td>
                    <td className="py-2 text-neutral-700">{t.is_default ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">
                      <button onClick={()=>handlePreview(t.id)} className="px-2 py-1 mr-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">Preview</button>
                      {!t.is_default && <button onClick={()=>handleSetDefault(t.id)} className="px-2 py-1 mr-2 bg-amber-600 text-white rounded">Set Default</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={()=>setShowPreview(null)} />
          <div className="relative z-10 max-w-3xl w-full bg-white rounded-xl p-6 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-black">Template Preview</h4>
              <button onClick={()=>setShowPreview(null)} className="text-neutral-500"><LucideIcons.X /></button>
            </div>
            <div className="p-6 border rounded-lg" style={{ background: '#fff' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: showPreview.primary_color || '#000' }}>{showPreview.school_name || 'Training Institution'}</h3>
                  <div className="text-sm text-neutral-600">{showPreview.header_text || 'Certificate of Completion'}</div>
                </div>
                {showPreview.logo_base64 && <img src={showPreview.logo_base64} alt="logo" className="h-16 object-contain" />}
              </div>

              <div className="text-center my-6">
                <h2 className="text-2xl font-bold text-black">{showPreview.header_text || 'Certificate'}</h2>
                <p className="text-sm text-neutral-600 mt-2">Awarded to</p>
                <div className="text-xl font-semibold text-black mt-2">{showPreview.student_name}</div>
                <div className="text-sm text-neutral-700 mt-1">{showPreview.student_rank} — {showPreview.student_svc_number}</div>
                <div className="mt-4 text-sm text-neutral-600">For successfully completing</div>
                <div className="font-medium text-black mt-1">{showPreview.course_name} — {showPreview.class_name}</div>
                <div className="text-sm text-neutral-600 mt-3">Date: {new Date(showPreview.completion_date).toLocaleDateString()}</div>
              </div>

              <div className="mt-8 flex items-end justify-between">
                <div className="text-center w-1/2">
                  {showPreview.signature_image ? (
                    <img src={showPreview.signature_image} alt="signature" className="h-16 object-contain mx-auto" />
                  ) : (
                    <div className="h-16" />
                  )}
                  <div className="mt-2 font-semibold text-black">{showPreview.signatory_name}</div>
                  <div className="text-sm text-neutral-600">{showPreview.signatory_title}</div>
                </div>

                <div className="text-center w-1/2">
                  {showPreview.secondary_signature_image ? (
                    <img src={showPreview.secondary_signature_image} alt="signature" className="h-16 object-contain mx-auto" />
                  ) : (
                    <div className="h-16" />
                  )}
                  <div className="mt-2 font-semibold text-black">{showPreview.secondary_signatory_name}</div>
                  <div className="text-sm text-neutral-600">{showPreview.secondary_signatory_title}</div>
                </div>
              </div>

              <div className="mt-6 text-xs text-neutral-500">Certificate No: {showPreview.certificate_number} • Verification: {showPreview.verification_code}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
