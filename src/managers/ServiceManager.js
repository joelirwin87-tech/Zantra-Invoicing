import { DataManager } from '../data/DataManager.js';

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizeMoney = (value) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric * 100) / 100);
};

export class ServiceManager {
  static list() {
    return DataManager.listServices();
  }

  static findById(serviceId) {
    const id = sanitizeString(serviceId);
    if (!id) {
      return null;
    }
    return ServiceManager.list().find((service) => service.id === id) || null;
  }

  static create(input) {
    const now = DataManager.now();
    const normalized = ServiceManager.#normalize({
      ...input,
      id: DataManager.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
    return DataManager.saveService(normalized);
  }

  static update(serviceId, updates) {
    const existing = ServiceManager.findById(serviceId);
    if (!existing) {
      throw new Error(`ServiceManager.update: No service found for id "${serviceId}".`);
    }
    const normalized = ServiceManager.#normalize({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: DataManager.now()
    });
    return DataManager.saveService(normalized);
  }

  static remove(serviceId) {
    return DataManager.deleteService(serviceId);
  }

  static #normalize(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('ServiceManager: payload must be an object.');
    }
    const description = sanitizeString(input.description);
    if (!description) {
      throw new Error('Service description is required.');
    }

    return {
      id: sanitizeString(input.id) || DataManager.randomUUID(),
      description,
      unitPrice: sanitizeMoney(input.unitPrice),
      createdAt: sanitizeString(input.createdAt) || DataManager.now(),
      updatedAt: sanitizeString(input.updatedAt) || DataManager.now()
    };
  }
}
