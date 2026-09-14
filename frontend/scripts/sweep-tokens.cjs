/* Rewrites hardcoded Tailwind color utilities to the semantic token set.
 * Reads the mapping produced by gen-tokens.cjs. Idempotent.
 *   node scripts/sweep-tokens.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
// Written by gen-tokens.cjs — run that first.
const MAP = require('./token-map.json');
const DRY = process.argv.includes('--dry');

// Literal colors where a `/opacity` suffix means a deliberate translucent
// overlay on an already-coloured surface (sidebar sheens, modal scrims).
// Those must survive untouched, so only the bare class may match.
const NO_SLASH = new Set(['bg-white', 'bg-black', 'text-black', 'to-white', 'via-white', 'from-white', 'border-white']);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Longest first so no key is ever a prefix of another at match time.
const rules = Object.keys(MAP)
  .sort((a, b) => b.length - a.length)
  .map((from) => ({
    from,
    to: MAP[from],
    // Not preceded by a class char; not followed by one. `/` is excluded from
    // the trailing set for NO_SLASH keys so bg-white/10 is left alone.
    re: new RegExp(`(?<![\\w-])${esc(from)}(?![\\w-${NO_SLASH.has(from) ? '/' : ''}])`, 'g'),
  }));

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(SRC);

let totalHits = 0;
let touched = 0;
const perClass = {};

for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  let after = before;
  let hits = 0;
  for (const r of rules) {
    after = after.replace(r.re, () => { hits++; perClass[r.from] = (perClass[r.from] || 0) + 1; return r.to; });
  }
  if (hits) {
    totalHits += hits;
    touched++;
    if (!DRY) fs.writeFileSync(f, after);
  }
}

console.log(`${DRY ? '[dry] ' : ''}${totalHits} rewrites across ${touched}/${files.length} files`);
const unused = Object.keys(MAP).filter((k) => !perClass[k]);
if (unused.length) console.log(`${unused.length} mapped classes had no occurrences (already swept, or literal-only)`);
