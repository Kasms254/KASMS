import { QRCodeSVG } from 'qrcode.react'

export default function QRCodeDisplay({ value, size = 200, className = '', sessionId, token }) {
  // If both sessionId and token are provided, encode them as JSON
  const payload = (sessionId && token)
    ? JSON.stringify({ session_id: sessionId, qr_token: token })
    : value

  if (!payload) return null

  return (
    <div className={className}>
      <QRCodeSVG
        value={payload}
        size={size}
        level="M"
        includeMargin={true}
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  )
}
