import { useState } from 'react'
import * as Icons from 'lucide-react'

export default function StudentPerformanceTable({ students, title = "All Students Performance" }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' })

  if (!students || students.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Icons.Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p>No student data available</p>
      </div>
    )
  }

  // Filter by search term
  const filteredStudents = students.filter(student =>
    student.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.svc_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort data
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const aVal = a[sortConfig.key] ?? 0
    const bVal = b[sortConfig.key] ?? 0

    if (typeof aVal === 'string') {
      return sortConfig.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }

    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
  })

  // Pagination
  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedStudents = sortedStudents.slice(startIndex, endIndex)

  // Handlers
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }))
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

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <Icons.ChevronsUpDown className="w-3 h-3 text-gray-400" />
    }
    return sortConfig.direction === 'asc'
      ? <Icons.ChevronUp className="w-3 h-3 text-indigo-600" />
      : <Icons.ChevronDown className="w-3 h-3 text-indigo-600" />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Icons.Users className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
          {title}
        </h3>

        {/* Items per page selector */}
        <select
          value={itemsPerPage}
          onChange={handleItemsPerPageChange}
          className="px-3 py-1.5 text-xs font-medium text-black bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
          <option value={sortedStudents.length}>All ({sortedStudents.length})</option>
        </select>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by student name or service number..."
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
          Found <span className="font-semibold text-gray-900">{filteredStudents.length}</span> of{' '}
          <span className="font-semibold text-gray-900">{students.length}</span> students
        </div>
      )}

      {/* Table - Desktop */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg border border-gray-200">
        <table className="min-w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th
                onClick={() => handleSort('rank')}
                className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  S/No
                  <SortIcon columnKey="rank" />
                </div>
              </th>
              <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600">
                SVC Number
              </th>
              <th className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden lg:table-cell">
                Rank
              </th>
              <th
                onClick={() => handleSort('student_name')}
                className="text-left py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Student Name
                  <SortIcon columnKey="student_name" />
                </div>
              </th>
              <th
                onClick={() => handleSort('total_exams_taken')}
                className="text-center py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden md:table-cell cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center justify-center gap-1">
                  Exams Taken
                  <SortIcon columnKey="total_exams_taken" />
                </div>
              </th>
              <th
                onClick={() => handleSort('overall_percentage')}
                className="text-right py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center justify-end gap-1">
                  Overall %
                  <SortIcon columnKey="overall_percentage" />
                </div>
              </th>
              <th
                onClick={() => handleSort('attendance_rate')}
                className="text-right py-2 md:py-3 px-2 md:px-3 font-medium text-gray-600 hidden lg:table-cell cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center justify-end gap-1">
                  Attendance
                  <SortIcon columnKey="attendance_rate" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedStudents.length > 0 ? (
              paginatedStudents.map((student, idx) => (
                <tr key={student.student_id || idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-2 md:py-3 px-2 md:px-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-full text-xs font-bold ${
                      student.rank === 1 ? 'bg-amber-100 text-amber-700' :
                      student.rank === 2 ? 'bg-gray-200 text-gray-700' :
                      student.rank === 3 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {student.rank}
                    </span>
                  </td>
                  <td className="py-2 md:py-3 px-2 md:px-3 text-gray-600">{student.svc_number || '-'}</td>
                  <td className="py-2 md:py-3 px-2 md:px-3 text-gray-600 hidden lg:table-cell">{student.student_rank || '-'}</td>
                  <td className="py-2 md:py-3 px-2 md:px-3 font-medium text-gray-800">{student.student_name}</td>
                  <td className="py-2 md:py-3 px-2 md:px-3 text-center text-gray-600 hidden md:table-cell">{student.total_exams_taken || 0}</td>
                  <td className="py-2 md:py-3 px-2 md:px-3 text-right">
                    <span className={`font-semibold ${
                      student.overall_percentage >= 70 ? 'text-emerald-600' :
                      student.overall_percentage >= 50 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      {student.overall_percentage?.toFixed(1) || 0}%
                    </span>
                  </td>
                  <td className="py-2 md:py-3 px-2 md:px-3 text-right text-gray-600 hidden lg:table-cell">
                    {student.attendance_rate?.toFixed(1) || 0}%
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="py-8 text-center text-gray-500">
                  <Icons.Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No students match your search criteria</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {paginatedStudents.length > 0 ? (
          paginatedStudents.map((student, idx) => (
            <div key={student.student_id || idx} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                    student.rank === 1 ? 'bg-amber-100 text-amber-700' :
                    student.rank === 2 ? 'bg-gray-200 text-gray-700' :
                    student.rank === 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {student.rank}
                  </span>
                  <div>
                    <div className="font-medium text-gray-800">{student.student_name}</div>
                    <div className="text-xs text-gray-500">
                      {student.svc_number || '-'}
                      {student.student_rank && <span className="ml-2">({student.student_rank})</span>}
                    </div>
                  </div>
                </div>
                <div className={`text-xl font-bold ${
                  student.overall_percentage >= 70 ? 'text-emerald-600' :
                  student.overall_percentage >= 50 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {student.overall_percentage?.toFixed(1) || 0}%
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Exams:</span>
                  <span className="ml-1 font-medium text-gray-700">{student.total_exams_taken || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">Attendance:</span>
                  <span className="ml-1 font-medium text-gray-700">{student.attendance_rate?.toFixed(1) || 0}%</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
            <Icons.Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-gray-500">No students match your search criteria</p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold text-gray-900">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-gray-900">{Math.min(endIndex, sortedStudents.length)}</span> of{' '}
            <span className="font-semibold text-gray-900">{sortedStudents.length}</span> students
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
    </div>
  )
}
