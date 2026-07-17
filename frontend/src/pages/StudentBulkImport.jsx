import React, { useState, useRef } from 'react'
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
    <div className="w-full px-3 sm:px-4 md:px-6">
      <header className="mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-black">Bulk import students</h2>
        <p className="text-xs sm:text-sm text-neutral-500">
          Upload a CSV to register multiple students at once. Every row goes through the same
          validation and business rules as adding a student manually.
        </p>
      </header>

      <section className="grid gap-4 sm:gap-6">
        {!result && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="text-sm text-neutral-600">
                Not sure of the format? Download the template with the required columns.
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 transition whitespace-nowrap"
              >
                Download CSV template
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
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

            {error && (
              <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">{error}</div>
            )}

            {preview && (
              <div className="grid gap-4 sm:gap-6">
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-3 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-semibold text-black">{preview.total_rows}</div>
                    <div className="text-[11px] sm:text-xs text-neutral-500 mt-1">Rows found</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-3 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-semibold text-green-700">{preview.valid_count}</div>
                    <div className="text-[11px] sm:text-xs text-green-700 mt-1">Valid</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-3 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-semibold text-red-700">{preview.invalid_count}</div>
                    <div className="text-[11px] sm:text-xs text-red-700 mt-1">Errors</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-neutral-700">Row-by-row preview</h3>
                  {preview.invalid_count > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadInvalidReport}
                      className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap"
                    >
                      Download error report
                    </button>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  {/* Mobile Card View */}
                  <div className="lg:hidden p-4 space-y-3 max-h-96 overflow-y-auto">
                    {preview.rows.map((r) => (
                      <div
                        key={r.line_number}
                        className={`rounded-lg p-3 border ${r.is_valid ? 'bg-neutral-50 border-neutral-200' : 'bg-rose-50 border-rose-100'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-black truncate">
                              {r.input?.first_name} {r.input?.last_name}
                            </div>
                            <div className="text-xs text-neutral-600">{r.input?.svc_number || '-'}</div>
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded-full flex-shrink-0 font-medium ${r.is_valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {r.is_valid ? 'Valid' : 'Invalid'}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="text-neutral-500">Row</span>
                            <span className="text-black">{r.line_number}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-neutral-500 flex-shrink-0">Class</span>
                            <span className="text-black truncate">{r.input?.class_name || '-'}</span>
                          </div>
                        </div>
                        {!r.is_valid && (
                          <div className="text-xs text-rose-600 mt-2 pt-2 border-t border-rose-100">{flattenRowErrors(r)}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-neutral-50 sticky top-0">
                        <tr className="text-left">
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Row</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Svc No.</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Class</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 bg-white">
                        {preview.rows.map((r) => (
                          <tr key={r.line_number} className={r.is_valid ? 'hover:bg-neutral-50 transition' : 'bg-rose-50 hover:bg-rose-100/60 transition'}>
                            <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{r.line_number}</td>
                            <td className="px-4 py-3 text-black whitespace-nowrap">{r.input?.svc_number}</td>
                            <td className="px-4 py-3 text-black whitespace-nowrap">
                              {r.input?.first_name} {r.input?.last_name}
                            </td>
                            <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{r.input?.class_name}</td>
                            <td className="px-4 py-3">
                              {r.is_valid ? (
                                <span className="inline-flex text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">Valid</span>
                              ) : (
                                <span className="inline-flex text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Invalid</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-rose-600 text-xs">{flattenRowErrors(r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                  <button type="button" onClick={reset} className="w-full sm:w-auto px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 transition">
                    Start over
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={preview.valid_count === 0 || confirming}
                    className="w-full sm:w-auto px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {confirming ? 'Importing…' : `Confirm import (${preview.valid_count} student${preview.valid_count === 1 ? '' : 's'})`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {result && (
          <>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-3 sm:p-4 text-center">
                <div className="text-lg sm:text-2xl font-semibold text-green-700">{result.created_count}</div>
                <div className="text-[11px] sm:text-xs text-green-700 mt-1">Created</div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-3 sm:p-4 text-center">
                <div className="text-lg sm:text-2xl font-semibold text-black">{result.skipped_count}</div>
                <div className="text-[11px] sm:text-xs text-neutral-500 mt-1">Skipped</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-3 sm:p-4 text-center">
                <div className="text-lg sm:text-2xl font-semibold text-red-700">{result.failed_count}</div>
                <div className="text-[11px] sm:text-xs text-red-700 mt-1">Failed</div>
              </div>
            </div>

            {result.created_count > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="text-sm text-neutral-600">
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-neutral-700">Failed rows</h3>
                <button
                  type="button"
                  onClick={handleDownloadFailedReport}
                  className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap"
                >
                  Download failed rows CSV
                </button>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button type="button" onClick={reset} className="w-full sm:w-auto px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">
                Import another file
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
