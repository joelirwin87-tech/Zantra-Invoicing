import { DataManager } from '../data/DataManager.js';
import { ClientManager } from './ClientManager.js';

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizeNumber = (value) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric * 100) / 100);
};

const coerceDate = (value, fallback) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = sanitizeString(value);
  if (!parsed) {
    return fallback;
  }
  const timestamp = Date.parse(parsed);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }
  return new Date(timestamp).toISOString();
};

const withTwoDecimals = (value) => Math.round(value * 100) / 100;

const resolveClient = (clientId, fallback, { strictClientValidation }) => {
  const id = sanitizeString(clientId);
  if (!id) {
    throw new Error('QuoteManager: clientId is required.');
  }

  const client = ClientManager.findById(id);
  if (client) {
    return client;
  }

  if (strictClientValidation) {
    throw new Error('QuoteManager: clientId is required.');
  }

  return {
    id,
    name: sanitizeString(fallback?.clientName) || 'Unknown client',
    businessName: sanitizeString(fallback?.clientBusinessName) || ''
  };
};

export class QuoteManager {
  static list() {
    return DataManager.listQuotes().map((quote) =>
      QuoteManager.#normalize(quote, { strictClientValidation: false })
    );
  }

  static findById(quoteId) {
    const id = sanitizeString(quoteId);
    if (!id) {
      return null;
    }
    return QuoteManager.list().find((quote) => quote.id === id) || null;
  }

  static create(input) {
    const now = DataManager.now();
    const normalized = QuoteManager.#normalize(
      {
        ...input,
        id: DataManager.randomUUID(),
        createdAt: now,
        updatedAt: now
      },
      { strictClientValidation: true }
    );
    return DataManager.saveQuote(normalized);
  }

  static update(quoteId, updates) {
    const existing = QuoteManager.findById(quoteId);
    if (!existing) {
      throw new Error(`QuoteManager.update: No quote found for id "${quoteId}".`);
    }
    const sanitizedClientId = sanitizeString(updates?.clientId);
    if (sanitizedClientId && sanitizedClientId !== existing.clientId) {
      const nextClient = ClientManager.findById(sanitizedClientId);
      if (!nextClient) {
        throw new Error(`QuoteManager.update: No client found for id "${sanitizedClientId}".`);
      }
    }
    const normalized = QuoteManager.#normalize(
      {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: DataManager.now()
      },
      { strictClientValidation: false }
    );
    return DataManager.saveQuote(normalized);
  }

  static markAccepted(quoteId, acceptedDate) {
    return QuoteManager.update(quoteId, {
      status: 'accepted',
      decisionDate: coerceDate(acceptedDate, DataManager.now())
    });
  }

  static markDeclined(quoteId, declinedDate) {
    return QuoteManager.update(quoteId, {
      status: 'declined',
      decisionDate: coerceDate(declinedDate, DataManager.now())
    });
  }

  static remove(quoteId) {
    return DataManager.deleteQuote(quoteId);
  }

  static generateQuoteNumber(client) {
    const settings = DataManager.getSettings();
    const prefix = sanitizeString(client?.prefix) || sanitizeString(settings.quotePrefix) || 'QTE';
    const existing = DataManager.listQuotes();
    const sequence = existing.length + 1;
    return `${prefix}-${String(sequence).padStart(4, '0')}`;
  }

  static calculateTotals(lineItems, gstRate) {
    const rate = typeof gstRate === 'number' && gstRate >= 0 ? gstRate : DataManager.getSettings().gstRate;
    return lineItems.reduce(
      (accumulator, line) => {
        const subtotal = withTwoDecimals(line.quantity * line.unitPrice);
        const gst = line.applyGst ? withTwoDecimals(subtotal * rate) : 0;
        const total = withTwoDecimals(subtotal + gst);
        return {
          subtotal: withTwoDecimals(accumulator.subtotal + subtotal),
          gstTotal: withTwoDecimals(accumulator.gstTotal + gst),
          total: withTwoDecimals(accumulator.total + total)
        };
      },
      { subtotal: 0, gstTotal: 0, total: 0 }
    );
  }

  static #normalize(input, options = {}) {
    if (!input || typeof input !== 'object') {
      throw new Error('QuoteManager: quote payload must be an object.');
    }

    const { strictClientValidation = true } = options;

    const client = resolveClient(input.clientId, input, { strictClientValidation });

    const settings = DataManager.getSettings();
    const issueDate = coerceDate(input.issueDate, DataManager.now());
    const validUntil = coerceDate(input.validUntil, new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    const status = sanitizeString(input.status) || 'pending';

    const lineItems = QuoteManager.#normalizeLineItems(input.lineItems, settings.gstRate);
    if (!lineItems.length) {
      throw new Error('QuoteManager: at least one line item is required.');
    }

    const totals = QuoteManager.calculateTotals(lineItems, settings.gstRate);

    return {
      id: sanitizeString(input.id) || DataManager.randomUUID(),
      number: sanitizeString(input.number) || QuoteManager.generateQuoteNumber(client),
      clientId: client.id,
      clientName: client.name,
      clientBusinessName: client.businessName,
      issueDate,
      validUntil,
      status,
      decisionDate: sanitizeString(input.decisionDate) || '',
      notes: sanitizeString(input.notes),
      lineItems,
      subtotal: totals.subtotal,
      gstTotal: totals.gstTotal,
      total: totals.total,
      createdAt: sanitizeString(input.createdAt) || DataManager.now(),
      updatedAt: sanitizeString(input.updatedAt) || DataManager.now()
    };
  }

  static #normalizeLineItems(lineItems, gstRate) {
    const rate = typeof gstRate === 'number' && gstRate >= 0 ? gstRate : DataManager.getSettings().gstRate;
    if (!Array.isArray(lineItems)) {
      return [];
    }
    return lineItems
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const description = sanitizeString(item.description);
        const quantity = sanitizeNumber(item.quantity || 0);
        const unitPrice = sanitizeNumber(item.unitPrice || 0);
        if (!description || quantity <= 0) {
          return null;
        }
        const applyGst = Boolean(item.applyGst);
        const subtotal = withTwoDecimals(quantity * unitPrice);
        const gst = applyGst ? withTwoDecimals(subtotal * rate) : 0;
        const total = withTwoDecimals(subtotal + gst);
        return {
          id: sanitizeString(item.id) || DataManager.randomUUID(),
          serviceId: sanitizeString(item.serviceId),
          description,
          quantity,
          unitPrice,
          applyGst,
          subtotal,
          gst,
          total
        };
      })
      .filter(Boolean);
  }
}
