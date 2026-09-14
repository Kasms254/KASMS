import useColorScheme from './useColorScheme'

/*
 * Recharts takes colours as props, not classes, so the token layer in
 * styles/tokens.css cannot reach them. This resolves the same palette to
 * concrete values for the active scheme.
 *
 * Values track the CSS tokens: `grid`/`track` follow --line/--surface-2,
 * `axisTick` follows --fg-faint, `valueTick` follows --fg-body.
 */
const THEMES = {
  light: {
    grid: '#f3f4f6',
    axisTick: '#9ca3af',
    valueTick: '#374151',
    track: '#f9fafb',
    labelLine: '#d1d5db',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e5e5e5',
    tooltipText: '#171717',
  },
  dark: {
    grid: '#2a2a2f',
    axisTick: '#78788a',
    valueTick: '#e4e4e7',
    track: '#1f1f23',
    labelLine: '#3f3f46',
    tooltipBg: '#18181b',
    tooltipBorder: '#3f3f46',
    tooltipText: '#f4f4f5',
  },
}

// Categorical series. The dark set is lifted in lightness so each hue keeps
// roughly the same separation against a near-black plot area as the light set
// has against white.
const SERIES = {
  light: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#a855f7'],
  dark: ['#818cf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#2dd4bf', '#fb923c', '#a3e635', '#22d3ee', '#c084fc'],
}

// Pass/warn/fail ramp used by the COT analytics scorecards.
const STATUS = {
  light: { good: '#059669', warn: '#d97706', bad: '#dc2626', none: '#9ca3af' },
  dark: { good: '#34d399', warn: '#fbbf24', bad: '#f87171', none: '#78788a' },
}

export default function useChartTheme() {
  const { resolved } = useColorScheme()
  const scheme = THEMES[resolved] ? resolved : 'light'
  return { ...THEMES[scheme], series: SERIES[scheme], status: STATUS[scheme], scheme }
}
