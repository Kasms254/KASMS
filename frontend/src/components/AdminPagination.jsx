import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function AdminPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  label = 'items',
}) {
  if (!totalCount || totalCount === 0) return null

  const from = Math.min((currentPage - 1) * pageSize + 1, totalCount)
  const to = Math.min(currentPage * pageSize, totalCount)

  const pages = []
  const maxVisible = 5
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
  let endPage = Math.min(totalPages, startPage + maxVisible - 1)
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1)
  }

  if (startPage > 1) {
    pages.push(
      <button key={1} onClick={() => onPageChange(1)}
        className="px-3 py-1.5 text-sm text-fg rounded-lg border border-line bg-surface hover:bg-canvas transition">
        1
      </button>
    )
    if (startPage > 2) pages.push(<span key="e1" className="px-2 text-fg-faint">...</span>)
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(
      <button key={i} onClick={() => onPageChange(i)}
        className={`px-3 py-1.5 text-sm rounded-lg transition ${
          currentPage === i
            ? 'bg-fill-indigo-600 text-white font-semibold shadow-sm'
            : 'border border-line bg-surface text-fg hover:bg-canvas'
        }`}>
        {i}
      </button>
    )
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pages.push(<span key="e2" className="px-2 text-fg-faint">...</span>)
    pages.push(
      <button key={totalPages} onClick={() => onPageChange(totalPages)}
        className="px-3 py-1.5 text-sm text-fg rounded-lg border border-line bg-surface hover:bg-canvas transition">
        {totalPages}
      </button>
    )
  }

  return (
    <div className="mt-6 bg-surface rounded-xl shadow-sm border border-line p-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-fg-muted">
          Showing <span className="font-semibold text-fg">{from}</span> to{' '}
          <span className="font-semibold text-fg">{to}</span> of{' '}
          <span className="font-semibold text-fg">{totalCount}</span> {label}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg border border-line bg-surface hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-5 h-5 text-fg-muted" />
          </button>

          <div className="flex items-center gap-1">{pages}</div>

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-lg border border-line bg-surface hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Next page"
          >
            <ChevronRight className="w-5 h-5 text-fg-muted" />
          </button>

          {onPageSizeChange && (
            <div className="ml-2 flex items-center gap-2">
              <span className="text-sm text-fg-muted hidden sm:inline">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1) }}
                className="px-3 py-1.5 text-sm text-fg rounded-lg border border-line bg-surface hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-edge-indigo-200 transition"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
