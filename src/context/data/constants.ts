/**
 * Constants and storage helpers for DataContext
 */

export const DELETED_CARNETS_STORAGE_KEY = 'portus_deleted_carnet_ids';

export function getStoredDeletedCarnetIds(): Set<string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DELETED_CARNETS_STORAGE_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) return new Set(arr);
      }
    }
  } catch {}
  return new Set();
}

export function recordDeletedCarnet(id: string, carnetNumber?: string) {
  try {
    const set = getStoredDeletedCarnetIds();
    if (id) set.add(id);
    if (carnetNumber) set.add(carnetNumber);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DELETED_CARNETS_STORAGE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}
