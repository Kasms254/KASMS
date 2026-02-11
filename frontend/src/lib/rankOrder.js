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
