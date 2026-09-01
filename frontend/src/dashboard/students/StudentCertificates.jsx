import { useState, useEffect } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'

export default function StudentCertificates() {
  const toast = useToast()
  const [certificates, setCertificates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api.getCertificates()
      .then((data) => {
        if (!mounted) return
        const list = data?.results || (Array.isArray(data) ? data : [])
        setCertificates(list)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return dateStr }
  }

  async function handlePreview(cert) {
    setBusyId(`preview-${cert.id}`)
    try {
      const blob = await api.previewIssuedCertificate(cert.id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      toast?.error?.(err?.message || 'Failed to preview certificate')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDownload(cert) {
    setBusyId(`download-${cert.id}`)
    try {
      const blob = await api.downloadCertificatePdf(cert.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeNumber = (cert.certificate_number || cert.id).toString().replace(/\//g, '_')
      a.download = `certificate_${safeNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast?.success?.('Certificate downloaded')
    } catch (err) {
      toast?.error?.(err?.message || 'Failed to download certificate')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6 pb-10">
      <header className="mb-6 sm:mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">My Certificates</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">Certificates issued for completed courses</p>
        </div>
        {!loading && !error && certificates.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-full px-3 py-1.5">
            <LucideIcons.Award className="w-4 h-4 text-emerald-600" />
            <span>{certificates.length} {certificates.length === 1 ? 'certificate' : 'certificates'} earned</span>
          </div>
        )}
      </header>

      {error ? (
        <div className="p-6 bg-white rounded-xl border border-red-200">
          <EmptyState icon="AlertCircle" title="Error loading certificates" description={error.message || String(error)} variant="minimal" />
        </div>
      ) : loading ? (
        <div className="p-6 bg-white rounded-xl border border-neutral-200">
          <EmptyState icon="Loader2" title="Loading certificates..." variant="minimal" />
        </div>
      ) : certificates.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200">
          <EmptyState
            icon="Award"
            title="No certificates yet"
            description="You will receive certificates upon completing all subjects in a class."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {certificates.map((cert) => {
            const isRevoked = cert.status === 'revoked'
            return (
              <div
                key={cert.id}
                className="group relative bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
              >
                {/* Decorative header band */}
                <div className={`relative px-5 pt-5 pb-8 ${isRevoked ? 'bg-neutral-100' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.15]"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                      backgroundSize: '14px 14px',
                    }}
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${isRevoked ? 'bg-white text-neutral-400' : 'bg-white/15 backdrop-blur text-white ring-1 ring-white/40'}`}>
                      <LucideIcons.Award className="w-6 h-6" />
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isRevoked ? 'bg-white text-neutral-500' : 'bg-white/20 text-white backdrop-blur'}`}>
                      {cert.status_display || (isRevoked ? 'Revoked' : 'Issued')}
                    </span>
                  </div>
                  <p className={`relative mt-4 text-xs font-medium uppercase tracking-wide ${isRevoked ? 'text-neutral-400' : 'text-white/70'}`}>
                    Certificate of Completion
                  </p>
                  <h3 className={`relative text-lg font-semibold leading-snug line-clamp-2 ${isRevoked ? 'text-neutral-600' : 'text-white'}`}>
                    {cert.course_name || cert.class_name || 'Certificate'}
                  </h3>
                </div>

                {/* Certificate number, overlapping the band like a seal/tag */}
                <div className="relative -mt-4 mx-5">
                  <div className="bg-white rounded-lg border border-neutral-200 shadow-sm px-3 py-2">
                    <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Certificate Number</div>
                    <div className="font-mono text-sm font-semibold text-black truncate">{cert.certificate_number}</div>
                  </div>
                </div>

                {/* Meta details */}
                <div className="px-5 pt-4 pb-5 flex-1 flex flex-col">
                  <dl className="space-y-2 text-sm flex-1">
                    {cert.class_name && cert.class_name !== cert.course_name && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-neutral-500">Class</dt>
                        <dd className="text-black font-medium text-right">{cert.class_name}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500">Issued</dt>
                      <dd className="text-black text-right">{formatDate(cert.issued_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500">Issued by</dt>
                      <dd className="text-black text-right">{cert.issued_by_role || '—'}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center gap-2">
                    <button
                      onClick={() => handlePreview(cert)}
                      disabled={busyId === `preview-${cert.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <LucideIcons.Eye className="w-4 h-4" />
                      Preview
                    </button>
                    <button
                      onClick={() => handleDownload(cert)}
                      disabled={busyId === `download-${cert.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <LucideIcons.Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
