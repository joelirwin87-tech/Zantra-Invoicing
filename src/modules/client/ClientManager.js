import { DataManager } from '../../data/DataManager.js';

const STORAGE_KEY = 'clients';
const REQUIRED_FIELDS = [
  { key: 'name', label: 'Client name' },
  { key: 'businessName', label: 'Business name' },
  { key: 'address', label: 'Address' },
  { key: 'abn', label: 'ABN' },
  { key: 'contactNumber', label: 'Contact number' },
  { key: 'email', label: 'Email' }
];

export class ClientManager {
  static randomUUID() {
    const fallback = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random()
      .toString(16)
      .slice(2, 10)}`;

    try {
      const cryptoApi =
        (typeof globalThis !== 'undefined' && globalThis.crypto) ||
        (typeof window !== 'undefined' && window.crypto);

      if (cryptoApi?.getRandomValues) {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
          .slice(8, 10)
          .join('')}-${hex.slice(10).join('')}`;
      }
    } catch (error) {
      console.error('ClientManager.randomUUID failed. Using fallback identifier.', error);
    }

    return fallback;
  }

  static getAllClients() {
    return ClientManager.#getStoredClients().map((client) => ClientManager.#clone(client));
  }

  static saveClients(clients) {
    if (!Array.isArray(clients)) {
      throw new Error('ClientManager.saveClients expects an array of clients.');
    }
    const normalized = clients.map((client) => ClientManager.#normalizeForStorage(client));
    DataManager.save(STORAGE_KEY, normalized);
    return ClientManager.getAllClients();
  }

  static addClient(clientInput) {
    const now = new Date().toISOString();
    const clients = ClientManager.#getStoredClients();
    const normalized = ClientManager.#normalizeForStorage({
      ...clientInput,
      id: ClientManager.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
    clients.push(normalized);
    DataManager.save(STORAGE_KEY, clients);
    return ClientManager.#clone(normalized);
  }

  static updateClient(clientId, updates) {
    if (!clientId || typeof clientId !== 'string') {
      throw new Error('ClientManager.updateClient requires a clientId string.');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('ClientManager.updateClient requires an updates object.');
    }

    const clients = ClientManager.#getStoredClients();
    const index = clients.findIndex((client) => client.id === clientId);
    if (index === -1) {
      throw new Error(`ClientManager.updateClient: No client found with id "${clientId}".`);
    }

    const existing = clients[index];
    const updatedRecord = ClientManager.#normalizeForStorage({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    });

    clients[index] = updatedRecord;
    DataManager.save(STORAGE_KEY, clients);
    return ClientManager.#clone(updatedRecord);
  }

  static deleteClient(clientId) {
    if (!clientId || typeof clientId !== 'string') {
      throw new Error('ClientManager.deleteClient requires a clientId string.');
    }

    const clients = ClientManager.#getStoredClients();
    const index = clients.findIndex((client) => client.id === clientId);
    if (index === -1) {
      throw new Error(`ClientManager.deleteClient: No client found with id "${clientId}".`);
    }

    const [removed] = clients.splice(index, 1);
    DataManager.save(STORAGE_KEY, clients);
    return ClientManager.#clone(removed);
  }

  static #getStoredClients() {
    const clients = DataManager.load(STORAGE_KEY);
    if (!Array.isArray(clients)) {
      return [];
    }
    return clients.map((client) => ClientManager.#normalizeForStorage(client));
  }

  static #normalizeForStorage(client) {
    if (!client || typeof client !== 'object') {
      throw new Error('ClientManager: client record must be an object.');
    }

    const normalized = {
      id: ClientManager.#resolveId(client.id) || ClientManager.randomUUID(),
      createdAt: ClientManager.#resolveIsoDate(client.createdAt) || new Date().toISOString(),
      updatedAt: ClientManager.#resolveIsoDate(client.updatedAt) || new Date().toISOString(),
      services: ClientManager.#normalizeServices(client.services)
    };

    REQUIRED_FIELDS.forEach(({ key, label }) => {
      const value = client[key];
      if (typeof value !== 'string') {
        throw new Error(`${label} must be provided as a non-empty string.`);
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(`${label} cannot be empty.`);
      }
      normalized[key] = key === 'email' ? ClientManager.#sanitizeEmail(trimmed) : trimmed;
    });

    return normalized;
  }

  static #normalizeServices(services) {
    if (!Array.isArray(services)) {
      return [];
    }
    return services
      .map((service) => {
        if (!service || typeof service !== 'object') {
          return null;
        }
        const copy = ClientManager.#clone(service);
        copy.id = ClientManager.#resolveId(copy.id) || ClientManager.randomUUID();
        if (copy.description && typeof copy.description === 'string') {
          copy.description = copy.description.trim();
        }
        return copy;
      })
      .filter(Boolean);
  }

  static #resolveId(value) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return '';
  }

  static #resolveIsoDate(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    const timestamp = Date.parse(trimmed);
    return Number.isNaN(timestamp) ? '' : new Date(timestamp).toISOString();
  }

  static #sanitizeEmail(email) {
    const normalized = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalized)) {
      throw new Error('Email must be a valid email address.');
    }
    return normalized;
  }

  static #clone(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }
}
