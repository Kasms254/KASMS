import { useParams } from 'react-router-dom'
import CertificateVerificationForm from '../components/CertificateVerificationForm'

export default function VerifyCertificate() {
  const { code: codeFromUrl } = useParams()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-6 lg:p-10 border border-gray-100">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-rose-800 p-0.5 mb-3 shadow-lg">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <img src="/ka.png" alt="Kenya Army logo" className="w-12 h-12 object-contain" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900">Verify a Certificate</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the verification code printed on the certificate to confirm it is genuine.
            </p>
          </div>

          <CertificateVerificationForm initialCode={codeFromUrl} />
        </div>
      </div>
    </div>
  )
}
