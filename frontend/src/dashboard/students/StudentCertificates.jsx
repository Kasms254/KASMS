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

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-black">My Certificates</h2>
        <p className="text-xs sm:text-sm text-neutral-500">Certificates issued for completed courses</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificates.map((cert) => (
            <div key={cert.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden hover:shadow-md transition">
              {/* Top accent */}
              <div className="h-1.5 bg-emerald-500" />
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <LucideIcons.Award className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">Issued</span>
                </div>
                <div className="p-4 sm:p-5 border-t border-neutral-100 flex items-center justify-end gap-2">
                  <button
                    onClick={async () => {
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
                      }
                    }}
                    className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
                  >
                    Download
                  </button>
                </div>

                <div className="mb-3">
                  <div className="text-xs text-neutral-500 mb-0.5">Certificate Number</div>
                  <div className="font-mono text-sm font-semibold text-black">{cert.certificate_number}</div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-neutral-500">Class</span>
                    <span className="text-black font-medium">{cert.class_name || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-neutral-500">Issued</span>
                    <span className="text-black">{formatDate(cert.issued_at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-neutral-500">Issued by</span>
                    <span className="text-black">{cert.issued_by_name || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
