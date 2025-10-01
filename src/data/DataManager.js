const STORAGE_PREFIX = 'zantra-invoicing::';

export class DataManager {
  static #getStorage() {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
    console.error('DataManager: localStorage is not available in this environment.');
    return null;
  }

  static #qualifyKey(key) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('DataManager: storage key must be a non-empty string.');
    }
    return `${STORAGE_PREFIX}${key.trim()}`;
  }

  static save(key, data) {
    try {
      const storage = DataManager.#getStorage();
      if (!storage) {
        return false;
      }
      const qualifiedKey = DataManager.#qualifyKey(key);
      const payload = JSON.stringify(data ?? null);
      storage.setItem(qualifiedKey, payload);
      return true;
    } catch (error) {
      console.error(`DataManager.save failed for key "${key}":`, error);
      return false;
    }
  }

  static load(key) {
    try {
      const storage = DataManager.#getStorage();
      if (!storage) {
        return null;
      }
      const qualifiedKey = DataManager.#qualifyKey(key);
      const raw = storage.getItem(qualifiedKey);
      if (raw === null || raw === undefined) {
        return null;
      }
      if (raw.trim() === '') {
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
      const storage = DataManager.#getStorage();
      if (!storage) {
        return false;
      }
      const qualifiedKey = DataManager.#qualifyKey(key);
      storage.removeItem(qualifiedKey);
      return true;
    } catch (error) {
      console.error(`DataManager.remove failed for key "${key}":`, error);
      return false;
    }
  }

  static clearAll() {
    try {
      const storage = DataManager.#getStorage();
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
