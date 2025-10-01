/*
 * LocalDataManager - a lightweight local-first data manager using IndexedDB.
 * Supports clients, invoices, quotes, services, and payments with CRUD, versioning,
 * soft deletion, and CSV import/export. Designed for browser environments.
 */

const DEFAULT_DB_NAME = 'zantraInvoicing';
const DEFAULT_DB_VERSION = 1;

const ENTITY_TYPES = {
  CLIENTS: 'clients',
  INVOICES: 'invoices',
  QUOTES: 'quotes',
  SERVICES: 'services',
  PAYMENTS: 'payments',
};

const ENTITY_SCHEMAS = {
  [ENTITY_TYPES.CLIENTS]: {
    required: ['name', 'email'],
    fields: {
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string', optional: true },
      address: { type: 'string', optional: true },
      notes: { type: 'string', optional: true },
    },
  },
  [ENTITY_TYPES.INVOICES]: {
    required: ['clientId', 'issueDate', 'dueDate', 'items', 'status', 'total'],
    fields: {
      clientId: { type: 'string' },
      issueDate: { type: 'string' },
      dueDate: { type: 'string' },
      items: { type: 'array' },
      status: { type: 'string' },
      total: { type: 'number' },
      currency: { type: 'string', optional: true },
      notes: { type: 'string', optional: true },
    },
  },
  [ENTITY_TYPES.QUOTES]: {
    required: ['clientId', 'issueDate', 'items', 'status', 'total'],
    fields: {
      clientId: { type: 'string' },
      issueDate: { type: 'string' },
      items: { type: 'array' },
      status: { type: 'string' },
      total: { type: 'number' },
      currency: { type: 'string', optional: true },
      notes: { type: 'string', optional: true },
      validUntil: { type: 'string', optional: true },
    },
  },
  [ENTITY_TYPES.SERVICES]: {
    required: ['name', 'rate'],
    fields: {
      name: { type: 'string' },
      description: { type: 'string', optional: true },
      rate: { type: 'number' },
      unit: { type: 'string', optional: true },
    },
  },
  [ENTITY_TYPES.PAYMENTS]: {
    required: ['invoiceId', 'amount', 'paymentDate', 'method'],
    fields: {
      invoiceId: { type: 'string' },
      amount: { type: 'number' },
      paymentDate: { type: 'string' },
      method: { type: 'string' },
      reference: { type: 'string', optional: true },
      notes: { type: 'string', optional: true },
    },
  },
};

const CSV_SEPARATOR = ',';
const LINE_BREAK = '\n';

const isBrowserEnvironment = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

class LocalDataManager {
  constructor({ dbName = DEFAULT_DB_NAME, version = DEFAULT_DB_VERSION } = {}) {
    if (!isBrowserEnvironment()) {
      throw new Error('LocalDataManager must be run in a browser environment with IndexedDB support.');
    }

    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async init() {
    if (this.db) {
      return this.db;
    }

    this.db = await this.#openDatabase();
    return this.db;
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async reset() {
    await this.close();
    await new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onblocked = () => reject(new Error('Database deletion blocked. Please close other tabs.'));
    });
    return this.init();
  }

