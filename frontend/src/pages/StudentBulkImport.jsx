import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../lib/api'
import useToast from '../hooks/useToast'

function triggerCsvDownload(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function flattenRowErrors(row) {
  return Object.entries(row.errors || {})
    .map(([field, messages]) => `${field}: ${(Array.isArray(messages) ? messages : [messages]).join('; ')}`)
    .join(' | ')
}

export default function StudentBulkImport() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileInputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null) // { import_id, total_rows, valid_count, invalid_count, rows }
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState(null) // { created_count, skipped_count, failed_count, created, skipped, failed }
  const [error, setError] = useState(null)

  const reportError = (msg) => {
    if (!msg) return
    try {
      if (toast?.error) return toast.error(msg)
      if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
    } catch {
      // ignore toast errors
    }
  }

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDownloadTemplate() {
    try {
      const csvText = await api.downloadStudentImportTemplate()
      const blob = new Blob([csvText], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'student_import_template.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      reportError(err.message || 'Failed to download template')
    }
  }

  async function handlePreview() {
    if (!file) {
      setError('Choose a CSV file first.')
      return
    }
    setError(null)
    setResult(null)
    setPreviewing(true)
    try {
      const data = await api.previewStudentImport(file)
      setPreview(data)
    } catch (err) {
      setError(err.message || 'Failed to preview import')
      reportError(err.message || 'Failed to preview import')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleConfirm() {
    if (!preview?.import_id) return
    setConfirming(true)
    setError(null)
    try {
      const data = await api.confirmStudentImport(preview.import_id)
      setResult(data)
      toast?.showToast?.(`Created ${data.created_count} student(s)`, { type: 'success' })
    } catch (err) {
      setError(err.message || 'Failed to confirm import')
      reportError(err.message || 'Failed to confirm import')
    } finally {
      setConfirming(false)
    }
  }

  function handleDownloadInvalidReport() {
    const invalidRows = (preview?.rows || []).filter((r) => !r.is_valid)
    const csvRows = invalidRows.map((r) => ({
      line_number: r.line_number,
      ...r.input,
      errors: flattenRowErrors(r),
    }))
    triggerCsvDownload(csvRows, 'import_errors.csv')
  }

  function handleDownloadFailedReport() {
    const csvRows = (result?.failed || []).map((r) => ({
      line_number: r.line_number,
      ...r.input,
      errors: flattenRowErrors(r),
    }))
    triggerCsvDownload(csvRows, 'import_failed.csv')
  }

  function handleDownloadCredentials() {
    const csvRows = (result?.created || []).map((r) => ({
      svc_number: r.svc_number,
      username: r.username,
      full_name: r.full_name,
      class_name: r.class_name,
      password: r.password,
    }))
    triggerCsvDownload(csvRows, 'student_credentials.csv')
  }

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="w-full h-full">
        <div className="bg-white min-h-screen p-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">Bulk import students</h1>
              <p className="text-gray-500 mt-2">
                Upload a CSV to register multiple students at once. Every row goes through the
                same validation and business rules as adding a student manually.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition"
            >
              Back to dashboard
            </button>
          </div>

          {!result && (
            <div className="space-y-6">
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="text-sm text-gray-600">
                  Not sure of the format? Download the template with the required columns.
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 rounded-md bg-gray-700 text-white text-sm hover:bg-gray-800 transition whitespace-nowrap"
                >
                  Download CSV template
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="flex-1 border border-neutral-200 rounded-md px-3 py-2 text-sm text-black"
                />
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!file || previewing}
                  className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {previewing ? 'Validating…' : 'Preview import'}
                </button>
              </div>

              {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded p-2">{error}</div>}

              {preview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-gray-800">{preview.total_rows}</div>
                      <div className="text-xs text-gray-500 mt-1">Rows found</div>
                    </div>
                    <div className="border border-green-200 bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-green-700">{preview.valid_count}</div>
                      <div className="text-xs text-green-700 mt-1">Valid</div>
                    </div>
                    <div className="border border-rose-200 bg-rose-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-semibold text-rose-700">{preview.invalid_count}</div>
                      <div className="text-xs text-rose-700 mt-1">Errors</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Row-by-row preview</h3>
                    {preview.invalid_count > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadInvalidReport}
                        className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Download error report
                      </button>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Row</th>
                          <th className="px-3 py-2 text-left">Svc No.</th>
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Class</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r) => (
                          <tr key={r.line_number} className={r.is_valid ? '' : 'bg-rose-50'}>
                            <td className="px-3 py-2 text-gray-600">{r.line_number}</td>
                            <td className="px-3 py-2 text-gray-800">{r.input?.svc_number}</td>
                            <td className="px-3 py-2 text-gray-800">
                              {r.input?.first_name} {r.input?.last_name}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{r.input?.class_name}</td>
                            <td className="px-3 py-2">
                              {r.is_valid ? (
                                <span className="text-green-700 font-medium">Valid</span>
                              ) : (
                                <span className="text-rose-700 font-medium">Invalid</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-rose-600 text-xs">{flattenRowErrors(r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={reset} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">
                      Start over
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={preview.valid_count === 0 || confirming}
                      className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {confirming ? 'Importing…' : `Confirm import (${preview.valid_count} student${preview.valid_count === 1 ? '' : 's'})`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="border border-green-200 bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-semibold text-green-700">{result.created_count}</div>
                  <div className="text-xs text-green-700 mt-1">Created</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-semibold text-gray-700">{result.skipped_count}</div>
                  <div className="text-xs text-gray-500 mt-1">Skipped (already invalid)</div>
                </div>
                <div className="border border-rose-200 bg-rose-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-semibold text-rose-700">{result.failed_count}</div>
                  <div className="text-xs text-rose-700 mt-1">Failed</div>
                </div>
              </div>

              {result.created_count > 0 && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div className="text-sm text-gray-600">
                    Each new student got a random password. Download it now — it is only shown once.
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadCredentials}
                    className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 transition whitespace-nowrap"
                  >
                    Download credentials CSV
                  </button>
                </div>
              )}

              {result.failed_count > 0 && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">Failed rows</h3>
                  <button
                    type="button"
                    onClick={handleDownloadFailedReport}
                    className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Download failed rows CSV
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={reset} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">
                  Import another file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
