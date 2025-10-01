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

const calculateDueDate = (issueDateIso, fallbackDays = 14) => {
  const issueTimestamp = Date.parse(issueDateIso);
  if (Number.isNaN(issueTimestamp)) {
    return new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000).toISOString();
  }
  const dueTimestamp = issueTimestamp + fallbackDays * 24 * 60 * 60 * 1000;
  return new Date(dueTimestamp).toISOString();
};

const withTwoDecimals = (value) => Math.round(value * 100) / 100;

export class InvoiceManager {
  static list() {
    return DataManager.listInvoices().map((invoice) => InvoiceManager.#normalize(invoice));
  }

  static findById(invoiceId) {
    const id = sanitizeString(invoiceId);
    if (!id) {
      return null;
    }
    return InvoiceManager.list().find((invoice) => invoice.id === id) || null;
  }

  static create(input) {
    const now = DataManager.now();
    const normalized = InvoiceManager.#normalize({
      ...input,
      id: DataManager.randomUUID(),
      createdAt: now,
      updatedAt: now
    });
    return DataManager.saveInvoice(normalized);
  }

  static update(invoiceId, updates) {
    const existing = InvoiceManager.findById(invoiceId);
    if (!existing) {
      throw new Error(`InvoiceManager.update: No invoice found for id "${invoiceId}".`);
    }
    const normalized = InvoiceManager.#normalize({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: DataManager.now()
    });
    return DataManager.saveInvoice(normalized);
  }

  static markPaid(invoiceId, paidDate) {
    const existing = InvoiceManager.findById(invoiceId);
    if (!existing) {
      throw new Error(`InvoiceManager.markPaid: No invoice found for id "${invoiceId}".`);
    }
    return InvoiceManager.update(invoiceId, {
      status: 'paid',
      paidAt: coerceDate(paidDate, DataManager.now())
    });
  }

  static remove(invoiceId) {
    return DataManager.deleteInvoice(invoiceId);
  }

  static getOutstandingInvoices() {
    return InvoiceManager.list().filter((invoice) => invoice.status !== 'paid');
  }

  static generateInvoiceNumber(client) {
    const settings = DataManager.getSettings();
    const prefix = sanitizeString(client?.prefix) || sanitizeString(settings.invoicePrefix) || 'INV';
    const existing = DataManager.listInvoices();
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

  static #normalize(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('InvoiceManager: invoice payload must be an object.');
    }

    const client = ClientManager.findById(input.clientId);
    if (!client) {
      throw new Error('InvoiceManager: clientId is required.');
    }

    const settings = DataManager.getSettings();
    const issueDate = coerceDate(input.issueDate, DataManager.now());
    const dueDate = coerceDate(input.dueDate, calculateDueDate(issueDate));
    const paidAt = sanitizeString(input.paidAt);
    const status = sanitizeString(input.status) || (paidAt ? 'paid' : 'unpaid');

    const lineItems = InvoiceManager.#normalizeLineItems(input.lineItems, settings.gstRate);
    if (!lineItems.length) {
      throw new Error('InvoiceManager: at least one line item is required.');
    }

    const totals = InvoiceManager.calculateTotals(lineItems, settings.gstRate);

    return {
      id: sanitizeString(input.id) || DataManager.randomUUID(),
      number: sanitizeString(input.number) || InvoiceManager.generateInvoiceNumber(client),
      clientId: client.id,
      clientName: client.name,
      clientBusinessName: client.businessName,
      issueDate,
      dueDate,
      paidAt: paidAt || '',
      status: status === 'paid' ? 'paid' : paidAt ? 'paid' : 'unpaid',
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