  async create(entityType, payload) {
    this.#assertEntityType(entityType);
    const db = await this.init();
    const preparedRecord = this.#prepareRecordForCreate(entityType, payload);

    return this.#transaction(db, entityType, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.add(preparedRecord);
        request.onsuccess = () => resolve(preparedRecord);
        request.onerror = () => reject(request.error);
      });
    });
  }

  async read(entityType, id, { includeDeleted = false } = {}) {
    this.#assertEntityType(entityType);
    if (!id) {
      throw new Error('An id must be provided to read an entity.');
    }
    const db = await this.init();

    return this.#transaction(db, entityType, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const record = request.result;
          if (!record) {
            resolve(null);
            return;
          }
          if (!includeDeleted && record.isDeleted) {
            resolve(null);
            return;
          }
          resolve({ ...record });
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async update(entityType, id, updates) {
    this.#assertEntityType(entityType);
    if (!id) {
      throw new Error('An id must be provided to update an entity.');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Updates must be provided as an object.');
    }
    const db = await this.init();

    return this.#transaction(db, entityType, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          if (!existing) {
            reject(new Error(`Cannot update missing ${entityType} with id ${id}.`));
            return;
          }

          if (existing.isDeleted) {
            reject(new Error(`Cannot update deleted ${entityType} with id ${id}.`));
            return;
          }

          const sanitizedUpdates = this.#sanitizePayload(entityType, updates, { partial: true });
          if (Object.keys(sanitizedUpdates).length === 0) {
            reject(new Error('No valid fields provided for update.'));
            return;
          }
          const merged = {
            ...existing,
            ...sanitizedUpdates,
            updatedAt: new Date().toISOString(),
            version: existing.version + 1,
          };

          const putRequest = store.put(merged);
          putRequest.onsuccess = () => resolve({ ...merged });
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    });
  }

  async softDelete(entityType, id) {
    this.#assertEntityType(entityType);
    if (!id) {
      throw new Error('An id must be provided to delete an entity.');
    }
    const db = await this.init();

    return this.#transaction(db, entityType, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          if (!existing) {
            reject(new Error(`Cannot delete missing ${entityType} with id ${id}.`));
            return;
          }
          if (existing.isDeleted) {
            resolve({ ...existing });
            return;
          }

          const updated = {
            ...existing,
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: existing.version + 1,
          };

          const putRequest = store.put(updated);
          putRequest.onsuccess = () => resolve({ ...updated });
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    });
  }

  async restore(entityType, id) {
    this.#assertEntityType(entityType);
    if (!id) {
      throw new Error('An id must be provided to restore an entity.');
    }
    const db = await this.init();

    return this.#transaction(db, entityType, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          if (!existing) {
            reject(new Error(`Cannot restore missing ${entityType} with id ${id}.`));
            return;
          }
          if (!existing.isDeleted) {
            resolve({ ...existing });
            return;
          }

          const updated = {
            ...existing,
            isDeleted: false,
            deletedAt: null,
            updatedAt: new Date().toISOString(),
            version: existing.version + 1,
          };

          const putRequest = store.put(updated);
          putRequest.onsuccess = () => resolve({ ...updated });
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    });
  }

  async list(entityType, { includeDeleted = false, filter } = {}) {
    this.#assertEntityType(entityType);
    const db = await this.init();

    return this.#transaction(db, entityType, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const results = [];
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const record = cursor.value;
            let includeRecord = includeDeleted || !record.isDeleted;
            if (includeRecord && filter) {
              try {
                includeRecord = Boolean(filter({ ...record }));
              } catch (error) {
                reject(error);
                try {
                  store.transaction.abort();
                } catch (abortError) {
                  // Ignore abort errors triggered after transaction completes.
                }
                return;
              }
            }

            if (includeRecord) {
              results.push({ ...record });
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async exportToCSV(entityType, { includeDeleted = false } = {}) {
    const records = await this.list(entityType, { includeDeleted });
    if (!records.length) {
      return '';
    }

    const schema = ENTITY_SCHEMAS[entityType];
    const headers = this.#csvHeaders(schema);
    const lines = [headers.join(CSV_SEPARATOR)];

    for (const record of records) {
      const line = headers
        .map((key) => this.#encodeCsvValue(record[key]))
        .join(CSV_SEPARATOR);
      lines.push(line);
    }

    return lines.join(LINE_BREAK);
  }

  async importFromCSV(entityType, csvString, { overwrite = false } = {}) {
    this.#assertEntityType(entityType);
    if (typeof csvString !== 'string') {
      throw new Error('CSV data must be provided as a string.');
    }
    const trimmedCsv = csvString.trim();
    if (!trimmedCsv) {
      return [];
    }
    const db = await this.init();
    const schema = ENTITY_SCHEMAS[entityType];
    const rows = trimmedCsv.split(/\r?\n/);
    const headers = rows[0].split(CSV_SEPARATOR).map((h) => h.trim());

    this.#validateCsvHeaders(schema, headers);

    const records = rows.slice(1).filter(Boolean).map((row) => this.#parseCsvRow(headers, row));

    return this.#transaction(db, entityType, 'readwrite', (store) => {
      return Promise.all(
        records.map((record) => {
          const sanitized = this.#sanitizePayload(entityType, record, { allowSystemFields: true });
          return new Promise((resolve, reject) => {
            const ensureId = sanitized.id || this.#generateId();
            const nowIso = new Date().toISOString();
            const normalizedVersion = (() => {
              if (typeof sanitized.version === 'number') {
                return sanitized.version;
              }
              if (typeof sanitized.version === 'string' && sanitized.version.trim()) {
                const parsed = Number(sanitized.version.trim());
                if (Number.isNaN(parsed) || parsed <= 0) {
                  throw new Error('Version must be a positive number.');
                }
                return Math.floor(parsed);
              }
              return 1;
            })();
            const createdAt = this.#normalizeTimestamp(sanitized.createdAt, nowIso);
            const updatedAt = this.#normalizeTimestamp(sanitized.updatedAt, nowIso);
            const isDeleted = (() => {
              if (typeof sanitized.isDeleted === 'boolean') {
                return sanitized.isDeleted;
              }
              if (typeof sanitized.isDeleted === 'string') {
                const normalized = sanitized.isDeleted.trim().toLowerCase();
                if (normalized === 'true' || normalized === '1') {
                  return true;
                }
                if (normalized === 'false' || normalized === '0' || normalized === '') {
                  return false;
                }
              }
              return Boolean(sanitized.isDeleted);
            })();
            const hasDeletedAtValue = sanitized.deletedAt !== undefined && sanitized.deletedAt !== null && sanitized.deletedAt !== '';
            const deletedAt = hasDeletedAtValue
              ? this.#normalizeTimestamp(sanitized.deletedAt, nowIso)
              : isDeleted
                ? nowIso
                : null;
            const prepared = {
              ...sanitized,
              id: ensureId,
              createdAt,
              updatedAt,
              version: normalizedVersion,
              isDeleted,
              deletedAt,
            };

            const putRecord = () => {
              const request = store.put(prepared);
              request.onsuccess = () => resolve({ ...prepared });
              request.onerror = () => reject(request.error);
            };

            if (!overwrite) {
              const existingRequest = store.get(ensureId);
              existingRequest.onsuccess = () => {
                if (existingRequest.result) {
                  reject(new Error(`Record with id ${ensureId} already exists. Set overwrite=true to replace.`));
                } else {
                  putRecord();
                }
              };
              existingRequest.onerror = () => reject(existingRequest.error);
            } else {
              putRecord();
            }
          });
        })
      );
    });
  }

  getEntitySchema(entityType) {
    this.#assertEntityType(entityType);
    return JSON.parse(JSON.stringify(ENTITY_SCHEMAS[entityType]));
  }

  async #openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB database.'));
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.#initializeStores(db);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  #initializeStores(db) {
    Object.values(ENTITY_TYPES).forEach((entityType) => {
      if (!db.objectStoreNames.contains(entityType)) {
        db.createObjectStore(entityType, { keyPath: 'id' });
      }
    });
  }

  #transaction(db, entityType, mode, executor) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(entityType, mode);
      const store = transaction.objectStore(entityType);
      let settled = false;
      let transactionCompleted = false;
      let resultResolved = false;
      let resultValue;

      const attemptResolve = () => {
        if (!settled && transactionCompleted && resultResolved) {
          settled = true;
          resolve(resultValue);
        }
      };

      const fail = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      transaction.oncomplete = () => {
        transactionCompleted = true;
        attemptResolve();
      };

      transaction.onerror = () => {
        fail(transaction.error || new Error('An IndexedDB transaction error occurred.'));
      };

      transaction.onabort = () => {
        fail(transaction.error || new Error('The IndexedDB transaction was aborted.'));
      };

      let resultPromise;
      try {
        resultPromise = Promise.resolve(executor(store));
      } catch (error) {
        fail(error);
        try {
          if (transaction && transaction.abort) {
            transaction.abort();
          }
        } catch (abortError) {
          // Ignore abort errors triggered after transaction completes.
        }
        return;
      }

      resultPromise
        .then((result) => {
          resultResolved = true;
          resultValue = result;
          attemptResolve();
        })
        .catch((error) => {
          fail(error);
          try {
            if (transaction && transaction.abort && transaction.error === null) {
              transaction.abort();
            }
          } catch (abortError) {
            // Ignore abort errors triggered after transaction completes.
          }
        });
    });
  }

  #prepareRecordForCreate(entityType, payload) {
    const sanitized = this.#sanitizePayload(entityType, payload);
    const nowIso = new Date().toISOString();
    return {
      ...sanitized,
      id: sanitized.id || this.#generateId(),
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      isDeleted: false,
      deletedAt: null,
    };
  }

  #sanitizePayload(entityType, payload, { partial = false, allowSystemFields = false } = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be an object.');
    }

    const schema = ENTITY_SCHEMAS[entityType];
    const output = {};

    const allowedKeys = new Set(Object.keys(schema.fields));
    if (allowSystemFields) {
      ['id', 'createdAt', 'updatedAt', 'version', 'isDeleted', 'deletedAt'].forEach((key) => allowedKeys.add(key));
    }

    Object.entries(payload).forEach(([key, value]) => {
      if (!allowedKeys.has(key)) {
        return;
      }
      if (value === undefined) {
        return;
      }
      const fieldDef = schema.fields[key];
      if (fieldDef) {
        const normalized = this.#normalizeFieldValue(key, value, fieldDef.type);
        this.#validateType(key, normalized, fieldDef.type);
        output[key] = normalized;
        return;
      }
      output[key] = value;
    });

    if (!partial) {
      this.#validateRequiredFields(schema, output);
    }

    return output;
  }

  #validateType(fieldName, value, expectedType) {
    if (value === undefined || value === null) {
      return;
    }
    if (expectedType === 'array') {
      if (!Array.isArray(value)) {
        throw new Error(`Field ${fieldName} must be an array.`);
      }
      return;
    }
    if (expectedType === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Field ${fieldName} must be a valid number.`);
      }
      return;
    }
    if (typeof value !== expectedType) {
      throw new Error(`Field ${fieldName} must be of type ${expectedType}.`);
    }
  }

  #normalizeTimestamp(value, fallback) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    throw new Error('Timestamp values must be ISO strings or Date instances.');
  }

  #normalizeFieldValue(fieldName, value, expectedType) {
    if (value === undefined) {
      return value;
    }
    if (value === null) {
      return null;
    }
    if (expectedType === 'number') {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const parsed = Number(trimmed);
        if (Number.isNaN(parsed)) {
          throw new Error(`Field ${fieldName} must be a valid number.`);
        }
        return parsed;
      }
    }
    if (expectedType === 'array' && typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
          throw new Error(`Field ${fieldName} must be an array.`);
        }
        return parsed;
      } catch (error) {
        throw new Error(`Field ${fieldName} must be a valid JSON array.`);
      }
    }
    return value;
  }

  #validateRequiredFields(schema, payload) {
    schema.required.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(payload, field) || payload[field] === undefined || payload[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    });
  }

  #assertEntityType(entityType) {
    if (!Object.values(ENTITY_TYPES).includes(entityType)) {
      throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  #csvHeaders(schema) {
    const baseFields = Object.keys(schema.fields);
    const systemFields = ['id', 'createdAt', 'updatedAt', 'version', 'isDeleted', 'deletedAt'];
    const uniqueHeaders = new Set([...systemFields, ...baseFields]);
    return Array.from(uniqueHeaders);
  }

  #encodeCsvValue(value) {
    if (value === undefined || value === null) {
      return '';
    }
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes(CSV_SEPARATOR)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  #validateCsvHeaders(schema, headers) {
    const expected = new Set(this.#csvHeaders(schema));
    headers.forEach((header) => {
      if (!expected.has(header)) {
        throw new Error(`Unexpected CSV header: ${header}`);
      }
    });
  }

  #parseCsvRow(headers, row) {
    const values = this.#splitCsvRow(row);
    if (values.length !== headers.length) {
      throw new Error('CSV row does not match header length.');
    }
    const record = {};
    headers.forEach((header, index) => {
      record[header] = this.#decodeCsvValue(values[index]);
    });
    return record;
  }

  #splitCsvRow(row) {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];

      if (char === '"') {
        if (insideQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === CSV_SEPARATOR && !insideQuotes) {
        result.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current);
    return result;
  }

  #decodeCsvValue(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.toLowerCase() === 'null') {
      return null;
    }
    if (trimmed.toLowerCase() === 'undefined') {
      return undefined;
    }
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        throw new Error(`Invalid JSON value in CSV: ${trimmed}`);
      }
    }
    if (trimmed.toLowerCase() === 'true') {
      return true;
    }
    if (trimmed.toLowerCase() === 'false') {
      return false;
    }
    return trimmed;
  }

  #generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

export { LocalDataManager, ENTITY_TYPES, ENTITY_SCHEMAS };
