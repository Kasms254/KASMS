import React, { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  Search, Filter, Download, Calendar, Users, TrendingUp,
  TrendingDown, AlertTriangle, ChevronDown, RefreshCw,
  CheckCircle, XCircle, Clock, Award, Target, FileText
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import ModernDatePicker from '../../components/ModernDatePicker'

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6']
const STATUS_COLORS = {
  present: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  excused: '#3b82f6'
}

export default function AttendanceReports() {
  const { user } = useAuth()
  const toast = useToast()

  // State
  const [loading, setLoading] = useState(false)
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10)
  })

  // Report data
  const [classSummary, setClassSummary] = useState(null)
  const [trendData, setTrendData] = useState([])
  const [lowAttendanceStudents, setLowAttendanceStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentDetail, setStudentDetail] = useState(null)

  // Active tab
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'trends' | 'alerts' | 'student'

  // Load classes
  useEffect(() => {
    async function loadClasses() {
      try {
        const data = user?.role === 'admin'
          ? await api.getAllClasses('is_active=true')
          : await api.getMyClasses()
        const list = Array.isArray(data) ? data : (data?.results || [])
        setClasses(list)
        if (list.length > 0) {
          setSelectedClass(list[0].id)
        }
      } catch (err) {
        console.error('Failed to load classes:', err)
      }
    }
    loadClasses()
  }, [user])

  // Load class summary
  const loadClassSummary = useCallback(async () => {
    if (!selectedClass) return
    setLoading(true)
    try {
      const data = await api.getClassAttendanceSummary(selectedClass, dateRange.startDate, dateRange.endDate)
      // Transform backend response to match expected frontend structure
      // Backend returns: { class, period, overall_statistics, student_statistics }
      // Frontend expects: { total_sessions, total_students, attendance_rate, punctuality_rate, by_status, by_method }
      const stats = data.overall_statistics || {}
      const studentStats = data.student_statistics || []

      // Calculate by_status from student statistics
      let totalPresent = 0, totalLate = 0, totalAbsent = 0, totalExcused = 0
      studentStats.forEach(s => {
        totalPresent += s.present || 0
        totalLate += s.late || 0
        totalAbsent += s.absent || 0
        totalExcused += s.excused || 0
      })

      // Calculate punctuality rate (present / (present + late) * 100)
      const totalAttended = totalPresent + totalLate
      const punctualityRate = totalAttended > 0 ? (totalPresent / totalAttended * 100) : 0

      const transformedData = {
        total_sessions: stats.total_sessions || data.period?.total_sessions || 0,
        total_students: stats.total_students || 0,
        attendance_rate: stats.class_attendance_rate || 0,
        punctuality_rate: punctualityRate,
        by_status: {
          present: totalPresent,
          late: totalLate,
          absent: totalAbsent,
          excused: totalExcused
        },
        by_method: data.by_method || {},
        // Keep original data for reference
        student_statistics: studentStats,
        class: data.class,
        period: data.period
      }
      setClassSummary(transformedData)
    } catch (err) {
      toast.error(err.message || 'Failed to load class summary')
    } finally {
      setLoading(false)
    }
  }, [selectedClass, dateRange, toast])

  // Load trend data
  const loadTrendData = useCallback(async () => {
    if (!selectedClass) return
    try {
      const data = await api.getAttendanceTrend(selectedClass, 30)
      // Backend returns { class, period, trend_data: [...] }
      setTrendData(data?.trend_data || data?.trend || [])
    } catch (err) {
      console.error('Failed to load trend data:', err)
    }
  }, [selectedClass])

  // Load low attendance alerts
  const loadLowAttendanceAlerts = useCallback(async () => {
    try {
      const data = await api.getLowAttendanceAlerts(selectedClass || null, 75)
      setLowAttendanceStudents(data?.students || data || [])
    } catch (err) {
      console.error('Failed to load alerts:', err)
    }
  }, [selectedClass])

  // Load student detail
  const loadStudentDetail = useCallback(async () => {
    if (!selectedStudent) return
    try {
      const data = await api.getStudentAttendanceDetail(selectedStudent, dateRange.startDate, dateRange.endDate)
      setStudentDetail(data)
    } catch (err) {
      toast.error(err.message || 'Failed to load student detail')
    }
  }, [selectedStudent, dateRange, toast])

  useEffect(() => {
    if (activeTab === 'overview') {
      loadClassSummary()
    } else if (activeTab === 'trends') {
      loadTrendData()
    } else if (activeTab === 'alerts') {
      loadLowAttendanceAlerts()
    } else if (activeTab === 'student' && selectedStudent) {
      loadStudentDetail()
    }
  }, [activeTab, loadClassSummary, loadTrendData, loadLowAttendanceAlerts, loadStudentDetail, selectedStudent])

  // Format date
  function formatDate(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Prepare pie chart data
  const getPieChartData = () => {
    if (!classSummary?.by_status) return []
    return Object.entries(classSummary.by_status).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      fill: STATUS_COLORS[status] || '#9ca3af'
    }))
  }

  // Export report
  async function handleExport() {
    if (!selectedClass) {
      toast.error('Please select a class first')
      return
    }
    if (!classSummary) {
      toast.error('No report data available. Please wait for the data to load.')
      return
    }
    try {
      // Generate PDF report using jspdf and jspdf-autotable
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF()
      const className = classes.find(c => c.id === Number(selectedClass))?.name || 'Class'

      doc.setFontSize(18)
      doc.text(`Attendance Report - ${className}`, 14, 22)

      doc.setFontSize(11)
      doc.text(`Period: ${dateRange.startDate} to ${dateRange.endDate}`, 14, 32)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 38)

      // Student Details Table (first)
      const studentStats = classSummary.student_statistics || []
      let currentY = 52

      if (studentStats.length > 0) {
        doc.setFontSize(14)
        doc.text('Student Details', 14, currentY)

        // Sort students by attendance rate (descending)
        const sortedStudents = [...studentStats].sort((a, b) =>
          (b.attendance_rate || 0) - (a.attendance_rate || 0)
        )

        const studentData = sortedStudents.map(student => [
          student.student_name || '—',
          student.svc_number || student.student_svc_number || '—',
          String(student.present || 0),
          String(student.late || 0),
          String(student.absent || 0),
          String(student.excused || 0),
          `${(student.attendance_rate || 0).toFixed(1)}%`
        ])

        autoTable(doc, {
          startY: currentY + 5,
          head: [['Student Name', 'SVC Number', 'Present', 'Late', 'Absent', 'Excused', 'Rate']],
          body: studentData,
          theme: 'grid',
          headStyles: { fillColor: [99, 102, 241] },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: 30 },
            2: { cellWidth: 18, halign: 'center' },
            3: { cellWidth: 18, halign: 'center' },
            4: { cellWidth: 18, halign: 'center' },
            5: { cellWidth: 18, halign: 'center' },
            6: { cellWidth: 20, halign: 'center' }
          }
        })

        currentY = doc.lastAutoTable?.finalY || currentY + 50
      }

      // Summary stats (after student details)
      doc.setFontSize(14)
      doc.text('Summary', 14, currentY + 15)

      const summaryData = [
        ['Total Students', String(classSummary.total_students || 0)],
        ['Total Sessions', String(classSummary.total_sessions || 0)],
        ['Average Attendance Rate', `${(classSummary.attendance_rate || 0).toFixed(1)}%`],
        ['Present', String(classSummary.by_status?.present || 0)],
        ['Late', String(classSummary.by_status?.late || 0)],
        ['Absent', String(classSummary.by_status?.absent || 0)],
        ['Excused', String(classSummary.by_status?.excused || 0)],
      ]

      autoTable(doc, {
        startY: currentY + 20,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241] }
      })

      // Sanitize filename by removing special characters
      const safeClassName = className.replace(/[^a-zA-Z0-9-_]/g, '_')
      doc.save(`attendance_report_${safeClassName}_${dateRange.startDate}_to_${dateRange.endDate}.pdf`)
      toast.success('Report exported successfully')
    } catch (err) {
      console.error('Export error:', err)
      toast.error(`Failed to export report: ${err.message || 'Unknown error'}`)
    }
  }

  return (
    <div className="p-4 md:p-6 text-black">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Attendance Reports</h1>
          <p className="text-sm text-gray-600 mt-1">Analyze attendance patterns and identify students at risk</p>
        </div>
        {selectedClass && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            <Download className="w-5 h-5" />
            Export Report
          </button>
        )}
      </div>

      {/* Class Selection */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name || c.class_code}</option>
              ))}
            </select>
          </div>
          {selectedClass && (
            <>
              <div>
                <ModernDatePicker
                  label="Start Date"
                  value={dateRange.startDate}
                  onChange={(value) => setDateRange(d => ({ ...d, startDate: value }))}
                  maxDate={new Date().toISOString().slice(0, 10)}
                  placeholder="Select start date"
                />
              </div>
              <div>
                <ModernDatePicker
                  label="End Date"
                  value={dateRange.endDate}
                  onChange={(value) => setDateRange(d => ({ ...d, endDate: value }))}
                  minDate={dateRange.startDate}
                  maxDate={new Date().toISOString().slice(0, 10)}
                  placeholder="Select end date"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    if (activeTab === 'overview') loadClassSummary()
                    else if (activeTab === 'trends') loadTrendData()
                    else if (activeTab === 'alerts') loadLowAttendanceAlerts()
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Show prompt when no class selected */}
      {!selectedClass && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Class</h3>
          <p className="text-gray-500">Choose a class from the dropdown above to view attendance reports.</p>
        </div>
      )}

      {/* Tabs - only show when class is selected */}
      {selectedClass && (
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="flex border-b overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Target },
              { id: 'trends', label: 'Trends', icon: TrendingUp },
              { id: 'alerts', label: 'Low Attendance Alerts', icon: AlertTriangle },
              { id: 'student', label: 'Student Detail', icon: Users }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                  activeTab === tab.id
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {selectedClass && activeTab === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading report data...</p>
            </div>
          ) : !classSummary ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto" />
              <h3 className="mt-4 text-gray-700 font-medium">Select a Class</h3>
              <p className="text-sm text-gray-500 mt-1">Choose a class to view attendance reports</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total Sessions</div>
                      <div className="text-xl font-bold">{classSummary.total_sessions || 0}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <Users className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Total Students</div>
                      <div className="text-xl font-bold">{classSummary.total_students || 0}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      (classSummary.attendance_rate || 0) >= 75 ? 'bg-emerald-100' : 'bg-red-100'
                    }`}>
                      <Target className={`w-5 h-5 ${
                        (classSummary.attendance_rate || 0) >= 75 ? 'text-emerald-600' : 'text-red-600'
                      }`} />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Attendance Rate</div>
                      <div className="text-xl font-bold">{(classSummary.attendance_rate || 0).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Award className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Punctuality</div>
                      <div className="text-xl font-bold">{(classSummary.punctuality_rate || 0).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pie Chart - Status Distribution */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="font-semibold mb-4">Attendance Distribution</h3>
                  <div className="h-64">
                    {getPieChartData().some(d => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getPieChartData().filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={{ stroke: '#666', strokeWidth: 1 }}
                          >
                            {getPieChartData().filter(d => d.value > 0).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name) => [value, name]} />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <Target className="w-12 h-12 mb-2 text-gray-300" />
                        <p className="text-sm">No attendance data available</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bar Chart - Student Performance */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="font-semibold mb-4">Top Students by Attendance</h3>
                  <div className="h-64">
                    {(classSummary.student_statistics || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(classSummary.student_statistics || []).slice(0, 5).map(s => ({
                            name: s.student_name?.split(' ')[0] || 'Student',
                            rate: s.attendance_rate || 0
                          }))}
                          layout="horizontal"
                          margin={{ top: 10, right: 20, left: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis type="number" domain={[0, 100]} unit="%" />
                          <Tooltip formatter={(value) => [`${value}%`, 'Attendance Rate']} />
                          <Bar dataKey="rate" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <Users className="w-12 h-12 mb-2 text-gray-300" />
                        <p className="text-sm">No student data available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-semibold mb-4">Status Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(classSummary.by_status || {}).map(([status, count]) => (
                    <div key={status} className={`p-4 rounded-lg ${
                      status === 'present' ? 'bg-emerald-50' :
                      status === 'late' ? 'bg-yellow-50' :
                      status === 'absent' ? 'bg-red-50' : 'bg-blue-50'
                    }`}>
                      <div className={`text-sm ${
                        status === 'present' ? 'text-emerald-700' :
                        status === 'late' ? 'text-yellow-700' :
                        status === 'absent' ? 'text-red-700' : 'text-blue-700'
                      }`}>{status.charAt(0).toUpperCase() + status.slice(1)}</div>
                      <div className="text-2xl font-bold mt-1">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Trends Tab */}
      {selectedClass && activeTab === 'trends' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold mb-4">Attendance Trend (Last 30 Days)</h3>
          {trendData.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-400 mx-auto" />
              <p className="mt-4 text-gray-600">No trend data available</p>
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0]?.payload
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium text-gray-900">{formatDate(label)}</p>
                          {data?.session_title && (
                            <p className="text-gray-600 text-xs">{data.session_title}</p>
                          )}
                          <p className="text-indigo-600 font-semibold mt-1">
                            Attendance: {(data?.attendance_rate || 0).toFixed(1)}%
                          </p>
                          {data?.moving_average !== undefined && (
                            <p className="text-emerald-600">
                              Moving Avg: {data.moving_average.toFixed(1)}%
                            </p>
                          )}
                          <p className="text-gray-500 text-xs mt-1">
                            Present: {data?.present || 0} | Late: {data?.late || 0} | Absent: {data?.absent || 0}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="attendance_rate"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1' }}
                    name="Attendance Rate"
                  />
                  {trendData[0]?.moving_average !== undefined && (
                    <Line
                      type="monotone"
                      dataKey="moving_average"
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="3-Day Moving Avg"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Alerts Tab */}
      {selectedClass && activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="bg-yellow-50 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">Low Attendance Alert</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Students with attendance below 75% may need intervention.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {lowAttendanceStudents.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className="mt-4 text-gray-700 font-medium">No Low Attendance Alerts</h3>
                <p className="text-sm text-gray-500 mt-1">All students are maintaining acceptable attendance levels</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Student</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">SVC Number</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Class</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Attendance Rate</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Total Sessions</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowAttendanceStudents.map((student, idx) => (
                      <tr key={student.id || idx} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">
                          {student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{student.svc_number || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{student.class_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            (student.attendance_rate || 0) < 50 ? 'bg-red-100 text-red-700' :
                            (student.attendance_rate || 0) < 75 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {(student.attendance_rate || 0).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{student.total_sessions || 0}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => { setSelectedStudent(student.id); setActiveTab('student') }}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Student Detail Tab */}
      {selectedClass && activeTab === 'student' && (
        <div className="space-y-6">
          {/* Student Selector */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <label className="block text-sm text-gray-600 mb-2">Select Student</label>
            <select
              value={selectedStudent || ''}
              onChange={(e) => setSelectedStudent(e.target.value ? Number(e.target.value) : null)}
              className="w-full md:w-auto px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Choose a student...</option>
              {lowAttendanceStudents.map(student => (
                <option key={student.id} value={student.id}>
                  {student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()} ({student.svc_number})
                </option>
              ))}
            </select>
          </div>

          {!selectedStudent ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto" />
              <h3 className="mt-4 text-gray-700 font-medium">Select a Student</h3>
              <p className="text-sm text-gray-500 mt-1">Choose a student from the dropdown to view their attendance details</p>
            </div>
          ) : !studentDetail ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading student details...</p>
            </div>
          ) : (
            <>
              {/* Student Summary */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-semibold mb-4">
                  {studentDetail.student_name || 'Student'} - Attendance Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600">Attendance Rate</div>
                    <div className="text-2xl font-bold">{(studentDetail.attendance_rate || 0).toFixed(1)}%</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <div className="text-sm text-emerald-700">Present</div>
                    <div className="text-2xl font-bold text-emerald-600">{studentDetail.present_count || 0}</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-sm text-yellow-700">Late</div>
                    <div className="text-2xl font-bold text-yellow-600">{studentDetail.late_count || 0}</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4">
                    <div className="text-sm text-red-700">Absent</div>
                    <div className="text-2xl font-bold text-red-600">{studentDetail.absent_count || 0}</div>
                  </div>
                </div>
              </div>

              {/* Attendance by Class */}
              {studentDetail.by_class && Object.keys(studentDetail.by_class).length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="font-semibold mb-4">Attendance by Class</h3>
                  <div className="space-y-4">
                    {Object.entries(studentDetail.by_class).map(([className, data]) => (
                      <div key={className} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{className}</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            (data.rate || 0) >= 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {(data.rate || 0).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${(data.rate || 0) >= 75 ? 'bg-emerald-500' : 'bg-red-500'}`}
                            style={{ width: `${data.rate || 0}%` }}
                          />
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-gray-600">
                          <span>Present: {data.present || 0}</span>
                          <span>Late: {data.late || 0}</span>
                          <span>Absent: {data.absent || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
