import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCommandantDepartmentDetails } from '../../lib/api'
import useToast from '../../hooks/useToast'

function initials(name = '') {
  return name.split(' ').map((s) => s[0] || '').slice(0, 2).join('').toUpperCase()
}

export default function CommandantDepartmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [dept, setDept] = useState(null)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const data = await getCommandantDepartmentDetails(id)
        setDept(data)
      } catch (err) {
        reportError(err?.message || 'Failed to load department details')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, reportError])

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-sm text-neutral-500">Loading...</div>
      </div>
    )
  }

  if (!dept) {
    return (
      <div className="p-4">
        <div className="text-sm text-neutral-400">Department not found.</div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition flex-shrink-0"
          >
            ← Back
          </button>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-black truncate">{dept.name}</h2>
            <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">{dept.code}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0 ${dept.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-500'}`}>
          {dept.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Description */}
      {dept.description && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 mb-4">
          <p className="text-sm text-neutral-700">{dept.description}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Courses</p>
          <p className="text-3xl font-semibold text-black">{dept.courses?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Classes</p>
          <p className="text-3xl font-semibold text-black">{dept.classes?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Members</p>
          <p className="text-3xl font-semibold text-black">{dept.member_count ?? dept.members?.length ?? 0}</p>
        </div>
      </div>

      {/* Courses */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm mb-4">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-black">Courses</h3>
        </div>
        {dept.courses?.length > 0 ? (
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {dept.courses.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-black">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{c.code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">No courses in this department</p>
        )}
        {/* Mobile */}
        {dept.courses?.length > 0 && (
          <div className="lg:hidden p-4 space-y-2">
            {dept.courses.map((c) => (
              <div key={c.id} className="bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200">
                <p className="text-sm font-medium text-black">{c.name}</p>
                {c.code && <p className="text-xs text-neutral-500 mt-0.5">{c.code}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Classes */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm mb-4">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-black">Classes</h3>
        </div>
        {dept.classes?.length > 0 ? (
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {dept.classes.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-black">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{c.class_code || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.is_closed ? 'bg-red-100 text-red-700' : c.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                        {c.is_closed ? 'Closed' : c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">No classes in this department</p>
        )}
        {/* Mobile */}
        {dept.classes?.length > 0 && (
          <div className="lg:hidden p-4 space-y-2">
            {dept.classes.map((c) => (
              <div key={c.id} className="bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-black">{c.name}</p>
                  {c.class_code && <p className="text-xs text-neutral-500">{c.class_code}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.is_closed ? 'bg-red-100 text-red-700' : c.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {c.is_closed ? 'Closed' : c.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      {dept.members?.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-black">Members</h3>
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Svc No.</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {dept.members.map((m) => (
                  <tr key={m.id} className="hover:bg-neutral-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                          {initials(m.full_name || m.user_name || '?')}
                        </div>
                        <span className="text-sm font-medium text-black">{m.full_name || m.user_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{m.svc_number || m.user_svc_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${m.role === 'hod' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                        {m.role === 'hod' ? 'HOD' : 'Member'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden p-4 space-y-2">
            {dept.members.map((m) => (
              <div key={m.id} className="bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                    {initials(m.full_name || m.user_name || '?')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black">{m.full_name || m.user_name || '—'}</p>
                    <p className="text-xs text-neutral-500">{m.svc_number || m.user_svc_number || ''}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${m.role === 'hod' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                  {m.role === 'hod' ? 'HOD' : 'Member'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
