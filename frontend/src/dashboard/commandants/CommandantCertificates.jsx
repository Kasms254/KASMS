import { useEffect, useState, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import Card from '../../components/Card'
import AdminPagination from '../../components/AdminPagination'
import {
  getCommandantCertificates,
  getCommandantCertificatesSummary,
  getCommandantCertificatesByClass,
  downloadCertificatePdf,
} from '../../lib/api'
import useToast from '../../hooks/useToast'

const STATUS_BADGE = {
  issued: 'bg-green-100 text-green-700',
  revoked: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
}

const CLASS_PAGE_SIZE = 12

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function initials(name = '') {
  return name.split(' ').map((s) => s[0] || '').slice(0, 2).join('').toUpperCase()
}

// Opens on the classes that have certificates and drills into one at a time —
// a single flat list across the whole school does not say which class a
// certificate belongs to without reading every row.
export default function CommandantCertificates() {
  const toast = useToast()
  const [summary, setSummary] = useState(null)
  const [classes, setClasses] = useState([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [classSearch, setClassSearch] = useState('')
  const [classPage, setClassPage] = useState(1)

  const [selectedClass, setSelectedClass] = useState(null)
  const [loading, setLoading] = useState(false)
  const [certificates, setCertificates] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [downloading, setDownloading] = useState(null)

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
    ;(async () => {
      try {
        const data = await getCommandantCertificatesByClass()
        setClasses(data?.results || (Array.isArray(data) ? data : []))
      } catch (err) {
        reportError(err?.message || 'Failed to load certificates')
      } finally {
        setClassesLoading(false)
      }
    })()
  }, [reportError])

  useEffect(() => {
    if (!selectedClass) return
    setLoading(true)
    ;(async () => {
      try {
        let params = `page=${page}&page_size=${pageSize}`
        if (selectedClass.class_id) params += `&class_obj=${selectedClass.class_id}`
        if (search.trim()) params += `&search=${encodeURIComponent(search.trim())}`
        const data = await getCommandantCertificates(params)
        const list = Array.isArray(data) ? data : data?.results ?? []
        setCertificates(list)
        setTotalCount(data?.count ?? list.length)
      } catch (err) {
        reportError(err?.message || 'Failed to load certificates')
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedClass, search, page, pageSize, reportError])

  function openClass(cls) {
    setSelectedClass(cls)
    setCertificates([])
    setSearch('')
    setPage(1)
  }

  async function handleDownload(cert) {
    setDownloading(cert.id)
    try {
      const blob = await downloadCertificatePdf(cert.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate_${String(cert.certificate_number || cert.id).replace(/\//g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      reportError(err?.message || 'Failed to download certificate')
    } finally {
      setDownloading(null)
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  const filteredClasses = classes.filter((c) => {
    if (!classSearch.trim()) return true
    const term = classSearch.toLowerCase()
    return (
      (c.class_name || '').toLowerCase().includes(term) ||
      (c.course_name || '').toLowerCase().includes(term)
    )
  })
  // The grouped endpoint returns one row per class, so paginate client-side.
  const classTotalPages = Math.ceil(filteredClasses.length / CLASS_PAGE_SIZE)
  const currentClassPage = Math.min(classPage, Math.max(classTotalPages, 1))
  const pagedClasses = filteredClasses.slice(
    (currentClassPage - 1) * CLASS_PAGE_SIZE,
    currentClassPage * CLASS_PAGE_SIZE,
  )

  // ---------- Class picker ----------
  if (!selectedClass) {
    return (
      <div className="w-full px-3 sm:px-4 md:px-6 pb-8 shrink-0">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">Certificates</h2>
            <p className="text-xs sm:text-sm text-neutral-500">Pick a class to see the certificates issued for it</p>
          </div>
        </header>

        <section className="grid gap-4 sm:gap-6">
          {summary && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 sm:p-4">
              <div className="grid grid-cols-3 divide-x divide-neutral-200">
                {[
                  { label: 'Total', value: summary.total, icon: 'Award', tone: 'bg-indigo-50 text-indigo-600' },
                  { label: 'Issued', value: summary.issued, icon: 'CheckCircle', tone: 'bg-emerald-50 text-emerald-600' },
                  { label: 'Revoked', value: summary.revoked, icon: 'XCircle', tone: 'bg-pink-50 text-pink-600' },
                ].map((stat) => {
                  const Icon = LucideIcons[stat.icon]
                  return (
                    <div key={stat.label} className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 first:pl-0 last:pr-0">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${stat.tone}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-wide text-neutral-500 truncate">{stat.label}</div>
                        <div className="text-lg sm:text-xl font-semibold text-black leading-tight">{stat.value ?? 0}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search classes */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <div className="relative">
              <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by class or course..."
                value={classSearch}
                onChange={(e) => { setClassSearch(e.target.value); setClassPage(1) }}
                className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {classesLoading ? (
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <EmptyState icon="Loader2" title="Loading certificates..." variant="minimal" />
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200">
              <EmptyState
                icon="Award"
                title="No certificates found"
                description={classSearch ? `No class matches "${classSearch}".` : 'No certificates have been issued yet.'}
              />
            </div>
          ) : (
            <div>
              <div className="mb-3 text-sm text-neutral-600">
                Showing {((currentClassPage - 1) * CLASS_PAGE_SIZE) + 1} - {Math.min(currentClassPage * CLASS_PAGE_SIZE, filteredClasses.length)} of {filteredClasses.length} classes
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pagedClasses.map((c) => (
                  <div
                    key={c.class_id || c.class_name}
                    className="relative h-full cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => openClass(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClass(c) } }}
                  >
                    <Card
                      title={c.course_name || '—'}
                      value={c.class_name}
                      badge={`${c.total} Certificate${c.total === 1 ? '' : 's'}`}
                      icon="Award"
                      className="h-full flex flex-col"
                    >
                      <div className="flex flex-col flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">{c.issued} Issued</span>
                          {c.revoked > 0 && (
                            <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full">{c.revoked} Revoked</span>
                          )}
                        </div>
                        <div className="mt-2 text-xs">Last issued: {formatDate(c.last_issued_at)}</div>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {classTotalPages > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-sm text-neutral-600">
                    Page {currentClassPage} of {classTotalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setClassPage(1)}
                      disabled={currentClassPage === 1}
                      className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setClassPage((p) => Math.max(1, p - 1))}
                      disabled={currentClassPage === 1}
                      className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setClassPage((p) => Math.min(classTotalPages, p + 1))}
                      disabled={currentClassPage === classTotalPages}
                      className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setClassPage(classTotalPages)}
                      disabled={currentClassPage === classTotalPages}
                      className="px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    )
  }

  // ---------- Certificates for one class ----------
  return (
    <div className="w-full px-3 sm:px-4 md:px-6 pb-8 shrink-0">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedClass(null)}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition"
            title="Back to classes"
          >
            <LucideIcons.ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">
              Certificates — {selectedClass.class_name}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500">
              {selectedClass.course_name ? `${selectedClass.course_name} · ` : ''}
              {selectedClass.issued} issued{selectedClass.revoked > 0 ? ` · ${selectedClass.revoked} revoked` : ''}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:gap-6">
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
              description={search ? `No certificates match "${search}".` : 'No certificates have been issued for this class yet.'}
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
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleDownload(c)}
                      disabled={downloading === c.id}
                      className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                      {downloading === c.id ? 'Preparing...' : 'Download'}
                    </button>
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
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
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
                      <td className="px-4 py-3 text-sm text-neutral-700">
                        <button
                          onClick={() => handleDownload(c)}
                          disabled={downloading === c.id}
                          className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-50 transition"
                          title="Download"
                        >
                          {downloading === c.id ? 'Preparing...' : 'Download'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Pagination */}
      {!loading && (
        <AdminPagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          label="certificates"
        />
      )}
    </div>
  )
}
