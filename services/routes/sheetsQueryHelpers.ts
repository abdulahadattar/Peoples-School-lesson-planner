/**
 * Pure query, summary, and response-shaping helpers for /api/sheets/data.
 */

export interface SheetDataFilters {
  classFilter?: string;
  section?: string;
  status?: string;
  gender?: string;
  search?: string;
}

export function filterSheetRecords<T extends Record<string, any>>(
  records: T[],
  filters: SheetDataFilters
): T[] {
  let filtered = records;

  const filterClass = filters.classFilter?.trim();
  const filterSection = filters.section?.trim();
  const filterStatus = filters.status?.trim();
  const filterGender = filters.gender?.trim();
  const filterSearch = filters.search?.trim().toLowerCase();

  if (filterClass && filterClass.toLowerCase() !== 'all') {
    const target = filterClass.toLowerCase();
    filtered = filtered.filter((r) => String(r.currentClass || '').trim().toLowerCase() === target);
  }

  if (filterSection && filterSection.toLowerCase() !== 'all') {
    const target = filterSection.toLowerCase();
    filtered = filtered.filter((r) => String(r.section || '').trim().toLowerCase() === target);
  }

  if (filterStatus && filterStatus.toLowerCase() !== 'all') {
    const target = filterStatus.toLowerCase();
    filtered = filtered.filter((r) => String(r.status || '').toLowerCase().includes(target));
  }

  if (filterGender && filterGender.toLowerCase() !== 'all') {
    const target = filterGender.toUpperCase();
    filtered = filtered.filter((r) => {
      const g = String(r.gender || '').trim().toUpperCase();
      if (target === 'M' || target === 'MALE' || target === 'BOY') {
        return g.startsWith('M') || g.startsWith('B');
      }
      if (target === 'F' || target === 'FEMALE' || target === 'GIRL') {
        return g.startsWith('F') || g.startsWith('G');
      }
      return g === target;
    });
  }

  if (filterSearch) {
    filtered = filtered.filter(
      (r) =>
        String(r.studentName || '').toLowerCase().includes(filterSearch) ||
        String(r.fatherName || '').toLowerCase().includes(filterSearch) ||
        String(r.grNo || '').toLowerCase().includes(filterSearch) ||
        String(r.parentContact || '').toLowerCase().includes(filterSearch) ||
        String(r.emergencyContact || '').toLowerCase().includes(filterSearch) ||
        String(r.bFormNo || '').toLowerCase().includes(filterSearch)
    );
  }

  return filtered;
}

export function summarizeSheetRecords(records: Array<Record<string, any>>) {
  const classCounts: Record<string, { boys: number; girls: number; total: number }> = {};
  let totalEnrolled = 0;
  let totalBoys = 0;
  let totalGirls = 0;

  for (const s of records) {
    const cls = String(s.currentClass || 'Unassigned').trim() || 'Unassigned';
    const g = String(s.gender || '').trim().toUpperCase();
    const isBoy = g.startsWith('M') || g.startsWith('B') || g === 'BOY';
    const isGirl = g.startsWith('F') || g.startsWith('G') || g === 'GIRL';

    if (!classCounts[cls]) {
      classCounts[cls] = { boys: 0, girls: 0, total: 0 };
    }
    if (isBoy) {
      classCounts[cls].boys += 1;
      totalBoys += 1;
    } else if (isGirl) {
      classCounts[cls].girls += 1;
      totalGirls += 1;
    }
    classCounts[cls].total += 1;
    totalEnrolled += 1;
  }

  return {
    totalEnrolled,
    totalBoys,
    totalGirls,
    classCounts,
    count: records.length,
  };
}

export function shapeSheetRecordsResponse<T extends Record<string, any>>(
  records: T[],
  compact: boolean
): Array<Omit<T, 'rawMetadata'> | T> {
  if (!compact) return records;
  return records.map(({ rawMetadata: _rawMetadata, ...rest }) => rest);
}

export function canServeNotModified(params: {
  ifNoneMatch?: string;
  cachedEtag: string;
  isForceRefresh: boolean;
  filters: SheetDataFilters;
  summaryOnly: boolean;
  limit: number;
  offset: number;
}): boolean {
  const { ifNoneMatch, cachedEtag, isForceRefresh, filters, summaryOnly, limit, offset } = params;
  if (isForceRefresh || !ifNoneMatch || ifNoneMatch !== cachedEtag) return false;
  if (summaryOnly || limit > 0 || offset > 0) return false;

  const hasActiveFilter = Boolean(
    (filters.classFilter && filters.classFilter.trim().toLowerCase() !== 'all') ||
      (filters.section && filters.section.trim().toLowerCase() !== 'all') ||
      (filters.status && filters.status.trim().toLowerCase() !== 'all') ||
      (filters.gender && filters.gender.trim().toLowerCase() !== 'all') ||
      filters.search?.trim()
  );

  return !hasActiveFilter;
}
