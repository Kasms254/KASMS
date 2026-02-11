import { useState } from 'react'
import * as Icons from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function SortIcon({ columnKey, sortConfig }) {
  if (sortConfig.key !== columnKey) return <Icons.ChevronsUpDown className="w-3 h-3 text-gray-400" />
  return sortConfig.direction === 'asc'
    ? <Icons.ChevronUp className="w-3 h-3 text-indigo-600" />
    : <Icons.ChevronDown className="w-3 h-3 text-indigo-600" />
}

function gradeColor(grade) {
  if (grade === 'A') return 'text-emerald-600'
  if (grade === 'B') return 'text-sky-600'
  if (grade === 'C') return 'text-amber-600'
  if (grade === 'D') return 'text-orange-600'
  return 'text-red-600'
}


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

  // Extract ordered subject list from first student with a breakdown
  const subjectList = (students.find(s => s.subject_breakdown?.length > 0)?.subject_breakdown || [])
    .map(s => ({ name: s.subject_name, code: s.subject_code }))

  // Filter
  const filteredStudents = students.filter(student =>
    student.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.svc_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const aVal = a[sortConfig.key] ?? 0
    const bVal = b[sortConfig.key] ?? 0
    if (typeof aVal === 'string') {
      return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
  })

  // Pagination
  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedStudents = sortedStudents.slice(startIndex, startIndex + itemsPerPage)

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))
    setCurrentPage(1)
  }

  const handleDownload = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 14

    // Parse title into class / course
    const titleParts = title.split(' — ')
    const className  = titleParts[0] || title
    const courseName = titleParts[1] || ''

    // Summary stats
    const total       = sortedStudents.length
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    let   totalPct    = 0
    sortedStudents.forEach(s => {
      const g = s.total_grade || 'F'
      gradeCounts[g] = (gradeCounts[g] || 0) + 1
      totalPct += s.total_percentage ?? 0
    })
    const classAvg = total > 0 ? (totalPct / total).toFixed(1) : '0.0'
    const passCount = gradeCounts.A + gradeCounts.B + gradeCounts.C
    const passRate  = total > 0 ? ((passCount / total) * 100).toFixed(1) : '0.0'

    const BLACK = [0, 0, 0]
    const DGRAY = [60, 60, 60]
    const MGRAY = [120, 120, 120]
    const LGRAY = [220, 220, 220]
    const THEAD = [40, 40, 40]

    const now = new Date()

    // ── HEADER ────────────────────────────────────────────────────────────────
    // Top border line
    doc.setDrawColor(...LGRAY)
    doc.setLineWidth(0.5)
    doc.line(margin, 10, pageW - margin, 10)

    // Report label (small caps style)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MGRAY)
    doc.text('STUDENT PERFORMANCE REPORT', margin, 8)

    // Date top-right
    doc.text(
      now.toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' }),
      pageW - margin, 8, { align: 'right' }
    )

    // Class name — primary heading
    let y = 18
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...BLACK)
    doc.text(className, margin, y)

    // Course name — secondary line
    if (courseName) {
      y += 7
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...DGRAY)
      doc.text(courseName, margin, y)
    }

    y += 5

    // Bottom header rule
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.8)
    doc.line(margin, y, pageW - margin, y)
    y += 6

    // ── SUMMARY ROW ───────────────────────────────────────────────────────────
    const summaryItems = [
      { label: 'Total Students', value: String(total) },
      { label: 'Class Average',  value: `${classAvg}%` },
      { label: 'Pass Rate',      value: `${passRate}%` },
      { label: 'Grade A',        value: String(gradeCounts.A) },
      { label: 'Grade B',        value: String(gradeCounts.B) },
      { label: 'Grade C',        value: String(gradeCounts.C) },
      { label: 'Grade D',        value: String(gradeCounts.D) },
      { label: 'Grade F',        value: String(gradeCounts.F) },
    ]
    const colW = (pageW - margin * 2) / summaryItems.length
    summaryItems.forEach((item, i) => {
      const x = margin + i * colW + colW / 2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...BLACK)
      doc.text(item.value, x, y + 4, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...MGRAY)
      doc.text(item.label, x, y + 9, { align: 'center' })
      // Separator between items (not after last)
      if (i < summaryItems.length - 1) {
        doc.setDrawColor(...LGRAY)
        doc.setLineWidth(0.3)
        doc.line(margin + (i + 1) * colW, y, margin + (i + 1) * colW, y + 11)
      }
    })
    y += 14

    // Light rule under summary
    doc.setDrawColor(...LGRAY)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += 5

    // ── TABLE ─────────────────────────────────────────────────────────────────
    const head = [[
      { content: 'S/No',         styles: { halign: 'center' } },
      { content: 'SVC No.',      styles: { halign: 'left'   } },
      { content: 'Student Name', styles: { halign: 'left'   } },
      ...subjectList.map(s => ({ content: `${s.name}\n(Obtained / Total)`, styles: { halign: 'center' } })),
      { content: 'Total Marks\n(Obtained / Possible)', styles: { halign: 'center' } },
      { content: 'Grade',      styles: { halign: 'center' } },
      { content: 'Attendance', styles: { halign: 'center' } },
    ]]

    const body = sortedStudents.map((student, idx) => [
      { content: String(student.rank ?? idx + 1), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: student.svc_number ?? '-' },
      { content: student.student_name ?? '', styles: { fontStyle: 'bold' } },
      ...subjectList.map(subj => {
        const b = student.subject_breakdown?.find(s => s.subject_name === subj.name)
        return { content: b ? `${b.marks_obtained ?? '-'} / ${b.total_possible ?? '-'}` : '—', styles: { halign: 'center' } }
      }),
      {
        content: student.total_marks_possible > 0
          ? `${student.total_marks_obtained ?? 0} / ${student.total_marks_possible ?? 0}` : '—',
        styles: { halign: 'center', fontStyle: 'bold' },
      },
      { content: student.total_grade ?? '—', styles: { halign: 'center', fontStyle: 'bold' } },
      { content: `${student.attendance_rate?.toFixed(1) ?? 0}%`, styles: { halign: 'center' } },
    ])

    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        lineColor: LGRAY,
        lineWidth: 0.2,
        textColor: DGRAY,
      },
      headStyles: {
        fillColor: THEAD,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 20 },
        2: { cellWidth: 42 },
        [3 + subjectList.length]:     { cellWidth: 30 },
        [3 + subjectList.length + 1]: { cellWidth: 14 },
        [3 + subjectList.length + 2]: { cellWidth: 20 },
      },
      didDrawPage: () => {
        const pg  = doc.internal.getCurrentPageInfo().pageNumber
        const tot = doc.internal.getNumberOfPages()
        doc.setDrawColor(...LGRAY)
        doc.setLineWidth(0.3)
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...MGRAY)
        doc.text(`${className}${courseName ? '  ·  ' + courseName : ''}`, margin, pageH - 6)
        doc.text(`Page ${pg} of ${tot}`, pageW - margin, pageH - 6, { align: 'right' })
        doc.text(
          now.toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' }),
          pageW / 2, pageH - 6, { align: 'center' }
        )
      },
    })

    const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_')
    doc.save(`Performance_${safeTitle}_${now.toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Icons.Users className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={itemsPerPage}
            onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
            className="px-3 py-1.5 text-xs font-medium text-black bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
            <option value={sortedStudents.length}>All ({sortedStudents.length})</option>
          </select>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            title="Download as PDF"
          >
            <Icons.Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by student name or service number..."
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1) }}
          className="w-full pl-10 pr-4 py-2 text-sm text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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

      {searchTerm && (
        <div className="text-sm text-gray-600">
          Found <span className="font-semibold text-gray-900">{filteredStudents.length}</span> of{' '}
          <span className="font-semibold text-gray-900">{students.length}</span> students
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg border border-gray-200">
        <table className="min-w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th onClick={() => handleSort('rank')} className="text-left py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                <div className="flex items-center gap-1">S/No <SortIcon columnKey="rank" sortConfig={sortConfig} /></div>
              </th>
              <th className="text-left py-3 px-3 font-medium text-gray-600 whitespace-nowrap">SVC No.</th>
              <th onClick={() => handleSort('student_name')} className="text-left py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                <div className="flex items-center gap-1">Student Name <SortIcon columnKey="student_name" sortConfig={sortConfig} /></div>
              </th>

              {/* Dynamic subject columns */}
              {subjectList.map((subj, i) => (
                <th key={i} className="text-center py-3 px-3 font-medium text-indigo-700 whitespace-nowrap border-l border-gray-200">
                  <div>{subj.name}</div>
                  <div className="text-xs font-normal text-gray-500">(Marks)</div>
                </th>
              ))}

              <th onClick={() => handleSort('total_marks_obtained')} className="text-center py-3 px-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap border-l-2 border-gray-300">
                <div className="flex items-center justify-center gap-1">Total Marks <SortIcon columnKey="total_marks_obtained" sortConfig={sortConfig} /></div>
              </th>
              <th onClick={() => handleSort('total_grade')} className="text-center py-3 px-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap">
                <div className="flex items-center justify-center gap-1">Grade <SortIcon columnKey="total_grade" sortConfig={sortConfig} /></div>
              </th>
              <th onClick={() => handleSort('attendance_rate')} className="text-center py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap border-l border-gray-200">
                <div className="flex items-center justify-center gap-1">Attendance <SortIcon columnKey="attendance_rate" sortConfig={sortConfig} /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedStudents.length > 0 ? paginatedStudents.map((student, idx) => (
              <tr key={student.student_id || idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-2 px-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    student.rank === 1 ? 'bg-amber-100 text-amber-700' :
                    student.rank === 2 ? 'bg-gray-200 text-gray-700' :
                    student.rank === 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{student.rank}</span>
                </td>
                <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{student.svc_number || '-'}</td>
                <td className="py-2 px-3 font-medium text-gray-800 whitespace-nowrap">{student.student_name}</td>

                {/* Per-subject marks */}
                {subjectList.map((subj, i) => {
                  const breakdown = student.subject_breakdown?.find(s => s.subject_name === subj.name)
                  return (
                    <td key={i} className="py-2 px-3 text-center border-l border-gray-200">
                      {breakdown ? (
                        <div>
                          <span className="font-semibold text-gray-800">
                            {breakdown.marks_obtained ?? '-'}
                          </span>
                          <span className="text-gray-400 text-xs">
                            /{breakdown.total_possible ?? '-'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )
                })}

                {/* Total marks */}
                <td className="py-2 px-3 text-center border-l-2 border-gray-300">
                  {student.total_marks_possible > 0 ? (
                    <div>
                      <span className="font-semibold text-gray-800">{student.total_marks_obtained ?? 0}</span>
                      <span className="text-gray-400 text-xs">/{student.total_marks_possible ?? 0}</span>
                    </div>
                  ) : <span className="text-gray-400">—</span>}
                </td>

                {/* Grade */}
                <td className="py-2 px-3 text-center">
                  {student.total_grade ? (
                    <span className={`text-base font-bold ${gradeColor(student.total_grade)}`}>
                      {student.total_grade}
                    </span>
                  ) : <span className="text-gray-400">—</span>}
                </td>

                {/* Attendance */}
                <td className="py-2 px-3 text-center text-gray-600 border-l border-gray-200">
                  {student.attendance_rate?.toFixed(1) ?? 0}%
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4 + subjectList.length + 3} className="py-8 text-center text-gray-500">
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
        {paginatedStudents.length > 0 ? paginatedStudents.map((student, idx) => (
          <div key={student.student_id || idx} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  student.rank === 1 ? 'bg-amber-100 text-amber-700' :
                  student.rank === 2 ? 'bg-gray-200 text-gray-700' :
                  student.rank === 3 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{student.rank}</span>
                <div>
                  <div className="font-medium text-gray-800">{student.student_name}</div>
                  <div className="text-xs text-gray-500">{student.svc_number || '-'}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${gradeColor(student.total_grade || 'F')}`}>
                  {student.total_grade || '—'}
                </div>
                <div className="text-xs text-gray-500">
                  {student.total_marks_obtained ?? 0}/{student.total_marks_possible ?? 0}
                </div>
              </div>
            </div>

            {/* Subject breakdown */}
            {student.subject_breakdown?.length > 0 && (
              <div className="border-t border-gray-100 pt-2 space-y-1">
                {student.subject_breakdown.map((subj, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1">{subj.subject_name}</span>
                    <span className="text-gray-800 font-medium ml-2">
                      {subj.marks_obtained ?? '-'}/{subj.total_possible ?? '-'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-sm text-gray-500 border-t border-gray-100 pt-2">
              <span>Attendance</span>
              <span className="font-medium text-gray-700">{student.attendance_rate?.toFixed(1) ?? 0}%</span>
            </div>
          </div>
        )) : (
          <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
            <Icons.Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-gray-500">No students match your search criteria</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold text-gray-900">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-gray-900">{Math.min(startIndex + itemsPerPage, sortedStudents.length)}</span> of{' '}
            <span className="font-semibold text-gray-900">{sortedStudents.length}</span> students
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Icons.ChevronsLeft className="w-4 h-4 text-black" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Icons.ChevronLeft className="w-4 h-4 text-black" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) pageNum = i + 1
                else if (currentPage <= 3) pageNum = i + 1
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                else pageNum = currentPage - 2 + i
                return (
                  <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[2rem] px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === pageNum ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-black hover:bg-gray-50'
                    }`}>
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Icons.ChevronRight className="w-4 h-4 text-black" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Icons.ChevronsRight className="w-4 h-4 text-black" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
