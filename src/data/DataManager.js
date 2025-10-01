const STORAGE_PREFIX = 'zantra-invoicing::';

const resolveStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  console.error('DataManager: localStorage is not available in this environment.');
  return null;
};

const qualifyKey = (key) => {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('DataManager: storage key must be a non-empty string.');
  }
  return `${STORAGE_PREFIX}${key.trim()}`;
};

export class DataManager {
  static save(key, data) {
    try {
      const storage = resolveStorage();
      if (!storage) {
        return false;
      }
      storage.setItem(qualifyKey(key), JSON.stringify(data ?? null));
      return true;
    } catch (error) {
      console.error(`DataManager.save failed for key "${key}":`, error);
      return false;
    }
  }

  static load(key) {
    try {
      const storage = resolveStorage();
      if (!storage) {
        return null;
      }
      const raw = storage.getItem(qualifyKey(key));
      if (raw === null || raw === undefined || raw === '') {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      console.error(`DataManager.load failed for key "${key}":`, error);
      return null;
    }
  }

  static remove(key) {
    try {
      const storage = resolveStorage();
      if (!storage) {
        return false;
      }
      storage.removeItem(qualifyKey(key));
      return true;
    } catch (error) {
      console.error(`DataManager.remove failed for key "${key}":`, error);
      return false;
    }
  }

  static clearAll() {
    try {
      const storage = resolveStorage();
      if (!storage) {
        return false;
      }
      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const storedKey = storage.key(index);
        if (storedKey && storedKey.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(storedKey);
        }
      }
      keysToRemove.forEach((qualifiedKey) => storage.removeItem(qualifiedKey));
      return true;
    } catch (error) {
      console.error('DataManager.clearAll failed:', error);
      return false;
    }
  }
}
