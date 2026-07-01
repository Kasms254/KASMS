import { useState, useEffect, useCallback } from 'react'
import {
  Users, UserPlus, Search, Trash2, ChevronLeft, ChevronRight,
  Shield, X, Eye, EyeOff, Star,
} from 'lucide-react'
import * as api from '../../lib/api'

export default function COTOfficersPage() {
  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [deleteModal, setDeleteModal] = useState({ open: false, officer: null })
  const [createModal, setCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' })

  const calculatePasswordStrength = (password) => {
    if (!password) return { score: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 8) score += 1
    if (password.length >= 12) score += 1
    if (/[a-z]/.test(password)) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^a-zA-Z0-9]/.test(password)) score += 1
    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' }
    if (score <= 4) return { score, label: 'Fair', color: 'bg-yellow-500' }
    if (score <= 5) return { score, label: 'Good', color: 'bg-blue-500' }
    return { score, label: 'Strong', color: 'bg-green-500' }
  }

  const RANK_CHOICES = [
    { value: 'major', label: 'Major' },
    { value: 'lieutenant_colonel', label: 'Lieutenant Colonel' },
    { value: 'colonel', label: 'Colonel' },
    { value: 'brigadier', label: 'Brigadier' },
  ]

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    svc_number: '',
    rank: '',
    password: '',
  })

  const fetchOfficers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage)
      params.set('page_size', 10)
      params.set('role', 'chief_of_training')
      if (searchTerm) params.set('search', searchTerm)
      const data = await api.getUsers(params.toString())
      setOfficers(data?.results || [])
      setTotalCount(data?.count || 0)
      setTotalPages(Math.ceil((data?.count || 0) / 10))
    } catch (err) {
      console.error('Failed to fetch COT officers:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm])

  useEffect(() => {
    fetchOfficers()
  }, [fetchOfficers])

  const handleDelete = async () => {
    if (!deleteModal.officer) return
    try {
      await api.deleteUser(deleteModal.officer.id)
      setDeleteModal({ open: false, officer: null })
      fetchOfficers()
    } catch (err) {
      console.error('Failed to delete officer:', err)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'svc_number') {
      setForm((prev) => ({ ...prev, [name]: value.replace(/[^0-9]/g, '') }))
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }))
      return
    }
    if (name === 'password') setPasswordStrength(calculatePasswordStrength(value))
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await api.addUser({
        username: form.svc_number,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
        svc_number: form.svc_number,
        rank: form.rank || undefined,
        password: form.password,
        password2: form.password,
        role: 'chief_of_training',
        is_active: true,
      })
      setCreateModal(false)
      setForm({ first_name: '', last_name: '', email: '', phone_number: '', svc_number: '', rank: '', password: '' })
      fetchOfficers()
    } catch (err) {
      console.error('Failed to create COT officer:', err)
      if (err.data) {
        const fieldErrors = {}
        Object.entries(err.data).forEach(([key, value]) => {
          fieldErrors[key] = Array.isArray(value) ? value[0] : value
        })
        setErrors(fieldErrors)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Chief of Training Officers</h2>
          <p className="text-xs sm:text-sm text-neutral-500">
            Global role — no school affiliation. Can view all schools' submitted reports.
          </p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add COT Officer
        </button>
      </header>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name, email, or service number..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : officers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
            <Users className="w-12 h-12 mb-4 text-neutral-300" />
            <p>{searchTerm ? 'No officers match your search' : 'No COT Officers added yet'}</p>
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="mt-2 text-indigo-600 hover:text-indigo-700">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Officer</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Contact</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Added</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {officers.map((officer) => (
                    <tr key={officer.id} className="hover:bg-neutral-50 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                            {(officer.first_name || officer.username || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-black">
                              {officer.rank ? `${officer.rank} ` : ''}{officer.first_name} {officer.last_name}
                            </p>
                            <p className="text-sm text-neutral-500">SVC: {officer.svc_number || officer.username || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-neutral-700">{officer.email || '—'}</p>
                        {officer.phone_number && (
                          <p className="text-xs text-neutral-400">{officer.phone_number}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                          <Star className="w-3 h-3" />
                          Chief of Training
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-500">
                        {officer.created_at ? new Date(officer.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => setDeleteModal({ open: true, officer })}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Remove officer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-neutral-200 gap-3">
                <p className="text-sm text-neutral-600">
                  Showing <span className="font-semibold text-black">{(currentPage - 1) * 10 + 1}</span>–
                  <span className="font-semibold text-black">{Math.min(currentPage * 10, totalCount)}</span> of{' '}
                  <span className="font-semibold text-black">{totalCount}</span> officers
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
                  >
                    <ChevronLeft className="w-4 h-4 text-neutral-600" />
                  </button>
                  <span className="text-sm text-neutral-600">
                    Page <span className="font-semibold text-black">{currentPage}</span> of{' '}
                    <span className="font-semibold text-black">{totalPages}</span>
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateModal(false)} />
          <div className="relative bg-white rounded-xl p-5 max-w-lg w-full shadow-2xl ring-1 ring-black/5 z-10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-black">Add COT Officer</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Global role — no school required</p>
              </div>
              <button onClick={() => setCreateModal(false)} className="p-2 hover:bg-neutral-100 rounded-lg">
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">First Name *</label>
                  <input
                    type="text" name="first_name" value={form.first_name} onChange={handleChange} required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.first_name ? 'border-red-500' : 'border-neutral-200'}`}
                  />
                  {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Last Name *</label>
                  <input
                    type="text" name="last_name" value={form.last_name} onChange={handleChange} required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.last_name ? 'border-red-500' : 'border-neutral-200'}`}
                  />
                  {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Service Number *</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" name="svc_number"
                    value={form.svc_number} onChange={handleChange} required placeholder="e.g., 12345678"
                    className={`w-full px-3 py-2 border rounded-lg text-black font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.svc_number ? 'border-red-500' : 'border-neutral-200'}`}
                  />
                  {errors.svc_number && <p className="text-red-500 text-xs mt-1">{errors.svc_number}</p>}
                  <p className="text-neutral-400 text-xs mt-0.5">Numbers only — used for login</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Rank</label>
                  <select
                    name="rank" value={form.rank} onChange={handleChange}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">— Select rank —</option>
                    {RANK_CHOICES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Email *</label>
                  <input
                    type="email" name="email" value={form.email} onChange={handleChange} required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.email ? 'border-red-500' : 'border-neutral-200'}`}
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">Phone *</label>
                  <input
                    type="tel" name="phone_number" value={form.phone_number} onChange={handleChange} required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.phone_number ? 'border-red-500' : 'border-neutral-200'}`}
                  />
                  {errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} name="password"
                    value={form.password} onChange={handleChange} required minLength={8}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${errors.password ? 'border-red-500' : 'border-neutral-200'}`}
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                {form.password && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${
                        passwordStrength.label === 'Weak' ? 'text-red-600' :
                        passwordStrength.label === 'Fair' ? 'text-yellow-600' :
                        passwordStrength.label === 'Good' ? 'text-blue-600' : 'text-green-600'
                      }`}>{passwordStrength.label}</span>
                    </div>
                    <p className="text-neutral-400 text-xs mt-1">8+ chars with uppercase, lowercase, numbers & symbols</p>
                  </div>
                )}
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <Shield className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                <span>
                  This officer will have read-only access to submitted reports from <strong>all schools</strong>.
                  They are not assigned to any school.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button" onClick={() => setCreateModal(false)}
                  className="px-4 py-2 text-neutral-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Creating...</>
                  ) : (
                    <><UserPlus className="w-4 h-4" />Add Officer</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModal({ open: false, officer: null })} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full shadow-2xl ring-1 ring-black/5 z-10">
            <h3 className="text-lg font-semibold text-black">Remove COT Officer</h3>
            <p className="mt-2 text-neutral-600">
              Are you sure you want to remove{' '}
              <strong>{deleteModal.officer?.first_name} {deleteModal.officer?.last_name}</strong> as a
              Chief of Training officer? Their account will be deleted.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, officer: null })}
                className="px-4 py-2 text-neutral-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
