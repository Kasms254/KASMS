import { useEffect, useState, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import Card from '../../components/Card'
import { getCommandantCertificates, getCommandantCertificatesSummary } from '../../lib/api'
import useToast from '../../hooks/useToast'

const STATUS_BADGE = {
  issued: 'bg-green-100 text-green-700',
  revoked: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function initials(name = '') {
  return name.split(' ').map((s) => s[0] || '').slice(0, 2).join('').toUpperCase()
}

export default function CommandantCertificates() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [certificates, setCertificates] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const PAGE_SIZE = 20

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getCommandantCertificatesSummary()
        setSummary(data)
      } catch { /* ignore */ }
    })()
  }, [])

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        let params = `page=${page}&page_size=${PAGE_SIZE}`
        if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
        const data = await getCommandantCertificates(params)
        const list = Array.isArray(data) ? data : data?.results ?? []
        setCertificates(list)
        if (data?.count !== undefined) setTotalPages(Math.ceil(data.count / PAGE_SIZE))
      } catch (err) {
        reportError(err?.message || 'Failed to load certificates')
      } finally {
        setLoading(false)
      }
    })()
  }, [search, page, reportError])

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificates</h2>
          <p className="text-xs sm:text-sm text-neutral-500">All certificates issued in this school</p>
        </div>
      </header>

      <section className="grid gap-4 sm:gap-6">
        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card title="Total Certificates" value={summary.total} icon="Award" accent="bg-indigo-600" colored />
            <Card title="Issued" value={summary.issued} icon="CheckCircle" accent="bg-emerald-500" colored />
            <Card title="Revoked" value={summary.revoked} icon="XCircle" accent="bg-pink-500" colored />
            {summary.by_class?.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Top Class</p>
                <p className="text-sm font-medium text-black truncate">
                  {summary.by_class[0]?.class_name || summary.by_class[0]?.class_obj || '—'}
                </p>
                <p className="text-2xl font-semibold text-black mt-1">{summary.by_class[0]?.count ?? '—'}</p>
              </div>
            )}
          </div>
        )}

        {/* By-class breakdown */}
        {summary?.by_class?.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <h3 className="text-sm font-semibold text-black mb-3">Certificates by Class</h3>
            <div className="space-y-2">
              {summary.by_class.map((item) => (
                <div key={item.class_obj || item.class_name} className="flex items-center justify-between">
                  <span className="text-sm text-neutral-700">{item.class_name || item.class_obj}</span>
                  <span className="text-sm font-semibold text-black">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
          <div className="relative">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by name or certificate number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <EmptyState icon="Loader2" title="Loading certificates..." variant="minimal" />
          </div>
        ) : certificates.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200">
            <EmptyState
              icon="Award"
              title="No certificates found"
              description={search ? `No certificates match "${search}".` : 'No certificates have been issued yet.'}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Mobile card view */}
            <div className="lg:hidden p-4 space-y-3">
              {certificates.map((c) => (
                <div key={c.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm flex-shrink-0">
                        {initials(c.student_name || '?')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-black">{c.student_name || '—'}</p>
                        <p className="text-xs text-neutral-500">{c.student_svc_number || ''}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-semibold capitalize flex-shrink-0 ${STATUS_BADGE[c.status] || 'bg-neutral-100 text-neutral-600'}`}>
                      {c.status || '—'}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-neutral-500">
                    <p>Course: <span className="text-black">{c.course_name || '—'}</span></p>
                    <p>Cert No: <span className="text-black font-mono">{c.certificate_number || '—'}</span></p>
                    <p>Issued: <span className="text-black">{formatDate(c.issued_at)}</span></p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Course</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Certificate No.</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Issued</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {certificates.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                            {initials(c.student_name || '?')}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-black">{c.student_name || '—'}</p>
                            <p className="text-xs text-neutral-500">{c.student_svc_number || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{c.course_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700 font-mono">{c.certificate_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{formatDate(c.issued_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_BADGE[c.status] || 'bg-neutral-100 text-neutral-600'}`}>
                          {c.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                <p className="text-xs text-neutral-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs rounded-lg bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-40 transition">Previous</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
