import { DataManager } from '../data/DataManager.js';
import { ClientManager } from './ClientManager.js';
import { InvoiceManager } from './InvoiceManager.js';

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizeNumber = (value, { min = 0, max = Number.POSITIVE_INFINITY, fallback = 0 } = {}) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return fallback;
  }
  const clamped = Math.min(Math.max(numeric, min), max);
  return Math.round(clamped * 100) / 100;
};

const sanitizeInteger = (value, { min = 0, max = Number.POSITIVE_INFINITY, fallback = 0 } = {}) => {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return fallback;
  }
  const clamped = Math.min(Math.max(numeric, min), max);
  return clamped;
};

const toDate = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      return null;
    }
    const date = new Date(parsed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const coerceDate = (value, fallback) => {
  const resolved = toDate(value) || toDate(fallback) || new Date();
  return resolved.toISOString();
};

const coerceDateOptional = (value) => {
  const resolved = toDate(value);
  return resolved ? resolved.toISOString() : '';
};

const withTwoDecimals = (value) => Math.round(value * 100) / 100;

const addDays = (date, days) => {
  const base = toDate(date) || new Date();
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + days);
  return result;
};

const addMonths = (date, months) => {
  const base = toDate(date) || new Date();
  const result = new Date(base.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const maxDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, maxDay));
  return result;
};

const clone = (value) => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const FREQUENCY_RULES = {
  weekly: { label: 'Weekly', type: 'days', value: 7 },
  fortnightly: { label: 'Fortnightly', type: 'days', value: 14 },
  monthly: { label: 'Monthly', type: 'months', value: 1 },
  quarterly: { label: 'Quarterly', type: 'months', value: 3 },
  yearly: { label: 'Yearly', type: 'months', value: 12 },
  custom: { label: 'Custom', type: 'days', value: null }
};

const calculateTotals = (lineItems, gstRate) => InvoiceManager.calculateTotals(lineItems, gstRate);

export class RecurringInvoiceManager {
  static list() {
    return DataManager.listRecurringSchedules().map((schedule) =>
      RecurringInvoiceManager.#normalize(schedule, { preserveTimestamps: true })
    );
  }

  static findById(scheduleId) {
    const id = sanitizeString(scheduleId);
    if (!id) {
      return null;
    }
    return RecurringInvoiceManager.list().find((schedule) => schedule.id === id) || null;
  }

