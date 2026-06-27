import { useState, useEffect, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import * as api from '../lib/api'

// Shared verification form — used by both the standalone /verify page
// (deep-linkable, e.g. from a printed code) and embedded inline on the
// Login page. Rate limiting / IP lockout against brute-force or DoS is
// enforced server-side (see core/secure_certificate_verification.py):
// 10 req/min and 50 req/hour per IP via throttle classes, plus an IP
// lockout (30 min) after 20 failed attempts within a 15-minute window.
export default function CertificateVerificationForm({ initialCode = '' }) {
  const [code, setCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const runVerification = useCallback(async (verificationCode) => {
    const trimmed = (verificationCode || '').trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.verifyCertificate(trimmed)
      setResult(data)
    } catch (err) {
      setError(err?.message || 'Unable to verify this certificate right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialCode) runVerification(initialCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Verification codes are exactly 32 hex characters (see
  // VALID_CODE_CHARS/VERIFICATION_CODE_LENGTH in
  // core/secure_certificate_verification.py) — filter live so obviously
  // invalid input never even round-trips to the server.
  function handleCodeChange(e) {
    const filtered = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 32)
    setCode(filtered)
  }

  function handleSubmit(e) {
    e.preventDefault()
    runVerification(code)
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <label className="text-sm text-gray-600 mb-1 block">Verification code</label>
        <input
          type="text"
          autoFocus
          value={code}
          onChange={handleCodeChange}
          placeholder="e.g. 0A77C7ACBB639989BAFA5C2AF14FD6A0"
          className="w-full p-3 rounded-lg text-black text-sm font-mono border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-200 tracking-wide"
          maxLength={32}
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-900 text-white text-sm font-medium hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? <LucideIcons.Loader2 className="w-4 h-4 animate-spin" /> : <LucideIcons.ShieldCheck className="w-4 h-4" />}
          {loading ? 'Verifying...' : 'Verify Certificate'}
        </button>
      </form>

      {error && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-2">
          <LucideIcons.AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}

      {result && (
        <div className={`mt-5 rounded-lg border p-4 ${result.is_valid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className="flex items-start gap-2 mb-2">
            {result.is_valid ? (
              <LucideIcons.CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <LucideIcons.XCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm font-medium ${result.is_valid ? 'text-emerald-800' : 'text-rose-800'}`}>
              {result.is_valid ? 'This certificate is valid.' : (result.message || 'This certificate could not be verified.')}
            </p>
          </div>

          {result.is_valid && (
            <dl className="text-sm text-gray-700 space-y-1 mt-3 pl-7">
              {result.certificate_number && (
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Certificate No.</dt><dd className="font-medium">{result.certificate_number}</dd></div>
              )}
              {result.student_name && (
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Student</dt><dd className="font-medium">{result.student_name}</dd></div>
              )}
              {result.course_name && (
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Course</dt><dd className="font-medium">{result.course_name}</dd></div>
              )}
              {result.school_name && (
                <div className="flex justify-between gap-3"><dt className="text-gray-500">School</dt><dd className="font-medium">{result.school_name}</dd></div>
              )}
              {result.status_display && (
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Status</dt><dd className="font-medium">{result.status_display}</dd></div>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}
