// Rank hierarchy from senior (index 0) to junior (last).
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
  '2nd_lieutenant': 9,
  warrant_officer_i: 10,
  HCI: 11,
  warrant_officer_ii: 12,
  HCII: 13,
  senior_sergeant: 14,
  sergeant: 15,
  CI: 16,
  corporal: 17,
  CII: 18,
  lance_corporal: 19,
  CIII: 20,
  private: 21,
  civ: 22,
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
  '2nd lieutenant': '2nd_lieutenant',
  'warrant officer i': 'warrant_officer_i',
  'hci': 'HCI',
  'warrant officer ii': 'warrant_officer_ii',
  'hcii': 'HCII',
  'senior sergeant': 'senior_sergeant',
  'sergeant': 'sergeant',
  'ci': 'CI',
  'corporal': 'corporal',
  'cii': 'CII',
  'lance corporal': 'lance_corporal',
  'constable': 'CIII',
  'private': 'private',
  'civilian': 'civ',
}

// Internal value → display label with correct casing
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
  '2nd_lieutenant': '2nd Lieutenant',
  warrant_officer_i: 'Warrant Officer I',
  HCI: 'HCI',
  warrant_officer_ii: 'Warrant Officer II',
  HCII: 'HCII',
  senior_sergeant: 'Senior Sergeant',
  sergeant: 'Sergeant',
  CI: 'CI',
  corporal: 'Corporal',
  CII: 'CII',
  lance_corporal: 'Lance Corporal',
  CIII: 'Constable',
  private: 'Private',
  civ: 'Civilian',
}

// Shared RANK_OPTIONS array (senior → junior) — import this instead of duplicating per-file
export const RANK_OPTIONS = Object.entries(VALUE_TO_LABEL).map(([value, label]) => ({ value, label }))

// Normalize any rank string (internal value or display label) to its internal value.
// Checks exact case first to handle uppercase values like CIII, HCI, HCII, CI, CII.
export function normalizeRank(raw) {
  if (!raw) return ''
  const trimmed = String(raw).trim()
  // Try exact match first (handles mixed-case values like CIII, HCI)
  if (VALUE_TO_LABEL[trimmed] !== undefined) return trimmed
  const key = trimmed.toLowerCase()
  if (VALUE_TO_LABEL[key] !== undefined) return key
  const fromLabel = LABEL_TO_VALUE[key]
  return fromLabel || ''
}

export function getRankLabel(rankValue) {
  if (!rankValue) return ''
  const trimmed = String(rankValue).trim()
  // Try exact match first (handles CIII, HCI, etc.)
  if (VALUE_TO_LABEL[trimmed]) return VALUE_TO_LABEL[trimmed]
  const key = trimmed.toLowerCase()
  if (VALUE_TO_LABEL[key]) return VALUE_TO_LABEL[key]
  const internal = LABEL_TO_VALUE[key]
  if (internal) return VALUE_TO_LABEL[internal] || rankValue
  return rankValue
}

export function getRankSortIndex(rank) {
  if (!rank) return 999
  const trimmed = String(rank).trim()
  // Try exact match first (handles CIII, HCI, etc.)
  if (RANK_ORDER[trimmed] !== undefined) return RANK_ORDER[trimmed]
  const key = trimmed.toLowerCase()
  if (RANK_ORDER[key] !== undefined) return RANK_ORDER[key]
  const normalized = LABEL_TO_VALUE[key]
  if (normalized !== undefined) return RANK_ORDER[normalized] ?? 999
  return 999
}

export function sortByRankSeniorFirst(list, rankKey = 'rank') {
  return [...list].sort((a, b) => getRankSortIndex(a[rankKey]) - getRankSortIndex(b[rankKey]))
}
