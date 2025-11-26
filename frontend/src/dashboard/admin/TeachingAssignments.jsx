import React, { useEffect, useState } from 'react'
import useToast from '../../hooks/useToast'
import ConfirmModal from '../../components/ConfirmModal'
import * as api from '../../lib/api'

export default function TeachingAssignments() {
  const toast = useToast()
  const [instructors, setInstructors] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [assignments, setAssignments] = useState([])

  const [form, setForm] = useState({ instructor: '', class: '', subject: '' })
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState({ open: false, id: null, label: '' })
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [ins, cls, subs] = await Promise.all([
          api.getInstructors(),
          // only active classes
          api.getClasses('is_active=true'),
          // get all subjects to derive existing assignments
          api.getSubjects('is_active=true'),
        ])
        setInstructors(Array.isArray(ins) ? ins : [])
        setClasses(Array.isArray(cls) ? cls : [])
        // subjects can include instructor field; existing assignments are subjects with instructor set
        setAssignments(Array.isArray(subs) ? (subs.filter(s => s.instructor)) : [])
      } catch (err) {
        toast?.push?.({ message: err.message || 'Failed to load initial data', type: 'error' })
      }
    })()
  }, [toast])

  async function onClassChange(classId) {
    setForm({ ...form, class: classId, subject: '' })
    if (!classId) {
      setSubjects([])
      return
    }

    try {
      const resp = await api.getClassSubjects(classId)
      // ClassViewSet.subjects returns { class, count, subjects }
      const subs = Array.isArray(resp?.subjects) ? resp.subjects : (Array.isArray(resp) ? resp : [])
      // filter out subjects already assigned for this class (subjects with instructor set)
      const available = subs.filter(s => !s.instructor)
      setSubjects(available)
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to load subjects for class', type: 'error' })
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.instructor || !form.class || !form.subject) {
      toast?.push?.({ message: 'Please select instructor, class and subject', type: 'warning' })
      return
    }
    setLoading(true)
    try {
      // use subject assign endpoint: /api/subjects/<id>/assign_instructor/
      await api.assignInstructorToSubject(form.subject, form.instructor)
      toast?.push?.({ message: 'Assignment created', type: 'success' })
      // refresh assignments (subjects with instructor set)
      const subs = await api.getSubjects('is_active=true')
      setAssignments(Array.isArray(subs) ? (subs.filter(s => s.instructor)) : [])
      // refresh available subjects for selected class
      await onClassChange(form.class)
      setForm({ instructor: '', class: '', subject: '' })
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to create assignment', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleRemoveClick(assignment) {
    setConfirm({ open: true, id: assignment.id, label: assignment.name || assignment.title || 'this assignment' })
  }

  async function confirmRemove() {
    if (!confirm.id) return
    setRemoving(true)
    try {
      await api.removeInstructorFromSubject(confirm.id)
      toast?.push?.({ message: 'Assignment removed', type: 'success' })
      const subs = await api.getSubjects('is_active=true')
      setAssignments(Array.isArray(subs) ? (subs.filter(s => s.instructor)) : [])
      if (form.class) await onClassChange(form.class)
    } catch (err) {
      toast?.push?.({ message: err.message || 'Failed to remove assignment', type: 'error' })
    } finally {
      setRemoving(false)
      setConfirm({ open: false, id: null, label: '' })
    }
  }

  return (
    <div className="p-4 text-black">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">Teaching Assignments</h2>
        <p className="text-sm text-black">Assign instructors to subjects for a class</p>
      </div>

      <form className="bg-white p-4 rounded shadow mb-6" onSubmit={submit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-black mb-1">Instructor</label>
            <select
              value={form.instructor}
              onChange={(e) => setForm({ ...form, instructor: e.target.value })}
              className="w-full border rounded px-3 py-2 text-black"
            >
              <option value="">Select instructor</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.first_name ? `${i.first_name} ${i.last_name || ''}` : (i.svc_number || i.username)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-black mb-1">Class</label>
            <select
              value={form.class}
              onChange={(e) => onClassChange(e.target.value)}
              className="w-full border rounded px-3 py-2 text-black"
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.title || `Class ${c.id}`}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-black mb-1">Subject</label>
            <select
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full border rounded px-3 py-2 text-black"
              disabled={!form.class}
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <button disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? 'Saving...' : 'Create assignment'}
          </button>
        </div>
      </form>

      <div className="bg-white p-4 rounded shadow">
            <h3 className="font-medium mb-3 text-black">Existing assignments</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-black">
                <th className="py-2">Instructor</th>
                <th className="py-2">Class</th>
                <th className="py-2">Subject</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-black">No assignments yet</td>
                </tr>
              )}
              {assignments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="py-2 text-black">{a.instructor?.first_name ? `${a.instructor.first_name} ${a.instructor.last_name || ''}` : (a.instructor?.svc_number || a.instructor)}</td>
                  <td className="py-2 text-black">{a.class_obj?.name || a.class_obj?.title || (a.class_obj?.id || (a.class && (a.class.name || a.class)))}</td>
                  <td className="py-2 text-black">{a.name || a.title}</td>
                  <td className="py-2">
                    <button onClick={() => handleRemoveClick(a)} className="text-red-600 hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <ConfirmModal
        open={confirm.open}
        title="Remove assignment"
        message={`Remove ${confirm.label}?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={confirmRemove}
        onCancel={() => setConfirm({ open: false, id: null, label: '' })}
        loading={removing}
      />
    </div>
  )
}
