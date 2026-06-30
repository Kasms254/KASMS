const RANK_ABBR = {
  'General': 'Gen',
  'Lieutenant General': 'Lt Gen',
  'Major General': 'Maj Gen',
  'Brigadier': 'Brig',
  'Colonel': 'Col',
  'Lieutenant Colonel': 'Lt Col',
  'Major': 'Maj',
  'Captain': 'Capt',
  'Lieutenant': 'Lt',
  'Warrant Officer I': 'WO1',
  'Warrant Officer Ii': 'WO2',
  'Warrant Officer II': 'WO2',
  'Senior Sergeant': 'SSgt',
  'Sergeant': 'Sgt',
  'Corporal': 'Cpl',
  'Lance Corporal': 'L/Cpl',
  'Private': 'Spte',
  'Head Constable I': 'HC1',
  'Head Constable Ii': 'HC2',
  'Head Constable II': 'HC2',
  'Constable I': 'Cst1',
  'Constable Ii': 'Cst2',
  'Constable II': 'Cst2',
  'Constable Iii': 'Cst3',
  'Constable III': 'Cst3',
  'Civilian': 'Civ',
}

export function shortRank(rank) {
  if (!rank) return ''
  return RANK_ABBR[rank] || RANK_ABBR[rank.trim()] || rank
}
