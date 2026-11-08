/**
 * Safe local browser storage and IndexedDB helpers for user settings and playlist metadata.
 * Note: Never persists temporary blob: URLs across sessions.
 */

const SETTINGS_KEY = 'ferrari_virtual_cockpit_settings_v1';
const PLAYLIST_META_KEY = 'ferrari_virtual_cockpit_playlist_meta_v1';

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<T>;
    if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) {
      return { ...fallback, ...parsed };
    }
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, data: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('Storage write failed:', err);
  }
}

export function removeFromStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export { SETTINGS_KEY, PLAYLIST_META_KEY };

