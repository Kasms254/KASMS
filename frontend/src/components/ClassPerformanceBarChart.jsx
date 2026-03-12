import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import * as Icons from 'lucide-react'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
  '#f97316', '#84cc16', '#06b6d4', '#a855f7',
]

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 min-w-[200px]">
      <p className="font-bold text-gray-900 text-sm mb-1">{d.class_name}</p>
      {d.course && (
        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
          <Icons.BookOpen className="w-3 h-3 shrink-0" />{d.course}
        </p>
      )}
      {d.instructor && (
        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
          <Icons.User className="w-3 h-3 shrink-0" />{d.instructor}
        </p>
      )}
      <div className="space-y-1.5 border-t border-gray-100 pt-2">
        <div className="flex justify-between items-center gap-4">
          <span className="text-xs text-gray-500">Avg Score</span>
          <span className={`text-sm font-bold ${d.average_percentage >= 76 ? 'text-emerald-600' : d.average_percentage >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {(d.average_percentage || 0).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-xs text-gray-500">Pass Rate</span>
          <span className="text-sm font-bold text-indigo-600">{(d.pass_rate || 0).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-xs text-gray-500">Attendance</span>
          <span className="text-sm font-bold text-purple-600">{(d.attendance_rate || 0).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-xs text-gray-500">Students</span>
          <span className="text-sm font-bold text-gray-700">{d.total_students}</span>
        </div>
      </div>
    </div>
  )
}

export default function ClassPerformanceBarChart({ classes }) {
  const [metric, setMetric] = useState('average_percentage')
  const [sortOrder, setSortOrder] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const ITEMS_PER_PAGE = 10

  if (!classes || classes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Icons.BarChart2 className="w-12 h-12 mx-auto mb-3 text-gray-200" />
        <p className="text-sm">No class data available</p>
      </div>
    )
  }

  const filteredClasses = classes.filter(cls =>
    cls.class_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.course?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.instructor?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedClasses = [...filteredClasses].sort((a, b) => {
    const aVal = a[metric] || 0
    const bVal = b[metric] || 0
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
  })

  const totalPages = Math.ceil(sortedClasses.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedClasses = sortedClasses.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleMetricChange = (m) => { setMetric(m); setCurrentPage(1) }
  const handleSearch = (e) => { setSearchTerm(e.target.value); setCurrentPage(1) }

  const metricLabel = metric === 'average_percentage' ? 'Average Score (%)' : 'Pass Rate (%)'

  const avgScore = filteredClasses.length
    ? (filteredClasses.reduce((s, c) => s + (c.average_percentage || 0), 0) / filteredClasses.length).toFixed(1)
    : '0.0'
  const avgPass = filteredClasses.length
    ? (filteredClasses.reduce((s, c) => s + (c.pass_rate || 0), 0) / filteredClasses.length).toFixed(1)
    : '0.0'

  // height scales with number of bars so they fill the space
  const chartHeight = Math.max(400, paginatedClasses.length * 58)

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-center">
          <div className="text-xs font-semibold text-indigo-500 mb-0.5">Classes</div>
          <div className="text-xl font-black text-indigo-800">{filteredClasses.length}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
          <div className="text-xs font-semibold text-emerald-500 mb-0.5">Avg Score</div>
          <div className="text-xl font-black text-emerald-800">{avgScore}%</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-center">
          <div className="text-xs font-semibold text-amber-500 mb-0.5">Pass Rate</div>
          <div className="text-xl font-black text-amber-800">{avgPass}%</div>
        </div>
      </div>

      {/* Search + controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search class, course, or instructor..."
            value={searchTerm}
            onChange={handleSearch}
            className="w-full pl-9 pr-4 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(''); setCurrentPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden bg-white">
            <button
              onClick={() => handleMetricChange('average_percentage')}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${metric === 'average_percentage' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Avg Score
            </button>
            <button
              onClick={() => handleMetricChange('pass_rate')}
              className={`px-3 py-2 text-xs font-semibold transition-colors border-l border-gray-300 ${metric === 'pass_rate' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Pass Rate
            </button>
          </div>
          <button
            onClick={() => { setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); setCurrentPage(1) }}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {sortOrder === 'desc' ? <Icons.ArrowDownWideNarrow className="w-4 h-4" /> : <Icons.ArrowUpWideNarrow className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Horizontal bar chart */}
      {paginatedClasses.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">{metricLabel}</p>
            <p className="text-xs text-gray-400">
              {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, sortedClasses.length)} of {sortedClasses.length} classes
            </p>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart
                data={paginatedClasses}
                layout="vertical"
                margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
                barSize={32}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="class_name"
                  width={140}
                  tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => v?.length > 17 ? v.slice(0, 16) + '…' : v}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar
                  dataKey={metric}
                  radius={[0, 6, 6, 0]}
                  background={{ fill: '#f9fafb', radius: [0, 6, 6, 0] }}
                >
                  {paginatedClasses.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey={metric}
                    position="right"
                    formatter={v => `${(v || 0).toFixed(1)}%`}
                    style={{ fontSize: 12, fontWeight: 700, fill: '#374151' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Icons.Search className="w-10 h-10 mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400">No classes match your search</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Page {currentPage} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Icons.ChevronsLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Icons.ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i
              return (
                <button key={p} onClick={() => setCurrentPage(p)} className={`min-w-[2rem] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${currentPage === p ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Icons.ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Icons.ChevronsRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span>Good (≥76%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span>Passing (50-75%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Needs Improvement (&lt;50%)</span>
        </div>
      </div>
    </div>
  )
}
