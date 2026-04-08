import React, { useEffect, useState, useCallback } from 'react'
import useToast from '../../hooks/useToast'
import {
  getBiometricDevices,
  createBiometricDevice,
  updateBiometricDevice,
  deleteBiometricDevice,
  triggerBiometricDeviceSync,
  syncBiometricDeviceNow,
  getBiometricDeviceUsers,
  syncBiometricDeviceClock,
  autoMapBiometricUsers,
  getBiometricUserMappings,
  createBiometricUserMapping,
  updateBiometricUserMapping,
  deleteBiometricUserMapping,
  getStudents,
  getBiometricRecords,
} from '../../lib/api'

const PUSH_ENDPOINT = `${import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL}/api/biometric/push/`
import SearchableSelect from '../../components/SearchableSelect'

const EMPTY_DEVICE = {
  name: '',
  ip_address: '',
  port: 4370,
  device_type: 'zkteco_f22',
  location_description: '',
  sync_interval_seconds: 30,
  time_offset_seconds: 0,
  connection_timeout: 5,
  status: 'active',
  is_active: true,
}

function sanitizeInput(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
}

function statusBadge(status) {
  const map = {
    active: 'bg-indigo-100 text-indigo-700',
    inactive: 'bg-neutral-100 text-neutral-500',
    maintenance: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${map[status] || 'bg-neutral-100 text-neutral-500'}`}>
      {status}
    </span>
  )
}

function syncStatusBadge(device) {
  if (!device.last_sync_at) return <span className="text-xs text-neutral-400">Never synced</span>
  const delta = (Date.now() - new Date(device.last_sync_at).getTime()) / 1000
  if (delta < 120) return <span className="text-xs font-medium text-green-600">Online</span>
  if (delta < 600) return <span className="text-xs font-medium text-yellow-500">Delayed</span>
  return <span className="text-xs font-medium text-red-500">Offline</span>
}

function extractErrors(err) {
  if (!err?.data || typeof err.data !== 'object') return {}
  const fieldErrors = {}
  Object.keys(err.data).forEach((k) => {
    const v = err.data[k]
    if (k === 'non_field_errors' || k === 'detail') return
    fieldErrors[k] = Array.isArray(v) ? v.join(' ') : String(v)
  })
  return fieldErrors
}

function extractNonFieldError(err) {
  if (err?.data?.non_field_errors) return Array.isArray(err.data.non_field_errors) ? err.data.non_field_errors.join(' ') : err.data.non_field_errors
  if (err?.data?.detail) return err.data.detail
  return null
}

export default function BiometricDevices() {
  const [tab, setTab] = useState('devices')
  const toast = useToast()

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])
  const reportSuccess = useCallback((msg) => {
    if (!msg) return
    if (toast?.success) return toast.success(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'success' })
  }, [toast])

  // ── Devices state ─────────────────────────────────────────────────────────
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editDevice, setEditDevice] = useState(null)
  const [deviceForm, setDeviceForm] = useState(EMPTY_DEVICE)
  const [deviceErrors, setDeviceErrors] = useState({})
  const [deviceFormError, setDeviceFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionLoading, setActionLoading] = useState({})
  const [deviceUsersModal, setDeviceUsersModal] = useState(null)
  const [deviceUsersLoading, setDeviceUsersLoading] = useState(false)


  const loadDevices = useCallback(async () => {
    setDevicesLoading(true)
    try {
      let params = ''
      const parts = []
      if (search.trim()) parts.push(`search=${encodeURIComponent(search.trim())}`)
      if (filterStatus) parts.push(`status=${filterStatus}`)
      if (filterActive !== '') parts.push(`is_active=${filterActive}`)
      if (parts.length) params = parts.join('&')
      const data = await getBiometricDevices(params)
      setDevices(Array.isArray(data) ? data : (data?.results ?? []))
    } catch (err) {
      reportError(err?.message || 'Failed to load biometric devices')
    } finally {
      setDevicesLoading(false)
    }
  }, [search, filterStatus, filterActive, reportError])

  useEffect(() => { loadDevices() }, [loadDevices])

  function openAdd() {
    setDeviceForm(EMPTY_DEVICE)
    setDeviceErrors({})
    setDeviceFormError('')
    setEditDevice(null)
    setAddModalOpen(true)
  }

  function openEdit(device) {
    setDeviceForm({
      name: device.name || '',
      ip_address: device.ip_address || '',
      port: device.port ?? 4370,
      device_type: device.device_type || 'zkteco_f22',
      location_description: device.location_description || '',
      sync_interval_seconds: device.sync_interval_seconds ?? 30,
      time_offset_seconds: device.time_offset_seconds ?? 0,
      connection_timeout: device.connection_timeout ?? 5,
      status: device.status || 'active',
      is_active: device.is_active !== false,
    })
    setDeviceErrors({})
    setDeviceFormError('')
    setEditDevice(device)
    setAddModalOpen(true)
  }

  async function handleSaveDevice(e) {
    e.preventDefault()
    setDeviceErrors({})
    setDeviceFormError('')
    const errs = {}
    if (!deviceForm.name.trim()) errs.name = 'Device name is required'
    if (!deviceForm.ip_address.trim()) errs.ip_address = 'IP address is required'
    if (!deviceForm.port) errs.port = 'Port is required'
    if (Object.keys(errs).length) { setDeviceErrors(errs); return }

    setIsSaving(true)
    try {
      const payload = {
        ...deviceForm,
        port: parseInt(deviceForm.port, 10),
        sync_interval_seconds: parseInt(deviceForm.sync_interval_seconds, 10),
        time_offset_seconds: parseInt(deviceForm.time_offset_seconds, 10),
        connection_timeout: parseInt(deviceForm.connection_timeout, 10),
      }
      if (editDevice) {
        await updateBiometricDevice(editDevice.id, payload)
        reportSuccess('Device updated successfully')
      } else {
        await createBiometricDevice(payload)
        reportSuccess('Device added successfully')
      }
      setAddModalOpen(false)
      loadDevices()
    } catch (err) {
      const fieldErrors = extractErrors(err)
      const nonField = extractNonFieldError(err)
      if (Object.keys(fieldErrors).length) { setDeviceErrors(fieldErrors); return }
      setDeviceFormError(nonField || err?.message || 'Failed to save device. Please check your inputs and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteDevice() {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await deleteBiometricDevice(confirmDelete.id)
      reportSuccess(`Device "${confirmDelete.name}" deleted`)
      setConfirmDelete(null)
      loadDevices()
    } catch (err) {
      reportError(err?.message || 'Failed to delete device. It may have dependent records.')
    } finally {
      setIsDeleting(false)
    }
  }

  function isActing(deviceId, action) {
    return !!actionLoading[`${deviceId}_${action}`]
  }

  async function handleAction(deviceId, action) {
    setActionLoading(prev => ({ ...prev, [`${deviceId}_${action}`]: true }))
    try {
      let result
      if (action === 'sync_now') {
        result = await syncBiometricDeviceNow(deviceId)
        reportSuccess(`Sync complete — ${result?.records_synced ?? 0} records synced`)
      } else if (action === 'trigger_sync') {
        await triggerBiometricDeviceSync(deviceId)
        reportSuccess('Background sync queued successfully')
      } else if (action === 'sync_clock') {
        result = await syncBiometricDeviceClock(deviceId)
        if (result?.status === 'success') reportSuccess('Device clock synchronised')
        else reportError('Clock sync failed — check device connectivity')
      } else if (action === 'auto_map') {
        result = await autoMapBiometricUsers(deviceId)
        const msg = `Auto-map complete — ${result?.mapped ?? 0} students mapped, ${result?.unmapped_count ?? 0} device users not matched`
        reportSuccess(msg)
      }
      loadDevices()
    } catch (err) {
      const labels = { sync_now: 'Sync', trigger_sync: 'Queue sync', sync_clock: 'Clock sync', auto_map: 'Auto-map' }
      reportError(err?.message || `${labels[action] || 'Action'} failed — check device connectivity`)
    } finally {
      setActionLoading(prev => ({ ...prev, [`${deviceId}_${action}`]: false }))
    }
  }

  async function handleViewDeviceUsers(device) {
    setDeviceUsersModal({ device, users: [] })
    setDeviceUsersLoading(true)
    try {
      const data = await getBiometricDeviceUsers(device.id)
      setDeviceUsersModal({ device, users: data?.users ?? [] })
    } catch (err) {
      reportError(err?.message || 'Failed to fetch device users — check device connectivity')
      setDeviceUsersModal(null)
    } finally {
      setDeviceUsersLoading(false)
    }
  }

  // ── User Mappings state ───────────────────────────────────────────────────
  const [mappings, setMappings] = useState([])
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [filterMappingDevice, setFilterMappingDevice] = useState('')
  const [filterMappingActive, setFilterMappingActive] = useState('')
  const [mappingModal, setMappingModal] = useState(false)
  const [mappingForm, setMappingForm] = useState({ device: '', device_user_id: '', device_user_name: '', student: '' })
  const [mappingErrors, setMappingErrors] = useState({})
  const [mappingFormError, setMappingFormError] = useState('')
  const [isSavingMapping, setIsSavingMapping] = useState(false)
  const [editMapping, setEditMapping] = useState(null)
  const [editMappingForm, setEditMappingForm] = useState({ device_user_name: '', is_active: true })
  const [editMappingErrors, setEditMappingErrors] = useState({})
  const [editMappingFormError, setEditMappingFormError] = useState('')
  const [isSavingEditMapping, setIsSavingEditMapping] = useState(false)
  const [confirmDeleteMapping, setConfirmDeleteMapping] = useState(null)
  const [isDeletingMapping, setIsDeletingMapping] = useState(false)
  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)

  // ── Push Monitor state ────────────────────────────────────────────────────
  const [pushRecords, setPushRecords] = useState([])
  const [pushLoading, setPushLoading] = useState(false)
  const [pushLastRefreshed, setPushLastRefreshed] = useState(null)
  const [pushCopied, setPushCopied] = useState(false)

  async function loadStudents() {
    setStudentsLoading(true)
    try {
      const data = await getStudents()
      setStudents(Array.isArray(data) ? data : (data?.results ?? []))
    } catch {
      // non-critical — form will show empty dropdown
    } finally {
      setStudentsLoading(false)
    }
  }

  const loadMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const parts = []
      if (filterMappingDevice) parts.push(`device=${filterMappingDevice}`)
      if (filterMappingActive !== '') parts.push(`is_active=${filterMappingActive}`)
      const data = await getBiometricUserMappings(parts.join('&'))
      setMappings(Array.isArray(data) ? data : (data?.results ?? []))
    } catch (err) {
      reportError(err?.message || 'Failed to load user mappings')
    } finally {
      setMappingsLoading(false)
    }
  }, [filterMappingDevice, filterMappingActive, reportError])

  useEffect(() => {
    if (tab === 'mappings') loadMappings()
  }, [tab, loadMappings])

  async function handleSaveMapping(e) {
    e.preventDefault()
    setMappingErrors({})
    setMappingFormError('')
    const errs = {}
    if (!mappingForm.device) errs.device = 'Please select a device'
    if (!mappingForm.device_user_id.trim()) errs.device_user_id = 'Device user ID is required'
    if (!mappingForm.student.trim()) errs.student = 'Student ID is required'
    if (Object.keys(errs).length) { setMappingErrors(errs); return }

    setIsSavingMapping(true)
    try {
      await createBiometricUserMapping({
        device: mappingForm.device,
        device_user_id: mappingForm.device_user_id.trim(),
        device_user_name: mappingForm.device_user_name.trim(),
        student: mappingForm.student.trim(),
      })
      reportSuccess('User mapping created successfully')
      setMappingModal(false)
      setMappingForm({ device: '', device_user_id: '', device_user_name: '', student: '' })
      loadMappings()
    } catch (err) {
      const fieldErrors = extractErrors(err)
      const nonField = extractNonFieldError(err)
      if (Object.keys(fieldErrors).length) { setMappingErrors(fieldErrors); return }
      setMappingFormError(nonField || err?.message || 'Failed to create mapping. This device user ID may already be mapped.')
    } finally {
      setIsSavingMapping(false)
    }
  }

  function openEditMapping(m) {
    setEditMapping(m)
    setEditMappingForm({ device_user_name: m.device_user_name || '', is_active: m.is_active !== false })
    setEditMappingErrors({})
    setEditMappingFormError('')
  }

  async function handleSaveEditMapping(e) {
    e.preventDefault()
    setEditMappingErrors({})
    setEditMappingFormError('')
    setIsSavingEditMapping(true)
    try {
      await updateBiometricUserMapping(editMapping.id, {
        device_user_name: editMappingForm.device_user_name.trim(),
        is_active: editMappingForm.is_active,
      })
      reportSuccess('Mapping updated successfully')
      setEditMapping(null)
      loadMappings()
    } catch (err) {
      const fieldErrors = extractErrors(err)
      const nonField = extractNonFieldError(err)
      if (Object.keys(fieldErrors).length) { setEditMappingErrors(fieldErrors); return }
      setEditMappingFormError(nonField || err?.message || 'Failed to update mapping. Please try again.')
    } finally {
      setIsSavingEditMapping(false)
    }
  }

  async function handleDeleteMapping() {
    if (!confirmDeleteMapping) return
    setIsDeletingMapping(true)
    try {
      await deleteBiometricUserMapping(confirmDeleteMapping.id)
      reportSuccess('Mapping removed successfully')
      setConfirmDeleteMapping(null)
      loadMappings()
    } catch (err) {
      reportError(err?.message || 'Failed to remove mapping. Please try again.')
    } finally {
      setIsDeletingMapping(false)
    }
  }

  // ── Push Monitor logic ────────────────────────────────────────────────────
  const loadPushRecords = useCallback(async () => {
    setPushLoading(true)
    try {
      const data = await getBiometricRecords('page_size=25&ordering=-scan_time')
      const list = Array.isArray(data) ? data : (data?.results ?? [])
      setPushRecords(list)
      setPushLastRefreshed(new Date())
    } catch (err) {
      reportError(err?.message || 'Failed to load push records')
    } finally {
      setPushLoading(false)
    }
  }, [reportError])

  useEffect(() => {
    if (tab !== 'push') return
    loadPushRecords()
    const interval = setInterval(loadPushRecords, 15000)
    return () => clearInterval(interval)
  }, [tab, loadPushRecords])

  async function copyPushUrl() {
    try {
      await navigator.clipboard.writeText(PUSH_ENDPOINT)
      setPushCopied(true)
      setTimeout(() => setPushCopied(false), 2000)
    } catch {
      reportError('Could not copy to clipboard')
    }
  }

  const inputCls = (hasErr) =>
    `w-full p-2 rounded-md text-black text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 ${hasErr ? 'border-rose-500' : 'border-neutral-200'}`

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-black">Biometric Devices</h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">Manage ZKTeco fingerprint devices and student mappings for biometric attendance.</p>
        </div>
        {tab === 'devices' && (
          <button onClick={openAdd} className="whitespace-nowrap bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition">
            Add Device
          </button>
        )}
        {tab === 'mappings' && (
          <button
            onClick={() => { setMappingForm({ device: '', device_user_id: '', device_user_name: '', student: '' }); setMappingErrors({}); setMappingFormError(''); loadStudents(); setMappingModal(true) }}
            className="whitespace-nowrap bg-indigo-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md hover:bg-indigo-700 transition"
          >
            Add Mapping
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {[{ key: 'devices', label: 'Devices' }, { key: 'mappings', label: 'User Mappings' }, { key: 'push', label: 'Push Monitor' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DEVICES TAB ── */}
      {tab === 'devices' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              placeholder="Search name, IP, serial..."
              value={search}
              onChange={e => { setSearch(sanitizeInput(e.target.value)); }}
              className="w-48 p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <select
              value={filterActive}
              onChange={e => setFilterActive(e.target.value)}
              className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Active &amp; Inactive</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left bg-neutral-50">
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Device</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">IP / Port</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Sync</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Last Synced</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Records</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devicesLoading ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</td></tr>
                ) : devices.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-400">No biometric devices found</td></tr>
                ) : devices.map(device => (
                  <tr key={device.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      <div className="font-medium text-black">{device.name}</div>
                      {device.location_description && <div className="text-xs text-neutral-400 mt-0.5">{device.location_description}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500 font-mono">{device.ip_address}:{device.port}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{device.device_type}</td>
                    <td className="px-4 py-3">{statusBadge(device.status)}</td>
                    <td className="px-4 py-3">{syncStatusBadge(device)}</td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{device.total_synced_records ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => handleAction(device.id, 'sync_now')} disabled={isActing(device.id, 'sync_now')} className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 disabled:opacity-50 transition">
                          {isActing(device.id, 'sync_now') ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button onClick={() => handleAction(device.id, 'trigger_sync')} disabled={isActing(device.id, 'trigger_sync')} className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs hover:bg-blue-100 disabled:opacity-50 transition">
                          {isActing(device.id, 'trigger_sync') ? '...' : 'Queue Sync'}
                        </button>
                        <button onClick={() => handleAction(device.id, 'auto_map')} disabled={isActing(device.id, 'auto_map')} className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100 disabled:opacity-50 transition">
                          {isActing(device.id, 'auto_map') ? '...' : 'Auto-Map'}
                        </button>
                        <button onClick={() => handleAction(device.id, 'sync_clock')} disabled={isActing(device.id, 'sync_clock')} className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-xs hover:bg-amber-100 disabled:opacity-50 transition">
                          {isActing(device.id, 'sync_clock') ? '...' : 'Sync Clock'}
                        </button>
                        <button onClick={() => handleViewDeviceUsers(device)} className="px-2 py-1 rounded-md bg-violet-50 text-violet-700 text-xs hover:bg-violet-100 transition">Users</button>
                        <button onClick={() => openEdit(device)} className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs hover:bg-neutral-200 transition">Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {devicesLoading ? (
              <div className="text-sm text-neutral-500">Loading...</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-neutral-400">No biometric devices found</div>
            ) : devices.map(device => (
              <div key={device.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-medium text-sm text-black">{device.name}</div>
                    {device.location_description && <div className="text-xs text-neutral-400 mt-0.5">{device.location_description}</div>}
                    <div className="text-xs text-neutral-500 mt-1 font-mono">{device.ip_address}:{device.port}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {statusBadge(device.status)}
                    {syncStatusBadge(device)}
                  </div>
                </div>
                <div className="text-xs text-neutral-400 mb-3">{device.total_synced_records ?? 0} records &bull; Last: {device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : 'never'}</div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => handleAction(device.id, 'sync_now')} disabled={isActing(device.id, 'sync_now')} className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 disabled:opacity-50 transition">
                    {isActing(device.id, 'sync_now') ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button onClick={() => handleAction(device.id, 'trigger_sync')} disabled={isActing(device.id, 'trigger_sync')} className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs hover:bg-blue-100 disabled:opacity-50 transition">
                    {isActing(device.id, 'trigger_sync') ? '...' : 'Queue Sync'}
                  </button>
                  <button onClick={() => handleAction(device.id, 'auto_map')} disabled={isActing(device.id, 'auto_map')} className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100 disabled:opacity-50 transition">
                    {isActing(device.id, 'auto_map') ? '...' : 'Auto-Map'}
                  </button>
                  <button onClick={() => handleAction(device.id, 'sync_clock')} disabled={isActing(device.id, 'sync_clock')} className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-xs hover:bg-amber-100 disabled:opacity-50 transition">
                    {isActing(device.id, 'sync_clock') ? '...' : 'Sync Clock'}
                  </button>
                  <button onClick={() => handleViewDeviceUsers(device)} className="px-2 py-1 rounded-md bg-violet-50 text-violet-700 text-xs hover:bg-violet-100 transition">Users</button>
                  <button onClick={() => openEdit(device)} className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs hover:bg-neutral-200 transition">Edit</button>
                  <button onClick={() => setConfirmDelete(device)} className="px-2 py-1 rounded-md bg-red-50 text-red-600 text-xs hover:bg-red-100 transition">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── MAPPINGS TAB ── */}
      {tab === 'mappings' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={filterMappingDevice}
              onChange={e => setFilterMappingDevice(e.target.value)}
              className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All Devices</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select
              value={filterMappingActive}
              onChange={e => setFilterMappingActive(e.target.value)}
              className="p-2 text-sm text-black rounded-md border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All Mappings</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Map device user IDs to students. Use <strong>Auto-Map</strong> on a device to link by service number, or add manually.</p>

          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left bg-neutral-50">
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Device</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Device User ID</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Device Name</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Student</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Svc No.</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Active</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Mapped At</th>
                  <th className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappingsLoading ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</td></tr>
                ) : mappings.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-400">No user mappings found</td></tr>
                ) : mappings.map(m => (
                  <tr key={m.id} className="border-t last:border-b hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-500">{devices.find(d => d.id === m.device)?.name || m.device}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 font-mono">{m.device_user_id}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{m.device_user_name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-black">{m.student_name || m.student}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{m.student_svc || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-500'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{m.mapped_at ? new Date(m.mapped_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEditMapping(m)} className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition">Edit</button>
                        <button onClick={() => setConfirmDeleteMapping(m)} className="px-2 py-1 rounded-md bg-red-600 text-white text-xs hover:bg-red-700 transition">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {mappingsLoading ? (
              <div className="text-sm text-neutral-500">Loading...</div>
            ) : mappings.length === 0 ? (
              <div className="text-sm text-neutral-400">No user mappings found</div>
            ) : mappings.map(m => (
              <div key={m.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm text-black">{m.student_name || m.student}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{m.student_svc || ''}</div>
                    <div className="text-xs text-neutral-400 mt-1">Device ID: <span className="font-mono">{m.device_user_id}</span></div>
                    <div className="text-xs text-neutral-400">{devices.find(d => d.id === m.device)?.name || ''}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${m.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => openEditMapping(m)} className="px-2 py-1 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition">Edit</button>
                      <button onClick={() => setConfirmDeleteMapping(m)} className="px-2 py-1 rounded-md bg-red-600 text-white text-xs hover:bg-red-700 transition">Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── PUSH MONITOR TAB ── */}
      {tab === 'push' && (
        <>
          {/* Push Endpoint URL */}
          <div className="mb-4 bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-4 mb-1">
              <div>
                <div className="text-sm font-medium text-black">Push Endpoint URL</div>
                <p className="text-xs text-neutral-500 mt-0.5">Configure this URL in your ZKTeco device's Server URL / ADMS setting.</p>
              </div>
              <button
                onClick={copyPushUrl}
                className="whitespace-nowrap px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition"
              >
                {pushCopied ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
            <div className="mt-2 font-mono text-xs bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2 text-neutral-700 break-all select-all">
              {PUSH_ENDPOINT}
            </div>
          </div>

          {/* Per-device push status */}
          <div className="mb-4">
            <div className="text-sm font-medium text-neutral-700 mb-2">Device Push Status</div>
            {devices.length === 0 ? (
              <div className="text-sm text-neutral-400">No devices registered. Add a device first.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {devices.map(device => {
                  const delta = device.last_sync_at
                    ? (Date.now() - new Date(device.last_sync_at).getTime()) / 1000
                    : Infinity
                  const isPushStatus = device.last_sync_status === 'push_active' || device.last_sync_status === 'push_received'
                  let badge, badgeCls
                  if (!device.last_sync_at) { badge = 'Never pushed'; badgeCls = 'bg-neutral-100 text-neutral-500' }
                  else if (delta < 120) { badge = isPushStatus ? 'Pushing' : 'Online'; badgeCls = 'bg-green-100 text-green-700' }
                  else if (delta < 600) { badge = 'Delayed'; badgeCls = 'bg-yellow-100 text-yellow-700' }
                  else { badge = 'Offline'; badgeCls = 'bg-red-100 text-red-600' }
                  return (
                    <div key={device.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-medium text-sm text-black truncate">{device.name}</div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${badgeCls}`}>{badge}</span>
                      </div>
                      <div className="text-xs text-neutral-400 font-mono mb-1">{device.ip_address}</div>
                      <div className="text-xs text-neutral-500">Last push: {device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : '—'}</div>
                      <div className="text-xs text-neutral-500">Push mode: <span className="font-mono">{device.last_sync_status || '—'}</span></div>
                      <div className="text-xs text-neutral-500">Last batch: {device.last_sync_records ?? 0} &bull; Total: {device.total_synced_records ?? 0}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Live records feed */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-neutral-700">
                Recent Push Records
                {pushLastRefreshed && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    Updated {pushLastRefreshed.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                onClick={loadPushRecords}
                disabled={pushLoading}
                className="px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 transition"
              >
                {pushLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="text-left bg-neutral-50">
                    <th className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">Student</th>
                    <th className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">Device</th>
                    <th className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">Biometric ID</th>
                    <th className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">Scan Time</th>
                    <th className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">Verify</th>
                    <th className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pushLoading && pushRecords.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">Loading...</td></tr>
                  ) : pushRecords.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-400">No push records received yet</td></tr>
                  ) : pushRecords.map(r => (
                    <tr key={r.id} className="border-t last:border-b hover:bg-neutral-50">
                      <td className="px-4 py-2 text-sm font-medium text-black">{r.student_name || r.student || '—'}</td>
                      <td className="px-4 py-2 text-sm text-neutral-500">{r.device_name || '—'}</td>
                      <td className="px-4 py-2 text-sm font-mono text-neutral-500">{r.biometric_id || '—'}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{r.scan_time ? new Date(r.scan_time).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{r.verification_type || '—'}</td>
                      <td className="px-4 py-2">
                        {r.processed
                          ? <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Processed</span>
                          : r.error_message
                            ? <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Error</span>
                            : <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pending</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-neutral-400 mt-1">Auto-refreshes every 15 seconds while this tab is open.</p>
          </div>

          {/* ZKTeco setup guide */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            <div className="text-sm font-medium text-black mb-3">ZKTeco Push Configuration Guide</div>
            <ol className="space-y-2 text-sm text-neutral-600 list-decimal list-inside">
              <li>On the device go to <strong>Menu &rarr; Comm. &rarr; Cloud Server Setting</strong> (may appear as <em>ADMS</em> or <em>Push Setting</em>).</li>
              <li>Enable <strong>ADMS</strong> / <strong>Cloud Server</strong>.</li>
              <li>Set <strong>Server Address</strong> to your server domain or IP (no path).</li>
              <li>Set <strong>Server Port</strong> to <code className="bg-neutral-100 px-1 rounded text-xs">80</code> (HTTP) or <code className="bg-neutral-100 px-1 rounded text-xs">443</code> (HTTPS).</li>
              <li>Set the <strong>URL</strong> / <strong>Server URL path</strong> field to <code className="bg-neutral-100 px-1 rounded text-xs">/api/biometric/push/</code>.</li>
              <li>Save and reboot. The device will begin pushing attendance logs automatically.</li>
            </ol>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
              The device's outgoing IP must match the <strong>IP Address</strong> field in the Devices tab, otherwise the server will reject the push.
            </div>
          </div>
        </>
      )}

      {/* ── ADD / EDIT DEVICE MODAL ── */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">{editDevice ? 'Edit Device' : 'Add Biometric Device'}</h4>
                  <p className="text-sm text-neutral-500">{editDevice ? 'Update device configuration' : 'Register a new ZKTeco or fingerprint device'}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setAddModalOpen(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              {deviceFormError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{deviceFormError}</div>
              )}

              <form onSubmit={handleSaveDevice}>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Device Name *</label>
                    <input className={inputCls(deviceErrors.name)} placeholder="e.g. Main Gate Scanner" value={deviceForm.name} maxLength={200} onChange={e => setDeviceForm(f => ({ ...f, name: sanitizeInput(e.target.value).slice(0, 200) }))} />
                    {deviceErrors.name && <div className="text-xs text-rose-600 mt-1">{deviceErrors.name}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">IP Address *</label>
                      <input className={inputCls(deviceErrors.ip_address)} placeholder="192.168.1.100" value={deviceForm.ip_address} onChange={e => setDeviceForm(f => ({ ...f, ip_address: sanitizeInput(e.target.value) }))} />
                      {deviceErrors.ip_address && <div className="text-xs text-rose-600 mt-1">{deviceErrors.ip_address}</div>}
                    </div>
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">Port *</label>
                      <input type="number" className={inputCls(deviceErrors.port)} value={deviceForm.port} onChange={e => setDeviceForm(f => ({ ...f, port: e.target.value }))} />
                      {deviceErrors.port && <div className="text-xs text-rose-600 mt-1">{deviceErrors.port}</div>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">Device Type</label>
                      <input className={inputCls(false)} placeholder="zkteco_f22" value={deviceForm.device_type} onChange={e => setDeviceForm(f => ({ ...f, device_type: sanitizeInput(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">Status</label>
                      <select className={inputCls(false)} value={deviceForm.status} onChange={e => setDeviceForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="device-is-active" checked={deviceForm.is_active} onChange={e => setDeviceForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-neutral-300" />
                    <label htmlFor="device-is-active" className="text-sm text-neutral-600 select-none cursor-pointer">Device is active (enabled for syncing)</label>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Location Description</label>
                    <input className={inputCls(false)} placeholder="e.g. Main entrance, Building A" value={deviceForm.location_description} maxLength={300} onChange={e => setDeviceForm(f => ({ ...f, location_description: sanitizeInput(e.target.value).slice(0, 300) }))} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">Sync Interval (s)</label>
                      <input type="number" className={inputCls(false)} value={deviceForm.sync_interval_seconds} onChange={e => setDeviceForm(f => ({ ...f, sync_interval_seconds: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">Time Offset (s)</label>
                      <input type="number" className={inputCls(false)} value={deviceForm.time_offset_seconds} onChange={e => setDeviceForm(f => ({ ...f, time_offset_seconds: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-600 mb-1 block">Timeout (s)</label>
                      <input type="number" className={inputCls(false)} value={deviceForm.connection_timeout} onChange={e => setDeviceForm(f => ({ ...f, connection_timeout: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-between gap-2 mt-4">
                  {editDevice ? (
                    <button type="button" onClick={() => { setAddModalOpen(false); setConfirmDelete(editDevice) }} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Delete</button>
                  ) : <div />}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {isSaving ? 'Saving...' : editDevice ? 'Save Changes' : 'Add Device'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE DEVICE CONFIRM ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                    <span className="text-red-600 text-lg font-bold">!</span>
                  </div>
                  <h4 className="text-lg font-medium text-black">Delete Device</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDelete(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Are you sure you want to delete <strong>{confirmDelete.name}</strong>? All associated user mappings will also be removed. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button onClick={handleDeleteDevice} disabled={isDeleting} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {isDeleting ? 'Deleting...' : 'Delete Device'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEVICE USERS MODAL ── */}
      {deviceUsersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeviceUsersModal(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/5 flex flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-4 p-4 sm:p-6 border-b border-neutral-100">
                <div>
                  <h4 className="text-lg text-black font-medium">Device Users</h4>
                  <p className="text-sm text-neutral-500">{deviceUsersModal.device.name} — users stored on device</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setDeviceUsersModal(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <div className="overflow-y-auto p-4 sm:p-6">
                {deviceUsersLoading ? (
                  <div className="text-sm text-neutral-500 text-center py-6">Loading device users...</div>
                ) : deviceUsersModal.users.length === 0 ? (
                  <div className="text-sm text-neutral-400 text-center py-6">No users found on this device</div>
                ) : (
                  <table className="w-full table-auto">
                    <thead>
                      <tr className="text-left bg-neutral-50">
                        <th className="px-3 py-2 text-sm text-neutral-600">User ID</th>
                        <th className="px-3 py-2 text-sm text-neutral-600">Name</th>
                        <th className="px-3 py-2 text-sm text-neutral-600">Privilege</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceUsersModal.users.map((u, i) => (
                        <tr key={i} className="border-t hover:bg-neutral-50">
                          <td className="px-3 py-2 text-sm font-mono text-neutral-700">{u.user_id}</td>
                          <td className="px-3 py-2 text-sm text-neutral-700">{u.name || '—'}</td>
                          <td className="px-3 py-2 text-sm text-neutral-500">{u.privilege ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD MAPPING MODAL ── */}
      {mappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMappingModal(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Add User Mapping</h4>
                  <p className="text-sm text-neutral-500">Link a device user ID to a student account</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setMappingModal(false)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              {mappingFormError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{mappingFormError}</div>
              )}

              <form onSubmit={handleSaveMapping}>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Device *</label>
                    <select value={mappingForm.device} onChange={e => setMappingForm(f => ({ ...f, device: e.target.value }))} className={inputCls(mappingErrors.device)}>
                      <option value="">Select device...</option>
                      {devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.ip_address})</option>)}
                    </select>
                    {mappingErrors.device && <div className="text-xs text-rose-600 mt-1">{mappingErrors.device}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Device User ID *</label>
                    <input className={inputCls(mappingErrors.device_user_id)} placeholder="User ID stored on device" value={mappingForm.device_user_id} onChange={e => setMappingForm(f => ({ ...f, device_user_id: sanitizeInput(e.target.value) }))} />
                    {mappingErrors.device_user_id && <div className="text-xs text-rose-600 mt-1">{mappingErrors.device_user_id}</div>}
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Device User Name</label>
                    <input className={inputCls(false)} placeholder="Name on device (optional)" value={mappingForm.device_user_name} onChange={e => setMappingForm(f => ({ ...f, device_user_name: sanitizeInput(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Student *</label>
                    <SearchableSelect
                      value={mappingForm.student}
                      onChange={val => setMappingForm(f => ({ ...f, student: val }))}
                      options={students.map(s => ({ id: s.id, label: [s.svc_number, s.rank, s.full_name || s.username].filter(Boolean).join(' ') }))}
                      placeholder={studentsLoading ? 'Loading students...' : '— Select student —'}
                      searchPlaceholder="Search by name or service number..."
                      error={!!mappingErrors.student}
                      disabled={studentsLoading}
                    />
                    {mappingErrors.student && <div className="text-xs text-rose-600 mt-1">{mappingErrors.student}</div>}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setMappingModal(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                  <button type="submit" disabled={isSavingMapping} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                    {isSavingMapping ? 'Saving...' : 'Create Mapping'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MAPPING MODAL ── */}
      {editMapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditMapping(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-4 sm:p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-lg text-black font-medium">Edit Mapping</h4>
                  <p className="text-sm text-neutral-500">{editMapping.student_name} — device ID {editMapping.device_user_id}</p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setEditMapping(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>

              {editMappingFormError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{editMappingFormError}</div>
              )}

              <form onSubmit={handleSaveEditMapping}>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-neutral-600 mb-1 block">Device User Name</label>
                    <input className={inputCls(editMappingErrors.device_user_name)} placeholder="Name on device" value={editMappingForm.device_user_name} onChange={e => setEditMappingForm(f => ({ ...f, device_user_name: sanitizeInput(e.target.value) }))} />
                    {editMappingErrors.device_user_name && <div className="text-xs text-rose-600 mt-1">{editMappingErrors.device_user_name}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="mapping-active" checked={editMappingForm.is_active} onChange={e => setEditMappingForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-neutral-300" />
                    <label htmlFor="mapping-active" className="text-sm text-neutral-600">Active</label>
                  </div>
                </div>
                <div className="flex justify-between gap-2 mt-4">
                  <button type="button" onClick={() => { setEditMapping(null); setConfirmDeleteMapping(editMapping) }} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition">Remove</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditMapping(null)} className="px-4 py-2 rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                    <button type="submit" disabled={isSavingEditMapping} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                      {isSavingEditMapping ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── REMOVE MAPPING CONFIRM ── */}
      {confirmDeleteMapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteMapping(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                    <span className="text-red-600 text-lg font-bold">!</span>
                  </div>
                  <h4 className="text-lg font-medium text-black">Remove Mapping</h4>
                </div>
                <button type="button" aria-label="Close" onClick={() => setConfirmDeleteMapping(null)} className="rounded-md p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition">✕</button>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Remove mapping for <strong>{confirmDeleteMapping.student_name || confirmDeleteMapping.student}</strong> (device ID: <span className="font-mono">{confirmDeleteMapping.device_user_id}</span>)? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDeleteMapping(null)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">Cancel</button>
                <button onClick={handleDeleteMapping} disabled={isDeletingMapping} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
                  {isDeletingMapping ? 'Removing...' : 'Remove Mapping'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
