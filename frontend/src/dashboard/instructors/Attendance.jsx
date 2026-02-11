import React, { useEffect, useState } from 'react'
import api from '../../lib/api'
import useToast from '../../hooks/useToast'
import useAuth from '../../hooks/useAuth'
import Calendar from '../../components/Calendar'
import { getRankSortIndex } from '../../lib/rankOrder'

export default function Attendance() {
  const { user } = useAuth()
  const toast = useToast()

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)

  // Fetch classes on mount and filter for instructor (if user is instructor)
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        // only fetch active classes for the dropdown
        const data = await api.getClasses('is_active=true')
        // API may return paginated {count, results} or an array
        const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
        // Normalize classes: some items may include instructor id or nested instructor
        const filtered = user && user.role === 'instructor'
          ? list.filter(c => {
              if (!c) return false
              if (c.instructor && typeof c.instructor === 'object') return c.instructor.id === user.id || c.instructor === user.id
              return c.instructor === user.id || c.instructor_id === user.id
            })
          : list

        if (mounted) setClasses(filtered)
      } catch {
        // Don't hard-fail; show a toast
        toast.error('Failed to load classes')
      }
    }
    load()
    return () => { mounted = false }
  }, [user, toast])

  // When a class or date changes, fetch existing attendance and enrolled students
  useEffect(() => {
    if (!selectedClass) return
    let mounted = true

    async function loadStudents() {
      setLoading(true)
      try {
        // Get enrolled students for the class
        const enr = await api.getClassEnrolledStudents(selectedClass.id || selectedClass)
        // enrolled endpoint returns { class, count, enrollments, capacity, available_slots }
        const enrollments = (Array.isArray(enr) ? enr : (enr && (enr.enrollments || enr.results)) ? (enr.enrollments || enr.results) : [])

        const list = enrollments.map(e => {
          // enrollment may come in several shapes depending on serializer:
          // - e.student may be an object with fields (id, svc_number, rank, first_name, last_name)
          // - e may already be a student object
          // - serializer may expose student-level fields on the enrollment like e.student_name, e.student_svc_number, e.student_rank
          const studentObj = e && typeof e === 'object' && e.student && typeof e.student === 'object' ? e.student : (e && typeof e === 'object' && (e.first_name || e.svc_number) ? e : null)

          const id = studentObj ? (studentObj.id || studentObj.student_id || null) : (e.student || e.student_id || e.id || null)

          const svc = (
            (studentObj && (studentObj.svc_number || studentObj.svc)) ||
            e.student_svc_number || e.svc_number || e.svc || ''
          )

          const rank = (
            (studentObj && (studentObj.rank || '')) ||
            e.student_rank || e.rank || ''
          )

          const name = (
            e.student_name ||
            (studentObj && (studentObj.first_name ? `${studentObj.first_name} ${studentObj.last_name || ''}` : (studentObj.get_full_name || studentObj.name))) ||
            ''
          )

          return { student_id: id, svc_number: svc || '', rank: rank || '', name: name || '—', status: 'present', remarks: '' }
        })

        // Try loading existing attendance for the class/date to prefill statuses
        try {
          const att = await api.getClassAttendance(selectedClass.id || selectedClass, date)
          const existing = Array.isArray(att.results) ? att.results : (att && att.results) ? att.results : []
          // Map existing statuses by student id
          const statusMap = {}
          existing.forEach(a => { if (a.student) statusMap[a.student.id || a.student] = a.status || a.status })
          // Apply statuses to list
          list.forEach(l => {
            if (l.student_id && statusMap[l.student_id]) l.status = statusMap[l.student_id]
          })
        } catch {
          // ignore if attendance history not available
        }

        // Sort by rank: senior first
        list.sort((a, b) => getRankSortIndex(a.rank) - getRankSortIndex(b.rank))
        if (mounted) setStudents(list)
      } catch {
        toast.error('Failed to load enrolled students for the class')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadStudents()

    return () => { mounted = false }
  }, [selectedClass, date, toast])

  function updateStatus(index, value) {
    setStudents(s => {
      const copy = [...s]
      copy[index] = { ...copy[index], status: value }
      return copy
    })
  }

  async function submit() {
    if (!selectedClass) return toast.error('Select a class first')
    if (!date) return toast.error('Select a date')

    const records = students.map(s => ({ student_id: Number(s.student_id), status: s.status, remarks: s.remarks || '' }))
    const payload = { class_obj: Number(selectedClass.id || selectedClass), date, attendance_records: records }

    setLoading(true)
    try {
      const res = await api.bulkMarkAttendance(payload)
      toast.success(`Attendance saved (created: ${res.created || 0}, updated: ${res.updated || 0})`)
    } catch (err) {
      const msg = err && err.message ? err.message : (err && err.data ? JSON.stringify(err.data) : 'Failed to save attendance')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="p-4 text-black">
      <h2 className="text-2xl font-semibold">Attendance</h2>
      <p className="text-sm text-gray-600">Select a date and class, then mark students as Present / Absent / Late.</p>

      <div className="mt-4 flex gap-6">
        {/* Left column: calendar + class dropdown */}
        <div className="w-80">
          <Calendar selected={date} onSelect={(iso) => setDate(iso)} showEvents={false} />

          <div className="mt-4 bg-white p-3 rounded shadow space-y-3">
            <div>
              <label className="block text-sm text-gray-700">Class</label>
              <select value={selectedClass ? (selectedClass.id || selectedClass) : ''} onChange={(e) => setSelectedClass(classes.find(c => (c.id || c) === Number(e.target.value)) || Number(e.target.value))} className="mt-1 p-2 rounded border w-full">
                <option value="">-- select class --</option>
                {classes.map(c => (
                  <option key={c.id || c} value={c.id || c}>{c.name || c.class_code || `Class ${c.id || c}`}</option>
                ))}
              </select>
            </div>

            {/* Semester and Group removed for instructor view */}
          </div>
        </div>

        {/* Right column: students table */}
        <div className="flex-1">
          {!selectedClass ? (
            <div className="bg-white p-6 rounded shadow">
              <div className="text-gray-700">Select an active class from the left to load students for attendance.</div>
            </div>
          ) : (
            <div className="bg-white p-3 rounded shadow">
              <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-gray-600">Class: <span className="font-medium">{selectedClass && (selectedClass.name || selectedClass.class_code || selectedClass.id)}</span></div>
                <div className="text-xs text-gray-500 mt-1">Time: 10:00 AM - 10:45 AM</div>
              </div>
                <div className="flex items-center gap-3">
                  <button className="px-3 py-1 border rounded text-sm text-gray-600">Download Exl</button>
                  <button onClick={submit} disabled={loading || students.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {loading ? 'Saving...' : 'Save Attendance'}
                  </button>
                </div>
              </div>
              <h3 className="font-medium mt-4">Students</h3>
              {loading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : (
                <div className="overflow-auto mt-3">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-gray-600">
                        <th className="px-2 py-2">SVC Number</th>
                        <th className="px-2 py-2">Rank</th>
                        <th className="px-2 py-2">Name</th>
                        <th className="px-2 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-4 text-sm text-gray-500">No students loaded for this class.</td>
                        </tr>
                      )}
                      {students.map((s, idx) => (
                        <tr key={s.student_id || idx} className="border-t">
                          <td className="px-2 py-2">{s.svc_number || '—'}</td>
                          <td className="px-2 py-2">{s.rank || '—'}</td>
                          <td className="px-2 py-2 truncate max-w-[240px]">{s.name || '—'}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <button onClick={() => updateStatus(idx, 'present')} className={`px-2 py-1 rounded text-sm ${s.status === 'present' ? 'bg-emerald-500 text-white' : 'border text-gray-600'}`}>Present</button>
                              <button onClick={() => updateStatus(idx, 'absent')} className={`px-2 py-1 rounded text-sm ${s.status === 'absent' ? 'bg-rose-500 text-white' : 'border text-gray-600'}`}>Absent</button>
                              <button onClick={() => updateStatus(idx, 'late')} className={`px-2 py-1 rounded text-sm ${s.status === 'late' ? 'bg-yellow-400 text-white' : 'border text-gray-600'}`}>Late</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4">
                <button onClick={submit} disabled={loading || students.length === 0} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {loading ? 'Saving...' : 'Submit Attendance'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

