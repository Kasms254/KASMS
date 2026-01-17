import { QRCodeSVG } from 'qrcode.react'

export default function QRCodeDisplay({ value, size = 200, className = '' }) {
  if (!value) return null

  return (
    <div className={className}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin={true}
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  )
}
