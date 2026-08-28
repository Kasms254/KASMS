import { useState, useEffect } from 'react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import * as LucideIcons from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import Card from '../../components/Card'
import AdminPagination from '../../components/AdminPagination'

const CLASS_PAGE_SIZE = 12

const STATUS_BADGE = {
  issued: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-red-100 text-red-700',
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

function initials(name = '') {
  return name.split(' ').map((s) => s[0] || '').slice(0, 2).join('').toUpperCase()
}

// Certificates are listed per class: a single flat roll of every certificate in
// the school is ambiguous once more than one class has been certified, so the
// page opens on the classes and drills into one at a time.
export default function Certificates() {
  const toast = useToast()

  const [classes, setClasses] = useState([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [classesError, setClassesError] = useState(null)
  const [classSearch, setClassSearch] = useState('')
  const [classPage, setClassPage] = useState(1)

  const [selectedClass, setSelectedClass] = useState(null)
  const [certificates, setCertificates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [downloading, setDownloading] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await api.getCertificatesByClass()
        if (mounted) setClasses(data?.results || (Array.isArray(data) ? data : []))
      } catch (err) {
        if (mounted) setClassesError(err)
      } finally {
        if (mounted) setClassesLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!selectedClass) return
    let mounted = true
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    params.append('page', page)
    params.append('page_size', pageSize)
    if (selectedClass.class_id) params.append('class_obj', selectedClass.class_id)
    if (searchTerm.trim()) params.append('search', searchTerm.trim())

    api.getCertificates(params.toString())
      .then((data) => {
        if (!mounted) return
        const list = data?.results || (Array.isArray(data) ? data : [])
        setCertificates(list)
        setTotalCount(data?.count ?? list.length)
      })
      .catch((err) => { if (mounted) setError(err) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [selectedClass, page, pageSize, searchTerm])

  function openClass(cls) {
    setSelectedClass(cls)
    setCertificates([])
    setSearchTerm('')
    setPage(1)
  }

  function backToClasses() {
    setSelectedClass(null)
    setError(null)
  }

  async function handleDownload(cert) {
    setDownloading(cert.id)
    try {
      const blob = await api.downloadCertificatePdf(cert.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate_${String(cert.certificate_number || cert.id).replace(/\//g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast?.error?.(err?.message || 'Failed to download certificate')
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

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={classSearch}
                onChange={(e) => { setClassSearch(e.target.value); setClassPage(1) }}
                placeholder="Search by class or course..."
                className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {classSearch && (
              <button
                onClick={() => { setClassSearch(''); setClassPage(1) }}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-xs sm:text-sm hover:bg-gray-300 transition whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {classesError ? (
          <div className="p-6 bg-white rounded-xl border border-red-200">
            <EmptyState icon="AlertCircle" title="Error loading certificates" description={classesError.message || String(classesError)} variant="minimal" />
          </div>
        ) : classesLoading ? (
          <div className="p-6 bg-white rounded-xl border border-neutral-200">
            <EmptyState icon="Loader2" title="Loading certificates..." variant="minimal" />
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200">
            <EmptyState
              icon="Award"
              title="No certificates found"
              description={classSearch
                ? `No class matches "${classSearch}".`
                : 'No certificates have been issued yet. Issue certificates from a class.'}
            />
          </div>
        ) : (
          <>
            {filteredClasses.length > 0 && (
              <div className="mb-3 text-sm text-neutral-600">
                Showing {((currentClassPage - 1) * CLASS_PAGE_SIZE) + 1} - {Math.min(currentClassPage * CLASS_PAGE_SIZE, filteredClasses.length)} of {filteredClasses.length} classes
              </div>
            )}

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
          </>
        )}
      </div>
    )
  }

  // ---------- Certificates for one class ----------
  return (
    <div className="w-full px-3 sm:px-4 md:px-6 pb-8 shrink-0">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <button onClick={backToClasses} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition" title="Back to classes">
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

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
              placeholder="Search by certificate number or student..."
              className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
            description={searchTerm ? `No certificates match "${searchTerm}".` : 'No certificates have been issued for this class yet.'}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          {/* Mobile Card View */}
          <div className="lg:hidden p-4 space-y-3">
            {certificates.map((cert) => (
              <div key={cert.id} className="bg-neutral-50 rounded-lg p-3 sm:p-4 border border-neutral-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm flex-shrink-0">
                      {initials(cert.student_name || '?')}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-black truncate">{cert.student_name || '—'}</div>
                      <div className="text-xs text-neutral-500">{cert.student_svc_number || '—'}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full capitalize flex-shrink-0 ${STATUS_BADGE[cert.status] || 'bg-neutral-100 text-neutral-600'}`}>
                    <LucideIcons.Award className="w-3 h-3 inline mr-1" />{cert.status || 'issued'}
                  </span>
                </div>
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Certificate #:</span><span className="text-black font-mono">{cert.certificate_number}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Issued:</span><span className="text-black">{formatDate(cert.issued_at)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-neutral-600">Issued by:</span><span className="text-black">{cert.issued_by_role || '—'}</span></div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => handleDownload(cert)}
                    disabled={downloading === cert.id}
                    className="px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {downloading === cert.id ? 'Preparing...' : 'Download'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Certificate #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Issued Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Issued By</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {certificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                          {initials(cert.student_name || '?')}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-black">{cert.student_name || '—'}</p>
                          <p className="text-xs text-neutral-500">{cert.student_svc_number || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-black font-mono whitespace-nowrap">{cert.certificate_number}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">{formatDate(cert.issued_at)}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{cert.issued_by_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_BADGE[cert.status] || 'bg-neutral-100 text-neutral-600'}`}>
                        {cert.status || 'issued'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      <button
                        onClick={() => handleDownload(cert)}
                        disabled={downloading === cert.id}
                        className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-50 transition"
                        title="Download"
                      >
                        {downloading === cert.id ? 'Preparing...' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