  static create(input) {
    const now = DataManager.now();
    const normalized = RecurringInvoiceManager.#normalize(
      {
        ...input,
        id: DataManager.randomUUID(),
        createdAt: now,
        updatedAt: now
      },
      { forceUpdatedAt: now }
    );
    return DataManager.saveRecurringSchedule(normalized);
  }

  static update(scheduleId, updates) {
    const id = sanitizeString(scheduleId);
    if (!id) {
      throw new Error('RecurringInvoiceManager.update: scheduleId is required.');
    }
    const existing = RecurringInvoiceManager.findById(id);
    if (!existing) {
      throw new Error(`RecurringInvoiceManager.update: No schedule found for id "${id}".`);
    }
    const now = DataManager.now();
    const normalized = RecurringInvoiceManager.#normalize(
      {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now
      },
      { forceUpdatedAt: now }
    );
    return DataManager.saveRecurringSchedule(normalized);
  }

  static remove(scheduleId) {
    return DataManager.deleteRecurringSchedule(scheduleId);
  }

  static runNow(scheduleOrId, options = {}) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      throw new Error('RecurringInvoiceManager.runNow: schedule not found.');
    }
    const issueDateIso = coerceDate(options.issueDate, schedule.nextRunDate || DataManager.now());
    const invoice = RecurringInvoiceManager.generateInvoice(schedule, { issueDate: issueDateIso });
    const updatedSchedule = RecurringInvoiceManager.advanceSchedule(schedule, {
      runDate: issueDateIso,
      resetReminder: true
    });
    return { invoice, schedule: updatedSchedule };
  }

  static generateInvoice(scheduleOrId, options = {}) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      throw new Error('RecurringInvoiceManager.generateInvoice: schedule not found.');
    }
    const issueDateIso = coerceDate(options.issueDate, schedule.nextRunDate || DataManager.now());
    const dueDateIso = options.dueDate
      ? coerceDate(options.dueDate, issueDateIso)
      : RecurringInvoiceManager.calculateDueDate(issueDateIso, schedule.paymentTermsDays);
    const invoicePayload = {
      clientId: schedule.clientId,
      issueDate: issueDateIso,
      dueDate: dueDateIso,
      notes: schedule.notes,
      lineItems: schedule.lineItems.map((item) => ({
        serviceId: item.serviceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        applyGst: item.applyGst
      })),
      status: 'unpaid',
      type: 'invoice'
    };
    const createdInvoice = InvoiceManager.create(invoicePayload);
    return DataManager.saveInvoice({ ...createdInvoice, type: 'invoice' });
  }

  static advanceSchedule(scheduleOrId, options = {}) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      throw new Error('RecurringInvoiceManager.advanceSchedule: schedule not found.');
    }
    const runDateIso = coerceDate(options.runDate, schedule.nextRunDate || DataManager.now());
    const runDate = toDate(runDateIso) || new Date();
    const nextRunDate = RecurringInvoiceManager.calculateNextRunDate(schedule, runDate);
    const updates = {
      lastRunAt: runDate.toISOString(),
      nextRunDate,
      updatedAt: DataManager.now()
    };
    if (options.resetReminder !== false) {
      updates.lastReminderAt = '';
    }
    return RecurringInvoiceManager.update(schedule.id, updates);
  }

  static recordReminderSent(scheduleOrId, reminderDate) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      throw new Error('RecurringInvoiceManager.recordReminderSent: schedule not found.');
    }
    const reminderIso = coerceDate(reminderDate, DataManager.now());
    return RecurringInvoiceManager.update(schedule.id, {
      lastReminderAt: reminderIso
    });
  }

  static calculateNextRunDate(scheduleOrId, referenceDate) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      throw new Error('RecurringInvoiceManager.calculateNextRunDate: schedule not found.');
    }
    const reference = toDate(referenceDate) || toDate(schedule.nextRunDate) || new Date();
    if (!reference) {
      return schedule.nextRunDate || DataManager.now();
    }
    let next;
    if (schedule.intervalMonths && schedule.intervalMonths > 0) {
      next = addMonths(reference, schedule.intervalMonths);
    } else {
      const intervalDays = schedule.intervalDays && schedule.intervalDays > 0 ? schedule.intervalDays : 30;
      next = addDays(reference, intervalDays);
    }
    return next.toISOString();
  }

  static calculateDueDate(issueDateIso, paymentTermsDays = 14) {
    const terms = sanitizeInteger(paymentTermsDays, { min: 1, max: 120, fallback: 14 });
    const issueDate = toDate(issueDateIso) || new Date();
    return addDays(issueDate, terms).toISOString();
  }

  static daysUntilNextRun(scheduleOrId, referenceDate = new Date()) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      return null;
    }
    const nextRun = toDate(schedule.nextRunDate);
    const reference = toDate(referenceDate);
    if (!nextRun || !reference) {
      return null;
    }
    const diff = nextRun.getTime() - reference.getTime();
    return Math.floor(diff / MS_IN_DAY);
  }

  static isOverdue(scheduleOrId, referenceDate = new Date()) {
    const days = RecurringInvoiceManager.daysUntilNextRun(scheduleOrId, referenceDate);
    return typeof days === 'number' ? days < 0 : false;
  }

  static needsReminder(scheduleOrId, referenceDate = new Date()) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      return false;
    }
    const leadDays = sanitizeInteger(schedule.reminderLeadDays, { min: 0, max: 365, fallback: 0 });
    if (leadDays <= 0) {
      return false;
    }
    const nextRun = toDate(schedule.nextRunDate);
    const reference = toDate(referenceDate);
    if (!nextRun || !reference) {
      return false;
    }
    const msUntil = nextRun.getTime() - reference.getTime();
    if (msUntil < 0) {
      return false;
    }
    if (msUntil > leadDays * MS_IN_DAY) {
      return false;
    }
    if (!schedule.lastReminderAt) {
      return true;
    }
    const lastReminder = toDate(schedule.lastReminderAt);
    if (!lastReminder) {
      return true;
    }
    const reminderWindowStart = addDays(nextRun, -leadDays);
    return lastReminder.getTime() < reminderWindowStart.getTime();
  }

  static describeFrequency(scheduleOrId) {
    const schedule = RecurringInvoiceManager.#resolveSchedule(scheduleOrId);
    if (!schedule) {
      return '';
    }
    const key = sanitizeString(schedule.frequency).toLowerCase();
    const rule = FREQUENCY_RULES[key];
    if (!rule) {
      const days = sanitizeInteger(schedule.intervalDays, { min: 1, max: 365, fallback: 30 });
      return `Every ${days} days`;
    }
    if (key === 'custom') {
      const days = sanitizeInteger(schedule.intervalDays, { min: 1, max: 365, fallback: 30 });
      return `Every ${days} days`;
    }
    if (rule.type === 'months' && schedule.intervalMonths && schedule.intervalMonths > 1) {
      if (schedule.intervalMonths === 12) {
        return 'Yearly';
      }
      return `Every ${schedule.intervalMonths} months`;
    }
    if (rule.type === 'months') {
      return rule.label;
    }
    if (rule.type === 'days' && rule.value && rule.value > 1) {
      return rule.label;
    }
    if (rule.type === 'days' && (!rule.value || rule.value === 1)) {
      return 'Daily';
    }
    return rule.label;
  }

  static #resolveSchedule(scheduleOrId) {
    if (scheduleOrId && typeof scheduleOrId === 'object') {
      return scheduleOrId;
    }
    if (typeof scheduleOrId === 'string') {
      return RecurringInvoiceManager.findById(scheduleOrId);
    }
    return null;
  }

  static #normalize(input, options = {}) {
    if (!input || typeof input !== 'object') {
      throw new Error('RecurringInvoiceManager: schedule payload must be an object.');
    }

    const { preserveTimestamps = false, forceUpdatedAt } = options;

    const name = sanitizeString(input.name);
    if (!name) {
      throw new Error('RecurringInvoiceManager: schedule name is required.');
    }

    const clientId = sanitizeString(input.clientId);
    if (!clientId) {
      throw new Error('RecurringInvoiceManager: clientId is required.');
    }

    const client = ClientManager.findById(clientId);
    if (!client) {
      throw new Error(`RecurringInvoiceManager: Unable to locate client for id "${clientId}".`);
    }

    const frequencyKey = sanitizeString(input.frequency).toLowerCase() || 'monthly';
    const frequency = FREQUENCY_RULES[frequencyKey] ? frequencyKey : 'monthly';
    const intervalDaysInput = input.intervalDays ?? FREQUENCY_RULES[frequency]?.value ?? 30;
    const intervalDays =
      frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly'
        ? 0
        : sanitizeInteger(intervalDaysInput, { min: 1, max: 365, fallback: FREQUENCY_RULES[frequency]?.value ?? 30 });
    const intervalMonths =
      frequency === 'monthly'
        ? 1
        : frequency === 'quarterly'
        ? 3
        : frequency === 'yearly'
        ? 12
        : 0;

    const paymentTermsDays = sanitizeInteger(input.paymentTermsDays ?? input.paymentTerms, {
      min: 1,
      max: 180,
      fallback: 14
    });
    const reminderLeadDays = sanitizeInteger(input.reminderLeadDays ?? input.reminderLead, {
      min: 0,
      max: 60,
      fallback: 0
    });
    const requiresMaterials = Boolean(input.requiresMaterials);

    const nextRunDate = coerceDate(input.nextRunDate ?? input.startDate ?? input.firstRunAt, DataManager.now());
    const lastRunAt = coerceDateOptional(input.lastRunAt ?? input.previousRunAt);
    const lastReminderAt = coerceDateOptional(input.lastReminderAt ?? input.previousReminderAt);

    const settings = DataManager.getSettings();
    const lineItems = RecurringInvoiceManager.#normalizeLineItems(input.lineItems, settings);
    if (!lineItems.length) {
      throw new Error('RecurringInvoiceManager: at least one line item is required.');
    }

    const totals = calculateTotals(
      lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        applyGst: item.applyGst
      })),
      settings.gstRate
    );

    const nowIso = DataManager.now();
    const createdAt = sanitizeString(input.createdAt) || nowIso;
    let updatedAt = sanitizeString(forceUpdatedAt || input.updatedAt);
    if (!updatedAt || !preserveTimestamps) {
      updatedAt = forceUpdatedAt ? sanitizeString(forceUpdatedAt) || nowIso : nowIso;
    }

    return {
      id: sanitizeString(input.id) || DataManager.randomUUID(),
      name,
      clientId: client.id,
      clientName: client.name,
      clientBusinessName: client.businessName,
      frequency,
      intervalDays,
      intervalMonths,
      paymentTermsDays,
      reminderLeadDays,
      requiresMaterials,
      nextRunDate,
      lastRunAt,
      lastReminderAt,
      notes: sanitizeString(input.notes),
      lineItems,
      subtotal: withTwoDecimals(totals.subtotal),
      gstTotal: withTwoDecimals(totals.gstTotal),
      total: withTwoDecimals(totals.total),
      createdAt,
      updatedAt
    };
  }

  static #normalizeLineItems(lineItems, settings) {
    if (!Array.isArray(lineItems)) {
      return [];
    }
    const resolvedSettings = settings && typeof settings === 'object' ? settings : DataManager.getSettings();
    const gstRateValue = typeof resolvedSettings.gstRate === 'number' ? resolvedSettings.gstRate : 0;
    return lineItems
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const description = sanitizeString(item.description);
        const quantity = sanitizeNumber(item.quantity || 0, { min: 0, fallback: 0 });
        const unitPrice = sanitizeNumber(item.unitPrice || 0, { min: 0, fallback: 0 });
        if (!description || quantity <= 0) {
          return null;
        }
        const applyGst = Boolean(item.applyGst);
        const subtotal = withTwoDecimals(quantity * unitPrice);
        const gst = withTwoDecimals(subtotal * (applyGst ? gstRateValue : 0));
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
      .filter(Boolean)
      .map((item) => clone(item));
  }
}
