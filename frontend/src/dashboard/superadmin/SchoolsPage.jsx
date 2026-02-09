import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2, Plus, Search, Edit2, Trash2, MoreVertical,
  Eye, Power, PowerOff, Upload, School, ChevronLeft, ChevronRight
} from 'lucide-react'
import * as api from '../../lib/api'

export default function SchoolsPage() {
  const navigate = useNavigate()
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [activeDropdown, setActiveDropdown] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ open: false, school: null })

  const fetchSchools = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage)
      params.set('page_size', 10)
      if (searchTerm) params.set('search', searchTerm)

      const data = await api.getSchools(params.toString())
      setSchools(data?.results || [])
      setTotalCount(data?.count || 0)
      setTotalPages(Math.ceil((data?.count || 0) / 10))
    } catch (err) {
      console.error('Failed to fetch schools:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm])

  useEffect(() => {
    fetchSchools()
  }, [fetchSchools])

  const handleToggleActive = async (school) => {
    try {
      if (school.is_active) {
        await api.deactivateSchool(school.id)
      } else {
        await api.activateSchool(school.id)
      }
      fetchSchools()
    } catch (err) {
      console.error('Failed to toggle school status:', err)
    }
    setActiveDropdown(null)
  }

  const handleDelete = async () => {
    if (!deleteModal.school) return
    try {
      await api.deleteSchool(deleteModal.school.id)
      setDeleteModal({ open: false, school: null })
      fetchSchools()
    } catch (err) {
      console.error('Failed to delete school:', err)
    }
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-black">Schools</h2>
          <p className="text-xs sm:text-sm text-neutral-500">Manage all schools in the system</p>
        </div>
        <Link
          to="/superadmin/schools/new"
          className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add School
        </Link>
      </header>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search schools by name or code..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
      </div>

      {/* Schools Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
            <Building2 className="w-12 h-12 mb-4 text-neutral-300" />
            <p>No schools found</p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-indigo-600 hover:text-indigo-700"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div>
              <table className="w-full">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">School</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Code</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Theme</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Created</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {schools.map((school) => (
                    <tr key={school.id} className="hover:bg-neutral-50 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: school.primary_color || '#1976D2' }}
                          >
                            {school.logo ? (
                              <img
                                src={school.logo_url}
                                alt={school.name}
                                className="w-8 h-8 rounded object-contain"
                              />
                            ) : (
                              <School className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-black">{school.name}</p>
                            {school.short_name && (
                              <p className="text-sm text-neutral-500">{school.short_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm bg-neutral-100 px-2 py-1 rounded text-neutral-700">
                          {school.code}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-6 h-6 rounded border border-neutral-200"
                            style={{ backgroundColor: school.primary_color }}
                            title="Primary"
                          />
                          <div
                            className="w-6 h-6 rounded border border-neutral-200"
                            style={{ backgroundColor: school.secondary_color }}
                            title="Secondary"
                          />
                          <div
                            className="w-6 h-6 rounded border border-neutral-200"
                            style={{ backgroundColor: school.accent_color }}
                            title="Accent"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            school.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {school.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-500">
                        {school.created_at ? new Date(school.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2 relative">
                          <button
                            onClick={() => navigate(`/superadmin/schools/${school.id}`)}
                            className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/superadmin/schools/${school.id}/edit`)}
                            className="p-2 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setActiveDropdown(activeDropdown === school.id ? null : school.id)}
                            className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {activeDropdown === school.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-10">
                              <button
                                onClick={() => handleToggleActive(school)}
                                className="w-full px-4 py-2 text-left text-sm text-black hover:bg-neutral-50 flex items-center gap-2"
                              >
                                {school.is_active ? (
                                  <>
                                    <PowerOff className="w-4 h-4 text-red-500" />
                                    <span>Deactivate</span>
                                  </>
                                ) : (
                                  <>
                                    <Power className="w-4 h-4 text-green-500" />
                                    <span>Activate</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteModal({ open: true, school })
                                  setActiveDropdown(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-neutral-200 gap-3">
                <p className="text-sm text-neutral-600">
                  Showing <span className="font-semibold text-black">{(currentPage - 1) * 10 + 1}</span> to{' '}
                  <span className="font-semibold text-black">{Math.min(currentPage * 10, totalCount)}</span> of{' '}
                  <span className="font-semibold text-black">{totalCount}</span> schools
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

      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDeleteModal({ open: false, school: null })} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-black">Delete School</h3>
            <p className="mt-2 text-neutral-600">
              Are you sure you want to delete <strong>{deleteModal.school?.name}</strong>? This action cannot be undone and will remove all associated data.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, school: null })}
                className="px-4 py-2 text-neutral-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete
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
