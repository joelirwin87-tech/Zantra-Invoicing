import { DataManager } from '../data/DataManager.js';

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Client name' },
  { key: 'businessName', label: 'Business name' },
  { key: 'address', label: 'Address' },
  { key: 'abn', label: 'ABN' },
  { key: 'contact', label: 'Primary contact' },
  { key: 'prefix', label: 'Document prefix' }
];

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

export class ClientManager {
  static list() {
    return DataManager.listClients();
  }

  static findById(clientId) {
    const id = sanitizeString(clientId);
    if (!id) {
      return null;
    }
    return ClientManager.list().find((client) => client.id === id) || null;
  }

  static create(input) {
    const now = DataManager.now();
    const normalized = ClientManager.#normalize({
      ...input,
      id: DataManager.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
    return DataManager.saveClient(normalized);
  }

  static update(clientId, updates) {
    const existing = ClientManager.findById(clientId);
    if (!existing) {
      throw new Error(`ClientManager.update: No client found for id "${clientId}".`);
    }
    const normalized = ClientManager.#normalize({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: DataManager.now()
    });
    return DataManager.saveClient(normalized);
  }

  static remove(clientId) {
    return DataManager.deleteClient(clientId);
  }

  static #normalize(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('ClientManager: client payload must be an object.');
    }

    const normalized = {
      id: sanitizeString(input.id) || DataManager.randomUUID(),
      createdAt: sanitizeString(input.createdAt) || DataManager.now(),
      updatedAt: sanitizeString(input.updatedAt) || DataManager.now(),
      email: sanitizeString(input.email).toLowerCase()
    };

    REQUIRED_FIELDS.forEach(({ key, label }) => {
      const value = sanitizeString(input[key]);
      if (!value) {
        throw new Error(`${label} is required.`);
      }
      normalized[key] = key === 'prefix' ? value.toUpperCase() : value;
    });

    if (normalized.email && !ClientManager.#isValidEmail(normalized.email)) {
      throw new Error('Email must be a valid email address.');
    }

    return normalized;
  }

  static #isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
