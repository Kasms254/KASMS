/* Colour maths for scheme-aware branding.
 *
 * Schools supply arbitrary brand hexes. A deep navy or maroon that reads well
 * on white is unreadable on a dark surface, so brand colours are corrected per
 * scheme rather than used raw. Contrast targets follow WCAG 2.1 relative
 * luminance.
 */

export const hexToRgb = (hex, fallback = [14, 165, 164]) => {
  if (typeof hex !== 'string') return fallback
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return fallback
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export const rgbToCss = ([r, g, b]) => `${r} ${g} ${b}`

export const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')

export function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6
  else if (max === G) h = ((B - R) / d + 2) / 6
  else h = ((R - G) / d + 4) / 6
  return [h, s, l]
}

export function hslToRgb([h, s, l]) {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ]
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance([r, g, b]) {
  const f = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Walks a colour's lightness until it clears `target` contrast against `bg`,
 * preserving hue and saturation. Direction is chosen from the background, so
 * the same call lightens on dark and darkens on light.
 */
export function forContrast(rgb, bg, target = 4.5) {
  if (contrastRatio(rgb, bg) >= target) return rgb
  const [h, s] = rgbToHsl(rgb)
  const towardsLight = relativeLuminance(bg) < 0.5
  let best = rgb
  // 1% lightness steps from the background side outwards; first pass wins.
  for (let i = 1; i <= 100; i++) {
    const l = towardsLight ? Math.min(1, i / 100) : Math.max(0, 1 - i / 100)
    const candidate = hslToRgb([h, s, l])
    best = candidate
    if (contrastRatio(candidate, bg) >= target) break
  }
  return best
}

/** Linear blend, t=0 → a, t=1 → b. */
export const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t))
