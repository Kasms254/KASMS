/* Generates the dark-theme token system for KASMS.
 * Single source of truth: emits tokens.css, palette.cjs (tailwind colors) and map.json (code sweep).
 */
const fs = require('fs');
const path = require('path');
const colors = require('tailwindcss/colors');

const FRONTEND = '/home/aladeen/KASMS/frontend';
const SRC = path.join(FRONTEND, 'src');
const OUT_CSS = path.join(SRC, 'styles/tokens.css');
const OUT_PALETTE = path.join(SRC, 'styles/palette.cjs');
const OUT_MAP = path.join(__dirname, 'token-map.json');

const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
const ACCENTS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];

// Which role a utility prefix implies.
const ROLE = {
  bg: 'fill', from: 'fill', via: 'fill', to: 'fill', shadow: 'fill',
  text: 'mark', placeholder: 'mark', fill: 'mark', stroke: 'mark', caret: 'mark', decoration: 'mark', accent: 'mark',
  border: 'edge', divide: 'edge', ring: 'edge', outline: 'edge',
};

const hex2rgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
};

// ---------------------------------------------------------------- neutrals
// Light values track the current Tailwind shades closely; dark values are a
// tuned zinc-based ramp. `fg-*` inverts, `surface-*` deepens, `line-*` dims.
const NEUTRAL_TOKENS = {
  canvas: ['250 250 250', '9 9 11'],
  surface: ['255 255 255', '24 24 27'],
  'surface-2': ['245 245 245', '39 39 42'],
  'surface-3': ['229 229 229', '52 52 56'],
  'surface-4': ['212 212 212', '63 63 70'],
  'surface-5': ['163 163 163', '82 82 91'],
  inverse: ['38 38 38', '63 63 70'],
  fg: ['23 23 23', '244 244 245'],
  'fg-body': ['64 64 64', '228 228 231'],
  'fg-muted': ['82 82 82', '190 190 196'],
  'fg-soft': ['115 115 115', '161 161 170'],
  'fg-faint': ['163 163 163', '120 120 130'],
  hair: ['245 245 245', '34 34 38'],
  line: ['229 229 229', '47 47 52'],
  'line-strong': ['212 212 212', '68 68 75'],

  // Fallbacks only — themeContext overwrites these per school at runtime,
  // luminance-corrected for the active scheme. These values keep the app
  // rendering sanely before JS boots.
  brand: ['14 165 164', '45 212 191'],
  'brand-ink': ['13 148 136', '94 234 212'],
  'brand-soft': ['240 253 250', '19 78 74'],
  'brand-on': ['255 255 255', '24 24 27'],
};

// (prefix, shade) -> neutral token
const NEUTRAL_MAP = {
  bg: { 50: 'canvas', 100: 'surface-2', 200: 'surface-3', 300: 'surface-4', 400: 'surface-5', 500: 'inverse', 600: 'inverse', 700: 'inverse', 800: 'inverse', 900: 'inverse', 950: 'inverse' },
  from: { 50: 'canvas', 100: 'surface-2', 200: 'surface-3' },
  via: { 50: 'canvas', 100: 'surface-2', 200: 'surface-3' },
  to: { 50: 'canvas', 100: 'surface-2', 200: 'surface-3' },
  text: { 100: 'fg-faint', 200: 'fg-faint', 300: 'fg-faint', 400: 'fg-faint', 500: 'fg-soft', 600: 'fg-muted', 700: 'fg-body', 800: 'fg', 900: 'fg', 950: 'fg' },
  placeholder: { 300: 'fg-faint', 400: 'fg-faint', 500: 'fg-faint' },
  border: { 50: 'hair', 100: 'hair', 200: 'line', 300: 'line-strong', 400: 'line-strong', 500: 'line-strong', 600: 'line-strong', 700: 'line-strong', 800: 'line-strong', 900: 'line-strong' },
  divide: { 50: 'hair', 100: 'hair', 200: 'line', 300: 'line-strong' },
  ring: { 50: 'hair', 100: 'hair', 200: 'line', 300: 'line-strong', 400: 'line-strong', 500: 'line-strong' },
};

// ---------------------------------------------------------------- accents
// Dark counterpart shade per role. Backgrounds deepen, text lightens,
// borders dim — this is the fg/bg ambiguity resolved by utility prefix.
const DARK_SHADE = {
  fill: { 50: 950, 100: 900, 200: 800, 300: 800, 400: 500, 500: 500, 600: 600, 700: 700, 800: 700, 900: 800, 950: 900 },
  mark: { 50: 100, 100: 100, 200: 200, 300: 300, 400: 400, 500: 400, 600: 400, 700: 300, 800: 300, 900: 200, 950: 200 },
  edge: { 50: 900, 100: 900, 200: 800, 300: 700, 400: 700, 500: 500, 600: 600, 700: 700, 800: 800, 900: 900, 950: 950 },
};

// ------------------------------------------------------- scan actual usage
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(SRC);

const ALL_HUES = [...NEUTRALS, ...ACCENTS].join('|');
const PREFIXES = Object.keys(ROLE).join('|');
const SHADES = '50|100|200|300|400|500|600|700|800|900|950';

// Raw Tailwind colours still in the source (pre-sweep).
const RE_RAW = new RegExp(`(?<![\\w-])(${PREFIXES})-(${ALL_HUES})-(${SHADES})(?![\\w-])`, 'g');
// Already-swept tokens. Scanned too, so the generator stays idempotent: after
// the sweep the raw classes are gone, and without this every accent var would
// vanish on the next run and its utilities would resolve to an invalid colour.
const RE_TOK = new RegExp(`(?<![\\w-])(${PREFIXES})-(fill|mark|edge)-(${ALL_HUES})-(${SHADES})(?![\\w-])`, 'g');

