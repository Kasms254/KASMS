// Letter grades for percentages: the same scale and boundary rule as the
// backend (core.services.grade_for_percentage). Lower bounds are inclusive and
// percentages are graded as given, not rounded first.
export const GRADE_SCALE = [
  [91, 'A'], [86, 'A-'], [81, 'B+'], [76, 'B'], [71, 'B-'],
  [65, 'C+'], [60, 'C'], [50, 'C-'],
]

// Float division leaves an exact boundary just below it (18.2 / 20 * 100 is
// 90.99999999999999), so comparisons allow for that error.
const FLOAT_ERROR = 1e-9

export function gradeFromPercentage(pct) {
  for (const [lowerBound, grade] of GRADE_SCALE) {
    if (pct + FLOAT_ERROR >= lowerBound) return grade
  }
  return 'F'
}
