const STORAGE_PREFIX = 'zantra-invoicing::';

const COLLECTION_KEYS = {
  invoices: 'invoices',
  quotes: 'quotes',
  clients: 'clients',
  services: 'services',
  payments: 'payments',
  settings: 'settings'
};

const DEFAULT_SETTINGS = {
  businessName: '',
  abn: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  invoicePrefix: 'INV',
  quotePrefix: 'QTE',
  gstRate: 0.1,
  updatedAt: ''
};

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

const clone = (value) => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

const normalizeNumber = (value) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

export class DataManager {
  static STORAGE_KEYS = { ...COLLECTION_KEYS };

  static randomUUID() {
    if (typeof globalThis !== 'undefined') {
      const cryptoApi = globalThis.crypto || (typeof window !== 'undefined' ? window.crypto : undefined);
      if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
      }
      if (cryptoApi?.getRandomValues) {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
          .slice(8, 10)
          .join('')}-${hex.slice(10).join('')}`;
      }
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }

  static now() {
    return new Date().toISOString();
  }

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

  static getSettings() {
    const stored = DataManager.load(COLLECTION_KEYS.settings);
    const normalized = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
    normalized.gstRate = normalizeNumber(normalized.gstRate || DEFAULT_SETTINGS.gstRate);
    return normalized;
  }

  static saveSettings(settings) {
    const current = DataManager.getSettings();
    const next = {
      ...current,
      ...(settings && typeof settings === 'object' ? settings : {}),
      gstRate: normalizeNumber(settings?.gstRate ?? current.gstRate),
      updatedAt: DataManager.now()
    };
    DataManager.save(COLLECTION_KEYS.settings, next);
    return DataManager.getSettings();
  }

  static listClients() {
    return DataManager.#getCollection(COLLECTION_KEYS.clients);
  }

  static saveClient(client) {
    return DataManager.#saveRecord(COLLECTION_KEYS.clients, client);
  }

  static deleteClient(clientId) {
    return DataManager.#deleteRecord(COLLECTION_KEYS.clients, clientId);
  }

  static listServices() {
    return DataManager.#getCollection(COLLECTION_KEYS.services);
  }

  static saveService(service) {
    return DataManager.#saveRecord(COLLECTION_KEYS.services, service);
  }

  static deleteService(serviceId) {
    return DataManager.#deleteRecord(COLLECTION_KEYS.services, serviceId);
  }

  static listInvoices() {
    return DataManager.#getCollection(COLLECTION_KEYS.invoices);
  }

  static saveInvoice(invoice) {
    return DataManager.#saveRecord(COLLECTION_KEYS.invoices, invoice);
  }

  static deleteInvoice(invoiceId) {
    return DataManager.#deleteRecord(COLLECTION_KEYS.invoices, invoiceId);
  }

  static listQuotes() {
    return DataManager.#getCollection(COLLECTION_KEYS.quotes);
  }

  static saveQuote(quote) {
    return DataManager.#saveRecord(COLLECTION_KEYS.quotes, quote);
  }

  static deleteQuote(quoteId) {
    return DataManager.#deleteRecord(COLLECTION_KEYS.quotes, quoteId);
  }

  static listPayments() {
    return DataManager.#getCollection(COLLECTION_KEYS.payments);
  }

  static savePayment(payment) {
    return DataManager.#saveRecord(COLLECTION_KEYS.payments, payment);
  }

  static deletePayment(paymentId) {
    return DataManager.#deleteRecord(COLLECTION_KEYS.payments, paymentId);
  }

  static #getCollection(key) {
    const collection = DataManager.load(key);
    if (!Array.isArray(collection)) {
      return [];
    }
    return collection.map((item) => clone(item));
  }

  static #saveRecord(key, record) {
    if (!record || typeof record !== 'object') {
      throw new Error(`DataManager.#saveRecord expects a record object for key "${key}".`);
    }
    const collection = DataManager.load(key);
    const array = Array.isArray(collection) ? [...collection] : [];
    const resolvedId = DataManager.#resolveId(record.id);
    const normalized = { ...record, id: resolvedId };
    const index = array.findIndex((item) => item && item.id === resolvedId);
    if (index === -1) {
      array.push(normalized);
    } else {
      array[index] = normalized;
    }
    DataManager.save(key, array);
    return clone(normalized);
  }

  static #deleteRecord(key, recordId) {
    const resolvedId = DataManager.#resolveId(recordId);
    if (!resolvedId) {
      return false;
    }
    const collection = DataManager.load(key);
    const array = Array.isArray(collection) ? [...collection] : [];
    const index = array.findIndex((item) => item && item.id === resolvedId);
    if (index === -1) {
      return false;
    }
    array.splice(index, 1);
    DataManager.save(key, array);
    return true;
  }

  static #resolveId(value) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return DataManager.randomUUID();
  }
}

export { DEFAULT_SETTINGS };
