// Roles that use the Chief of Training dashboard. Must match
// User.COT_DASHBOARD_ROLES on the backend, which enforces the real access.
export const COT_DASHBOARD_ROLES = [
  'chief_of_training',
  'comd_ka',
  'dac',
  'cop',
  'col_trg',
  'col_pers',
  'soi_hrm',
  'soi_trg',
  'soii_cp_cses',
  'soii_trg',
]

// Offices that can be assigned on the COT Officers page. Values, labels and
// minimum ranks must match User.ROLE_CHOICES and User.MIN_RANK_BY_ROLE.
export const HQ_OFFICES = [
  { value: 'chief_of_training', label: 'COT (Chief of Training)', minRank: 'major' },
  { value: 'comd_ka', label: 'Comd KA', minRank: 'major' },
  { value: 'dac', label: 'DAC', minRank: 'major' },
  { value: 'cop', label: 'COP', minRank: 'major' },
  { value: 'col_trg', label: 'Col Trg', minRank: 'major' },
  { value: 'col_pers', label: 'Col Pers', minRank: 'major' },
  { value: 'soi_hrm', label: 'SOI HRM', minRank: 'captain' },
  { value: 'soi_trg', label: 'SOI Trg', minRank: 'captain' },
  { value: 'soii_cp_cses', label: 'SOII Cp & Cses', minRank: 'captain' },
  { value: 'soii_trg', label: 'SOII Trg', minRank: 'captain' },
]

export function isCotDashboardRole(role) {
  return COT_DASHBOARD_ROLES.includes(role)
}
