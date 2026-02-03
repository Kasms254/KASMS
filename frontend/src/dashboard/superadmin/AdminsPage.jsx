import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Plus, Search, Edit2, Trash2, MoreVertical,
  UserPlus, Shield, ShieldCheck, ChevronLeft, ChevronRight,
  Building2, X, Key, Eye, EyeOff
} from 'lucide-react'
import * as api from '../../lib/api'

export default function AdminsPage() {
  const [admins, setAdmins] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSchool, setSelectedSchool] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeDropdown, setActiveDropdown] = useState(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })
  const [deleteModal, setDeleteModal] = useState({ open: false, admin: null })
  const [createModal, setCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' })

  // Calculate password strength
  const calculatePasswordStrength = (password) => {
    let score = 0
    if (!password) return { score: 0, label: '', color: '' }

    // Length checks
    if (password.length >= 8) score += 1
    if (password.length >= 12) score += 1

    // Character type checks
    if (/[a-z]/.test(password)) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^a-zA-Z0-9]/.test(password)) score += 1

    // Map score to label and color
    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' }
    if (score <= 4) return { score, label: 'Fair', color: 'bg-yellow-500' }
    if (score <= 5) return { score, label: 'Good', color: 'bg-blue-500' }
    return { score, label: 'Strong', color: 'bg-green-500' }
  }

  const [form, setForm] = useState({
    school: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    svc_number: '',
    password: '',
    is_primary: false,
  })

  // Fetch schools for dropdown
  useEffect(() => {
    async function fetchSchools() {
      try {
        const data = await api.getSchools('page_size=100')
        setSchools(data?.results || [])
      } catch (err) {
        console.error('Failed to fetch schools:', err)
      }
    }
    fetchSchools()
  }, [])

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage)
      params.set('page_size', 10)
      if (searchTerm) params.set('search', searchTerm)
      if (selectedSchool !== 'all') params.set('school', selectedSchool)

      const data = await api.getSchoolAdmins(params.toString())
      setAdmins(data?.results || [])
      setTotalCount(data?.count || 0)
      setTotalPages(Math.ceil((data?.count || 0) / 10))
    } catch (err) {
      console.error('Failed to fetch admins:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm, selectedSchool])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const handleDelete = async () => {
    if (!deleteModal.admin) return
    try {
      await api.deleteSchoolAdmin(deleteModal.admin.id)
      setDeleteModal({ open: false, admin: null })
      fetchAdmins()
    } catch (err) {
      console.error('Failed to delete admin:', err)
    }
  }

  const handleTogglePrimary = async (admin) => {
    try {
      await api.updateSchoolAdmin(admin.id, { is_primary: !admin.is_primary })
      fetchAdmins()
    } catch (err) {
      console.error('Failed to update admin:', err)
    }
    setActiveDropdown(null)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target

    // Validate service number - only allow numbers
    if (name === 'svc_number') {
      const numericValue = value.replace(/[^0-9]/g, '')
      setForm((prev) => ({
        ...prev,
        [name]: numericValue,
      }))
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: null }))
      }
      return
    }

    // Calculate password strength
    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value))
    }

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
  }

  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})

    try {
      // First create the user
      const userData = {
        username: form.svc_number,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
        svc_number: form.svc_number,
        password: form.password,
        password2: form.password,
        role: 'admin',
        school: form.school,
        is_active: true,
      }

      const newUser = await api.addUser(userData)

      // Then create the school admin link
      await api.createSchoolAdmin({
        school: form.school,
        user: newUser.id,
        is_primary: form.is_primary,
      })

      setCreateModal(false)
      setForm({
        school: '',
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        svc_number: '',
        password: '',
        is_primary: false,
      })
      fetchAdmins()
    } catch (err) {
      console.error('Failed to create admin:', err)
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
          <h2 className="text-xl sm:text-2xl font-semibold text-black">School Admins</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage administrators for all schools</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add Admin
        </button>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by name, email, or service number..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <select
            value={selectedSchool}
            onChange={(e) => {
              setSelectedSchool(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full sm:w-64 px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">All Schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Admins Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
            <Users className="w-12 h-12 mb-4 text-neutral-300" />
            <p>No admins found</p>
            {(searchTerm || selectedSchool !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedSchool('all')
                }}
                className="mt-2 text-indigo-600 hover:text-indigo-700"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="overflow-y-visible">
                <table className="w-full">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Admin</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">School</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Contact</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Created</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white">
                  {admins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-neutral-50 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                            {(admin.user_name || 'A').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-black">{admin.user_name || 'Unknown'}</p>
                            <p className="text-sm text-neutral-500">SVC: {admin.user?.svc_number || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-neutral-400" />
                          <div>
                            <p className="font-medium text-black">{admin.school_name || 'Unknown'}</p>
                            <p className="text-xs text-neutral-500">{admin.school_code || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-neutral-700">{admin.user_email || '-'}</p>
                      </td>
                      <td className="py-3 px-4">
                        {admin.is_primary ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                            <ShieldCheck className="w-3 h-3" />
                            Primary
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-neutral-100 text-neutral-700">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-500">
                        {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              if (activeDropdown === admin.id) {
                                setActiveDropdown(null)
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setDropdownPos({
                                  top: rect.bottom + window.scrollY,
                                  right: window.innerWidth - rect.right
                                })
                                setActiveDropdown(admin.id)
                              }
                            }}
                            className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>

                        {activeDropdown === admin.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setActiveDropdown(null)}
                            />
                            <div
                              className="fixed w-48 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 z-50"
                              style={{
                                top: `${dropdownPos.top}px`,
                                right: `${dropdownPos.right}px`,
                              }}
                            >
                              <button
                                onClick={() => handleTogglePrimary(admin)}
                                className="w-full px-4 py-2 text-left text-sm text-black hover:bg-neutral-50 flex items-center gap-2"
                              >
                                {admin.is_primary ? (
                                  <>
                                    <Shield className="w-4 h-4 text-neutral-500" />
                                    <span>Remove Primary</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                                    <span>Make Primary</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteModal({ open: true, admin })
                                  setActiveDropdown(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Remove Admin</span>
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-neutral-200 gap-3">
                <p className="text-sm text-neutral-600">
                  Showing <span className="font-semibold text-black">{(currentPage - 1) * 10 + 1}</span> to{' '}
                  <span className="font-semibold text-black">{Math.min(currentPage * 10, totalCount)}</span> of{' '}
                  <span className="font-semibold text-black">{totalCount}</span> admins
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
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
                    className="p-2 rounded-lg border border-neutral-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
                  >
                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Admin Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setCreateModal(false)} />
          <div className="relative bg-white rounded-xl p-5 max-w-lg w-full shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200 z-10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-black">Create School Admin</h3>
              <button
                onClick={() => setCreateModal(false)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  School *
                </label>
                <select
                  name="school"
                  value={form.school}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    errors.school ? 'border-red-500' : 'border-neutral-200'
                  }`}
                >
                  <option value="">Select a school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name} ({school.code})
                    </option>
                  ))}
                </select>
                {errors.school && <p className="text-red-500 text-sm mt-1">{errors.school}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.first_name ? 'border-red-500' : 'border-neutral-200'
                    }`}
                  />
                  {errors.first_name && <p className="text-red-500 text-sm mt-1">{errors.first_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.last_name ? 'border-red-500' : 'border-neutral-200'
                    }`}
                  />
                  {errors.last_name && <p className="text-red-500 text-sm mt-1">{errors.last_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">
                    Service Number *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    name="svc_number"
                    value={form.svc_number}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 font-mono ${
                      errors.svc_number ? 'border-red-500' : 'border-neutral-200'
                    }`}
                    placeholder="e.g., 12345678"
                  />
                  {errors.svc_number && <p className="text-red-500 text-sm mt-1">{errors.svc_number}</p>}
                </div>
              </div>

              <p className="text-neutral-500 text-xs">Numbers only - used for login</p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.email ? 'border-red-500' : 'border-neutral-200'
                    }`}
                  />
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-600 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    name="phone_number"
                    value={form.phone_number}
                    onChange={handleChange}
                    required
                    className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.phone_number ? 'border-red-500' : 'border-neutral-200'
                    }`}
                  />
                  {errors.phone_number && <p className="text-red-500 text-sm mt-1">{errors.phone_number}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.password ? 'border-red-500' : 'border-neutral-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
                {/* Password Strength Indicator */}
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
                        passwordStrength.label === 'Good' ? 'text-blue-600' :
                        'text-green-600'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <p className="text-neutral-500 text-xs mt-1">
                      Use 8+ characters with uppercase, lowercase, numbers & symbols
                    </p>
                  </div>
                )}
                {!form.password && (
                  <p className="text-neutral-500 text-xs mt-1">Minimum 8 characters</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_primary"
                  id="is_primary"
                  checked={form.is_primary}
                  onChange={handleChange}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <label htmlFor="is_primary" className="text-sm text-neutral-700">
                  Make this admin the primary admin for the school
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="px-4 py-2 text-neutral-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create Admin
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDeleteModal({ open: false, admin: null })} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200 z-10">
            <h3 className="text-lg font-semibold text-black">Remove Admin</h3>
            <p className="mt-2 text-neutral-600">
              Are you sure you want to remove <strong>{deleteModal.admin?.user_name}</strong> as an admin for{' '}
              <strong>{deleteModal.admin?.school_name}</strong>? The user account will remain but will no longer have admin access.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, admin: null })}
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

      {/* Click outside to close dropdown */}
      {activeDropdown && (
        <div className="fixed inset-0 z-0" onClick={() => setActiveDropdown(null)} />
      )}
    </div>
  )
}
