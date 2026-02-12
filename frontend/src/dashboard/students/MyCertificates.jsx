import React, { useEffect, useState, useCallback } from 'react'
import useToast from '../../hooks/useToast'
import { getMyCertificates, downloadCertificatePdf } from '../../lib/api'

const STATUS_BADGE = {
  issued: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  revoked: 'bg-red-100 text-red-700',
  expired: 'bg-neutral-100 text-neutral-600',
}

export default function MyCertificates() {
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
  const [certificates, setCertificates] = useState([])
  const [downloading, setDownloading] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getMyCertificates()
      .then((data) => {
        if (!mounted) return
        const list = data?.results || (Array.isArray(data) ? data : [])
        setCertificates(list)
      })
      .catch((err) => {
        if (!mounted) return
        reportError(err?.message || 'Failed to load certificates')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [reportError])

  async function handleDownload(cert) {
    setDownloading(cert.id)
    try {
      const blob = await downloadCertificatePdf(cert.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate_${cert.certificate_number || cert.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      reportSuccess('Certificate downloaded')
    } catch (err) {
      reportError(err?.message || 'Failed to download certificate')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-black">My Certificates</h2>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">View and download your issued certificates.</p>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500 py-8 text-center">Loading...</div>
      ) : certificates.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-neutral-300 text-5xl mb-3">&#127942;</div>
          <h3 className="text-lg font-medium text-neutral-700">No Certificates Yet</h3>
          <p className="text-sm text-neutral-500 mt-1">Certificates will appear here once issued upon course completion.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificates.map((cert) => (
            <div key={cert.id} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-black truncate">{cert.course_name}</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">{cert.class_name}</p>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_BADGE[cert.status] || 'bg-neutral-100 text-neutral-600'}`}>
                  {cert.status_display || cert.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-neutral-600 mb-3">
                <div className="flex justify-between">
                  <span>Certificate #</span>
                  <span className="font-mono text-neutral-800">{cert.certificate_number}</span>
                </div>
                {cert.final_grade && (
                  <div className="flex justify-between">
                    <span>Grade</span>
                    <span className="text-neutral-800 font-medium">{cert.final_grade}{cert.final_percentage ? ` (${cert.final_percentage}%)` : ''}</span>
                  </div>
                )}
                {cert.issue_date && (
                  <div className="flex justify-between">
                    <span>Issued</span>
                    <span className="text-neutral-800">{cert.issue_date}</span>
                  </div>
                )}
                {cert.verification_code && (
                  <div className="flex justify-between">
                    <span>Verification</span>
                    <span className="font-mono text-neutral-500 text-[10px]">{cert.verification_code.slice(0, 12)}...</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleDownload(cert)}
                disabled={downloading === cert.id || cert.status === 'revoked'}
                className="w-full px-3 py-2 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {downloading === cert.id ? 'Downloading...' : 'Download PDF'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
