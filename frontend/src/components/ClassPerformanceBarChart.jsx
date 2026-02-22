import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import * as Icons from 'lucide-react'

// Color palette for bars
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

// Custom Tooltip Component
function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[200px]">
        <p className="font-semibold text-gray-900 mb-2 text-sm">{data.class_name}</p>
        {data.course && (
          <p className="text-xs text-gray-600 mb-2">
            <Icons.Book className="w-3 h-3 inline mr-1" />
            {data.course}
          </p>
        )}
        {data.instructor && (
          <p className="text-xs text-gray-600 mb-3">
            <Icons.User className="w-3 h-3 inline mr-1" />
            {data.instructor}
          </p>
        )}
        <div className="space-y-2 border-t border-gray-100 pt-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">Average Score:</span>
            <span className={`text-sm font-bold ${
              data.average_percentage >= 76 ? 'text-emerald-600' :
              data.average_percentage >= 50 ? 'text-amber-600' :
              'text-red-600'
            }`}>
              {data.average_percentage?.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">Pass Rate:</span>
            <span className="text-sm font-semibold text-indigo-600">
              {data.pass_rate?.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">Students:</span>
            <span className="text-sm font-semibold text-gray-700">
              {data.total_students}
            </span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

export default function ClassPerformanceBarChart({ classes }) {
  const [metric, setMetric] = useState('average_percentage') // 'average_percentage' or 'pass_rate'
  const [sortOrder, setSortOrder] = useState('desc') // 'asc' or 'desc'
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')

  if (!classes || classes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Icons.BarChart className="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p>No class data available</p>
      </div>
    )
  }

  // Filter by search term
  const filteredClasses = classes.filter(cls =>
    cls.class_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.course?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.instructor?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort data
  const sortedClasses = [...filteredClasses].sort((a, b) => {
    const aVal = a[metric] || 0
    const bVal = b[metric] || 0
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
  })

  // Pagination
  const totalPages = Math.ceil(sortedClasses.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedClasses = sortedClasses.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleMetricChange = (newMetric) => {
    setMetric(newMetric)
    setCurrentPage(1)
  }

  const handleSortOrderChange = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    setCurrentPage(1)
  }

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value))
    setCurrentPage(1)
  }

  // Determine bar color based on performance
  const getBarColor = (value, index) => {
    if (metric === 'average_percentage' || metric === 'pass_rate') {
      if (value >= 76) return '#10b981' // emerald-500 (B grade or above)
      if (value >= 50) return '#f59e0b' // amber-500 (passing C- and above)
      return '#ef4444' // red-500 (F - failing)
    }
    return COLORS[index % COLORS.length]
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by class name, course, or instructor..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="w-full pl-10 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm('')
              setCurrentPage(1)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results Info */}
      {searchTerm && (
        <div className="text-sm text-gray-600">
          Found <span className="font-semibold text-gray-900">{filteredClasses.length}</span> of{' '}
          <span className="font-semibold text-gray-900">{classes.length}</span> classes
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700">View:</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
            <button
              onClick={() => handleMetricChange('average_percentage')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                metric === 'average_percentage'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Average Score
            </button>
            <button
              onClick={() => handleMetricChange('pass_rate')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                metric === 'pass_rate'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Pass Rate
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSortOrderChange}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {sortOrder === 'desc' ? (
              <>
                <Icons.ArrowDownWideNarrow className="w-4 h-4" />
                High to Low
              </>
            ) : (
              <>
                <Icons.ArrowUpWideNarrow className="w-4 h-4" />
                Low to High
              </>
            )}
          </button>

          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="px-3 py-1.5 text-xs font-medium text-black bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <option value={5}>5 per page</option>
            <option value={10}>10 per page</option>
            <option value={15}>15 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
            <option value={sortedClasses.length}>All ({sortedClasses.length})</option>
          </select>
        </div>
      </div>

      {/* Bar Chart */}
      {paginatedClasses.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={paginatedClasses}
              margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="class_name"
                angle={-45}
                textAnchor="end"
                height={100}
                interval={0}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                stroke="#9ca3af"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                stroke="#9ca3af"
                label={{
                  value: metric === 'average_percentage' ? 'Average Score (%)' : 'Pass Rate (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 12, fill: '#6b7280' }
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                content={() => (
                  <div className="flex items-center justify-center gap-4 text-xs text-gray-600 mt-4">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-emerald-500" />
                      <span>Good (≥76%)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-amber-500" />
                      <span>Passing (50-75%)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-red-500" />
                      <span>Needs Improvement (&lt;50%)</span>
                    </div>
                  </div>
                )}
              />
              <Bar
                dataKey={metric}
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {paginatedClasses.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry[metric], index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Icons.Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500">No classes match your search criteria</p>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold text-gray-900">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-gray-900">{Math.min(endIndex, sortedClasses.length)}</span> of{' '}
            <span className="font-semibold text-gray-900">{sortedClasses.length}</span> classes
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="First page"
            >
              <Icons.ChevronsLeft className="w-4 h-4 text-black" />
            </button>

            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <Icons.ChevronLeft className="w-4 h-4 text-black" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[2rem] px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === pageNum
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-gray-300 text-black hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <Icons.ChevronRight className="w-4 h-4 text-black" />
            </button>

            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Last page"
            >
              <Icons.ChevronsRight className="w-4 h-4 text-black" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-3 border border-indigo-200">
          <div className="text-xs text-indigo-700 font-medium mb-1">
            {searchTerm ? 'Filtered' : 'Total'} Classes
          </div>
          <div className="text-2xl font-bold text-indigo-900">{filteredClasses.length}</div>
          {searchTerm && (
            <div className="text-xs text-indigo-600 mt-1">of {classes.length} total</div>
          )}
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-3 border border-emerald-200">
          <div className="text-xs text-emerald-700 font-medium mb-1">Avg. Score</div>
          <div className="text-2xl font-bold text-emerald-900">
            {filteredClasses.length > 0
              ? (filteredClasses.reduce((sum, c) => sum + (c.average_percentage || 0), 0) / filteredClasses.length).toFixed(1)
              : '0.0'}%
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-3 border border-amber-200">
          <div className="text-xs text-amber-700 font-medium mb-1">Avg. Pass Rate</div>
          <div className="text-2xl font-bold text-amber-900">
            {filteredClasses.length > 0
              ? (filteredClasses.reduce((sum, c) => sum + (c.pass_rate || 0), 0) / filteredClasses.length).toFixed(1)
              : '0.0'}%
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 border border-purple-200">
          <div className="text-xs text-purple-700 font-medium mb-1">Total Students</div>
          <div className="text-2xl font-bold text-purple-900">
            {filteredClasses.reduce((sum, c) => sum + (c.total_students || 0), 0)}
          </div>
        </div>
      </div>
    </div>
  )
}
