// Rank hierarchy from senior (index 0) to junior (index 15).
// Entries without a recognized rank sort to the bottom.
const RANK_ORDER = {
  general: 0,
  lieutenant_general: 1,
  major_general: 2,
  brigadier: 3,
  colonel: 4,
  lieutenant_colonel: 5,
  major: 6,
  captain: 7,
  lieutenant: 8,
  warrant_officer_i: 9,
  warrant_officer_ii: 10,
  senior_sergeant: 11,
  sergeant: 12,
  corporal: 13,
  lance_corporal: 14,
  private: 15,
}

// Display-label → internal-value lookup (case-insensitive)
const LABEL_TO_VALUE = {
  'general': 'general',
  'lieutenant general': 'lieutenant_general',
  'major general': 'major_general',
  'brigadier': 'brigadier',
  'colonel': 'colonel',
  'lieutenant colonel': 'lieutenant_colonel',
  'major': 'major',
  'captain': 'captain',
  'lieutenant': 'lieutenant',
  'warrant officer i': 'warrant_officer_i',
  'warrant officer ii': 'warrant_officer_ii',
  'senior sergeant': 'senior_sergeant',
  'sergeant': 'sergeant',
  'corporal': 'corporal',
  'lance corporal': 'lance_corporal',
  'private': 'private',
}

// Internal value → display label with correct casing (roman numerals preserved)
const VALUE_TO_LABEL = {
  general: 'General',
  lieutenant_general: 'Lieutenant General',
  major_general: 'Major General',
  brigadier: 'Brigadier',
  colonel: 'Colonel',
  lieutenant_colonel: 'Lieutenant Colonel',
  major: 'Major',
  captain: 'Captain',
  lieutenant: 'Lieutenant',
  warrant_officer_i: 'Warrant Officer I',
  warrant_officer_ii: 'Warrant Officer II',
  senior_sergeant: 'Senior Sergeant',
  sergeant: 'Sergeant',
  corporal: 'Corporal',
  lance_corporal: 'Lance Corporal',
  private: 'Private',
}

// Shared RANK_OPTIONS array (senior → junior) — import this instead of duplicating per-file
export const RANK_OPTIONS = Object.entries(VALUE_TO_LABEL).map(([value, label]) => ({ value, label }))

// Normalize any rank string (internal value or display label) to its internal value
export function normalizeRank(raw) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  if (VALUE_TO_LABEL[key]) return key // already an internal value
  const fromLabel = LABEL_TO_VALUE[key]
  return fromLabel || ''
}

export function getRankLabel(rankValue) {
  if (!rankValue) return ''
  const key = String(rankValue).toLowerCase().trim()
  // Try as internal value (e.g. warrant_officer_ii)
  if (VALUE_TO_LABEL[key]) return VALUE_TO_LABEL[key]
  // Try as display label with any casing (e.g. "Warrant Officer Ii", "warrant officer ii")
  const internal = LABEL_TO_VALUE[key]
  if (internal) return VALUE_TO_LABEL[internal] || rankValue
  return rankValue
}

export function getRankSortIndex(rank) {
  if (!rank) return 999
  const key = String(rank).toLowerCase().trim()
  // Try direct match first (internal value), then label match
  if (RANK_ORDER[key] !== undefined) return RANK_ORDER[key]
  const normalized = LABEL_TO_VALUE[key]
  if (normalized !== undefined) return RANK_ORDER[normalized]
  return 999
}

export function sortByRankSeniorFirst(list, rankKey = 'rank') {
  return [...list].sort((a, b) => getRankSortIndex(a[rankKey]) - getRankSortIndex(b[rankKey]))
}
