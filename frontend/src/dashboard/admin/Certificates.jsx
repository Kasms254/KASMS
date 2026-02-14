import { useState, useEffect } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'

export default function Certificates() {
  const { user } = useAuth()
  const toast = useToast()
  const [certificates, setCertificates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    const params = new URLSearchParams()
    params.append('page', page)
    params.append('page_size', pageSize)
    if (searchTerm.trim()) {
      params.append('search', searchTerm.trim())
    }

    api.getCertificates(params.toString())
      .then((data) => {
        if (!mounted) return
        const list = data?.results || (Array.isArray(data) ? data : [])
        setCertificates(list)
        setTotalCount(data?.count || list.length)
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
  }, [page, pageSize, searchTerm])

  const totalPages = Math.ceil(totalCount / pageSize)

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return dateStr }
  }

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificates</h2>
          <p className="text-xs sm:text-sm text-neutral-500">All issued certificates</p>
        </div>
      </header>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
              placeholder="Search by certificate number or service number..."
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(''); setPage(1) }}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

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
            title="No certificates found"
            description={searchTerm ? `No certificates match "${searchTerm}".` : 'No certificates have been issued yet. Issue certificates from a closed class.'}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          {/* Mobile Card View */}
          <div className="lg:hidden p-4 space-y-3">
            {certificates.map((cert) => (
              <div key={cert.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-black">{cert.student_name || '—'}</div>
                    <div className="text-xs text-neutral-500">{cert.student_svc_number || '—'}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                    <LucideIcons.Award className="w-3 h-3 inline mr-1" />Issued
                  </span>
                </div>
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Certificate #:</span><span className="text-black font-mono">{cert.certificate_number}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Class:</span><span className="text-black">{cert.class_name || '—'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Issued:</span><span className="text-black">{formatDate(cert.issued_at)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Issued by:</span><span className="text-black">{cert.issued_by_name || '—'}</span></div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Certificate #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Service No</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Issued Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Issued By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {certificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-3 text-sm text-black font-mono whitespace-nowrap">{cert.certificate_number}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{cert.student_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{cert.student_svc_number || '—'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{cert.class_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{formatDate(cert.issued_at)}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{cert.issued_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalCount > 0 && totalPages > 1 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-neutral-600">
              Showing <span className="font-semibold text-black">{Math.min((page - 1) * pageSize + 1, totalCount)}</span> to{' '}
              <span className="font-semibold text-black">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-black">{totalCount}</span> certificates
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <LucideIcons.ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>
              <span className="px-3 py-1.5 text-sm text-black">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <LucideIcons.ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
