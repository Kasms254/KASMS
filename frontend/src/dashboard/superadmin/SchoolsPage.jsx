import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Building2, Plus, Search, Edit2, Trash2, MoreVertical,
  Eye, Power, PowerOff, Upload, School, ChevronLeft, ChevronRight
} from 'lucide-react'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'

export default function SchoolsPage() {
  const navigate = useNavigate()
  const toast = useToast()
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
      toast.error(err?.message || 'Failed to load schools')
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm, toast])

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
      toast.error(err?.message || 'Failed to update school status')
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
      toast.error(err?.message || 'Failed to delete school')
    }
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-fg">Schools</h2>
          <p className="text-xs sm:text-sm text-fg-soft">Manage all schools in the system</p>
        </div>
        <Link
          to="/superadmin/schools/new"
          className="flex-1 sm:flex-none px-4 py-2 bg-fill-indigo-600 text-white rounded-lg hover:bg-fill-indigo-700 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add School
        </Link>
      </header>

      {/* Search */}
      <div className="bg-surface rounded-xl shadow-sm border border-line p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-faint" />
          <input
            type="text"
            placeholder="Search schools by name or code..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 border border-line rounded-lg text-fg placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-edge-indigo-200"
          />
        </div>
      </div>

      {/* Schools Table */}
      <div className="bg-surface rounded-xl shadow-sm border border-line">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edge-indigo-600"></div>
          </div>
        ) : schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-fg-soft">
            <Building2 className="w-12 h-12 mb-4 text-fg-faint" />
            <p>No schools found</p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-mark-indigo-600 hover:text-mark-indigo-700"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div>
              <table className="w-full">
                <thead className="bg-canvas border-b border-line">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">School</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Code</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Theme</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Created</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-fg-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {schools.map((school) => (
                    <tr key={school.id} className="hover:bg-canvas transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: school.primary_color || '#1976D2' }}
                          >
                            {school.logo ? (
                              <img
                                src={school.logo}
                                alt={school.name}
                                className="w-8 h-8 rounded object-contain"
                              />
                            ) : (
                              <School className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-fg">{school.name}</p>
                            {school.short_name && (
                              <p className="text-sm text-fg-soft">{school.short_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm bg-surface-2 px-2 py-1 rounded text-fg-body">
                          {school.code}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-6 h-6 rounded border border-line"
                            style={{ backgroundColor: school.primary_color }}
                            title="Primary"
                          />
                          <div
                            className="w-6 h-6 rounded border border-line"
                            style={{ backgroundColor: school.secondary_color }}
                            title="Secondary"
                          />
                          <div
                            className="w-6 h-6 rounded border border-line"
                            style={{ backgroundColor: school.accent_color }}
                            title="Accent"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            school.is_active
                              ? 'bg-fill-green-100 text-mark-green-700'
                              : 'bg-fill-red-100 text-mark-red-700'
                          }`}
                        >
                          {school.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-fg-soft">
                        {school.created_at ? new Date(school.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2 relative">
                          <button
                            onClick={() => navigate(`/superadmin/schools/${school.id}`)}
                            className="p-2 text-fg-soft hover:text-mark-indigo-600 hover:bg-fill-indigo-50 rounded-lg transition"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/superadmin/schools/${school.id}/edit`)}
                            className="p-2 text-fg-soft hover:text-mark-green-600 hover:bg-fill-green-50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setActiveDropdown(activeDropdown === school.id ? null : school.id)}
                            className="p-2 text-fg-soft hover:text-fg-body hover:bg-surface-2 rounded-lg transition"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {activeDropdown === school.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-surface rounded-lg shadow-lg border border-line py-1 z-10">
                              <button
                                onClick={() => handleToggleActive(school)}
                                className="w-full px-4 py-2 text-left text-sm text-fg hover:bg-canvas flex items-center gap-2"
                              >
                                {school.is_active ? (
                                  <>
                                    <PowerOff className="w-4 h-4 text-mark-red-500" />
                                    <span>Deactivate</span>
                                  </>
                                ) : (
                                  <>
                                    <Power className="w-4 h-4 text-mark-green-500" />
                                    <span>Activate</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteModal({ open: true, school })
                                  setActiveDropdown(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-canvas flex items-center gap-2 text-mark-red-600"
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
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-line gap-3">
                <p className="text-sm text-fg-muted">
                  Showing <span className="font-semibold text-fg">{(currentPage - 1) * 10 + 1}</span> to{' '}
                  <span className="font-semibold text-fg">{Math.min(currentPage * 10, totalCount)}</span> of{' '}
                  <span className="font-semibold text-fg">{totalCount}</span> schools
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-line bg-surface disabled:opacity-50 disabled:cursor-not-allowed hover:bg-canvas transition"
                  >
                    <ChevronLeft className="w-4 h-4 text-fg-muted" />
                  </button>
                  <span className="text-sm text-fg-muted">
                    Page <span className="font-semibold text-fg">{currentPage}</span> of{' '}
                    <span className="font-semibold text-fg">{totalPages}</span>
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-line bg-surface disabled:opacity-50 disabled:cursor-not-allowed hover:bg-canvas transition"
                  >
                    <ChevronRight className="w-4 h-4 text-fg-muted" />
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
          <div className="relative bg-surface rounded-xl p-6 max-w-md w-full shadow-2xl ring-1 ring-hair animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-fg">Delete School</h3>
            <p className="mt-2 text-fg-muted">
              Are you sure you want to delete <strong>{deleteModal.school?.name}</strong>? This action cannot be undone and will remove all associated data.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, school: null })}
                className="px-4 py-2 text-fg-body bg-surface-3 rounded-lg hover:bg-surface-4 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-fill-red-600 text-white rounded-lg hover:bg-fill-red-700 transition"
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