const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = RE_RAW.exec(src))) used.add(`${m[1]}|${m[2]}|${m[3]}`);
  while ((m = RE_TOK.exec(src))) {
    // Re-derive a utility prefix whose ROLE matches the token's own role, so
    // the entry rebuilds identically whichever form it was found in.
    const role = m[2];
    const prefix = ROLE[m[1]] === role ? m[1] : Object.keys(ROLE).find((p) => ROLE[p] === role);
    used.add(`${prefix}|${m[3]}|${m[4]}`);
  }
}

// ------------------------------------------------------------ build output
const map = {};          // "bg-red-100" -> "bg-fill-red-100"
const vars = {};         // "--fill-red-100" -> [light, dark]
const palette = { fill: {}, mark: {}, edge: {} };

for (const key of used) {
  const [prefix, hue, shadeStr] = key.split('|');
  const shade = Number(shadeStr);
  const role = ROLE[prefix];
  if (!role) continue;

  if (NEUTRALS.includes(hue)) {
    const token = (NEUTRAL_MAP[prefix] || {})[shade];
    if (!token) { console.warn(`  ! unmapped neutral: ${prefix}-${hue}-${shade}`); continue; }
    map[`${prefix}-${hue}-${shade}`] = `${prefix}-${token}`;
  } else {
    const darkShade = DARK_SHADE[role][shade];
    vars[`--${role}-${hue}-${shade}`] = [hex2rgb(colors[hue][shade]), hex2rgb(colors[hue][darkShade])];
    (palette[role][hue] ||= {})[shade] = `rgb(var(--${role}-${hue}-${shade}) / <alpha-value>)`;
    map[`${prefix}-${hue}-${shade}`] = `${prefix}-${role}-${hue}-${shade}`;
  }
}

// The scan above only sees classes present today, and a swept neutral
// (bg-canvas) no longer records where it came from. So the rewrite map is
// emitted as the full cross-product instead: it stays correct for raw classes
// introduced later, independent of what the current source happens to contain.
// CSS variables stay usage-scoped — only observed classes get emitted there.
for (const prefix of Object.keys(ROLE)) {
  const role = ROLE[prefix];
  for (const hue of NEUTRALS) {
    for (const [shade, token] of Object.entries(NEUTRAL_MAP[prefix] || {})) {
      map[`${prefix}-${hue}-${shade}`] ||= `${prefix}-${token}`;
    }
  }
  for (const hue of ACCENTS) {
    for (const shade of Object.keys(DARK_SHADE[role])) {
      map[`${prefix}-${hue}-${shade}`] ||= `${prefix}-${role}-${hue}-${shade}`;
    }
  }
}

// Literal colors that need to flip (translucent overlays deliberately excluded).
Object.assign(map, {
  'bg-white': 'bg-surface',
  'text-black': 'text-fg',
  'bg-black': 'bg-inverse',
  'to-white': 'to-surface',
  'via-white': 'via-surface',
  'from-white': 'from-surface',
  // black/5 over white lands near #f2f2f2, so it maps to the faintest token.
  // --line (#e5e5e5) would read as a visibly heavier ring on every card.
  'ring-black/5': 'ring-hair',
  'ring-black/10': 'ring-line',
  'border-black/10': 'border-line',
});

// ------------------------------------------------------------------- emit
const cssVar = (name, val) => `  ${name}: ${val};`;
const neutralLines = (i) => Object.entries(NEUTRAL_TOKENS).map(([k, v]) => cssVar(`--${k}`, v[i])).join('\n');
const accentLines = (i) => Object.keys(vars).sort().map((k) => cssVar(k, vars[k][i])).join('\n');

const css = `/* GENERATED by scripts/gen-tokens.cjs — do not edit by hand.
 * Light values mirror the Tailwind shades the app already used, so light mode
 * is visually unchanged. Dark values are role-aware: backgrounds deepen,
 * text lightens, borders dim.
 */

:root {
  color-scheme: light;

  /* neutral / structural */
${neutralLines(0)}

  /* accent scales, split by role */
${accentLines(0)}
}

.dark {
  color-scheme: dark;

  /* neutral / structural */
${neutralLines(1)}

  /* accent scales, split by role */
${accentLines(1)}
}

/* Opt-out: pins a subtree to light tokens regardless of the app scheme.
 * Custom properties resolve from the nearest ancestor that sets them, so
 * declaring them here overrides .dark on <html> for this subtree only.
 * Used for certificate previews, printable output and QR codes. */
.scheme-light {
  color-scheme: light;
${neutralLines(0)}
${accentLines(0)}
}

/* Paper is always light, whatever the screen is doing. */
@media print {
  :root,
  .dark {
    color-scheme: light;
${neutralLines(0)}
${accentLines(0)}
  }
}
`;

const paletteFile = `/* GENERATED by scripts/gen-tokens.cjs — do not edit by hand. */
module.exports = ${JSON.stringify(palette, null, 2)};
`;

fs.mkdirSync(path.dirname(OUT_CSS), { recursive: true });
fs.writeFileSync(OUT_CSS, css);
fs.writeFileSync(OUT_PALETTE, paletteFile);
fs.writeFileSync(OUT_MAP, JSON.stringify(map, null, 2));

console.log(`tokens.css      ${css.split('\n').length} lines`);
console.log(`palette.cjs     ${Object.keys(vars).length} accent vars across ${new Set(Object.keys(vars).map(v => v.split('-')[3])).size} hues`);
console.log(`map.json        ${Object.keys(map).length} class rewrites`);
