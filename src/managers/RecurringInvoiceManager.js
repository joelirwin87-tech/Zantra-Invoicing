import { DataManager } from '../data/DataManager.js';
import { ClientManager } from './ClientManager.js';
import { InvoiceManager } from './InvoiceManager.js';

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizeNumber = (value) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric * 100) / 100);
};

const toDateAtStartOfDay = (input) => {
  if (!input) {
    return null;
  }
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const toIsoDate = (input, fallback) => {
  const date = toDateAtStartOfDay(input) || (fallback ? toDateAtStartOfDay(fallback) : null);
  return date ? date.toISOString() : '';
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  const originalDate = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < originalDate) {
    next.setDate(0);
  }
  return next;
};

const FREQUENCIES = Object.freeze({
  weekly: {
    value: 'weekly',
    label: 'Weekly',
    add: (date) => addDays(date, 7)
  },
  fortnightly: {
    value: 'fortnightly',
    label: 'Fortnightly',
    add: (date) => addDays(date, 14)
  },
  monthly: {
    value: 'monthly',
    label: 'Monthly',
    add: (date) => addMonths(date, 1)
  },
  quarterly: {
    value: 'quarterly',
    label: 'Quarterly',
    add: (date) => addMonths(date, 3)
  },
  annually: {
    value: 'annually',
    label: 'Annually',
    add: (date) => addMonths(date, 12)
  }
});

const MAX_SCHEDULE_ADVANCE = 48;

export class RecurringInvoiceManager {
  static FREQUENCIES = FREQUENCIES;

  static list() {
    return DataManager.listRecurringSchedules()
      .map((record) => RecurringInvoiceManager.#normalize(record, { allowMissingClient: true, preserveCreatedAt: true }))
      .sort((a, b) => {
        const aTime = a.nextRun ? Date.parse(a.nextRun) : Number.POSITIVE_INFINITY;
        const bTime = b.nextRun ? Date.parse(b.nextRun) : Number.POSITIVE_INFINITY;
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
          return sanitizeString(a.name).localeCompare(sanitizeString(b.name));
        }
        if (Number.isNaN(aTime)) {
          return 1;
        }
        if (Number.isNaN(bTime)) {
          return -1;
        }
        return aTime - bTime;
      });
  }

  static findById(scheduleId) {
    const id = sanitizeString(scheduleId);
    if (!id) {
      return null;
    }
    return RecurringInvoiceManager.list().find((schedule) => schedule.id === id) || null;
  }

  static getFrequencyOptions() {
    return Object.values(FREQUENCIES).map(({ value, label }) => ({ value, label }));
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
      { allowMissingClient: false, preserveCreatedAt: false }
    );
    return DataManager.saveRecurringSchedule(normalized);
  }

  static update(scheduleId, updates) {
    const existing = RecurringInvoiceManager.findById(scheduleId);
    if (!existing) {
      throw new Error(`RecurringInvoiceManager.update: No schedule found for id "${scheduleId}".`);
    }
    const normalized = RecurringInvoiceManager.#normalize(
      {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: DataManager.now()
      },
      { allowMissingClient: false, preserveCreatedAt: true }
    );
    return DataManager.saveRecurringSchedule(normalized);
  }

  static remove(scheduleId) {
    return DataManager.deleteRecurringSchedule(scheduleId);
  }

  static runSchedule(scheduleId, referenceDate = new Date()) {
    const schedule = RecurringInvoiceManager.findById(scheduleId);
    if (!schedule) {
      return null;
    }
    const runDateIso = schedule.nextRun || toIsoDate(referenceDate, DataManager.now());
    const runDate = toDateAtStartOfDay(runDateIso) || new Date();
    const executionDate = toDateAtStartOfDay(referenceDate) || runDate;

    if (!schedule.lineItems?.length) {
      console.warn(`RecurringInvoiceManager.runSchedule: Schedule "${scheduleId}" has no line items.`);
      return null;
    }

    try {
      const dueDays = Number.isFinite(schedule.dueDays) ? schedule.dueDays : 14;
      const dueDate = addDays(runDate, Math.max(1, dueDays));
      const invoicePayload = {
        clientId: schedule.clientId,
        issueDate: runDate.toISOString(),
        dueDate: dueDate.toISOString(),
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
      DataManager.saveInvoice({ ...createdInvoice, type: 'invoice' });

      const updatedSchedule = RecurringInvoiceManager.#recordRun(
        schedule,
        runDate.toISOString(),
        executionDate.toISOString()
      );

      return { invoice: createdInvoice, schedule: updatedSchedule };
    } catch (error) {
      console.error('RecurringInvoiceManager.runSchedule failed:', error);
      return null;
    }
  }

  static executeDueSchedules(referenceDate = new Date()) {
    const now = toDateAtStartOfDay(referenceDate) || new Date();
    const schedules = RecurringInvoiceManager.list();
    const dueSchedules = schedules.filter((schedule) => {
      if (!schedule.nextRun) {
        return false;
      }
      const nextRunDate = toDateAtStartOfDay(schedule.nextRun);
      return nextRunDate && nextRunDate.getTime() <= now.getTime();
    });

    const results = [];
    dueSchedules.forEach((schedule) => {
      const outcome = RecurringInvoiceManager.runSchedule(schedule.id, now);
      if (outcome) {
        results.push(outcome);
      }
    });
    return results;
  }

  static getUpcomingSchedules(referenceDate = new Date(), windowDays = 30) {
    const start = toDateAtStartOfDay(referenceDate) || new Date();
    const end = addDays(start, Math.max(1, windowDays));
    return RecurringInvoiceManager.list().filter((schedule) => {
      if (!schedule.nextRun) {
        return false;
      }
      const nextRunDate = toDateAtStartOfDay(schedule.nextRun);
      if (!nextRunDate) {
        return false;
      }
      return nextRunDate.getTime() >= start.getTime() && nextRunDate.getTime() <= end.getTime();
    });
  }

  static #normalize(input, options = {}) {
    if (!input || typeof input !== 'object') {
      throw new Error('RecurringInvoiceManager: schedule payload must be an object.');
    }

    const { allowMissingClient = false, preserveCreatedAt = true } = options;

    const client = RecurringInvoiceManager.#resolveClient(input, { allowMissing: allowMissingClient });
    if (!client && !allowMissingClient) {
      throw new Error('RecurringInvoiceManager: a valid client is required.');
    }

    const frequencyKey = RecurringInvoiceManager.#resolveFrequency(input.frequency);
    const frequency = FREQUENCIES[frequencyKey] ?? FREQUENCIES.monthly;

    const startDateIso = toIsoDate(input.startDate, DataManager.now());
    const nextRunIso = toIsoDate(input.nextRun || startDateIso || DataManager.now(), startDateIso || DataManager.now());
    const lastRunIso = toIsoDate(input.lastRun);

    const lineItems = RecurringInvoiceManager.#normalizeLineItems(input.lineItems);
    if (!lineItems.length) {
      throw new Error('RecurringInvoiceManager: at least one line item is required.');
    }

    const dueDaysValue = Math.max(1, Math.min(90, Math.round(Number.parseInt(input.dueDays ?? 14, 10)) || 14));
    const nowIso = DataManager.now();

    return {
      id: sanitizeString(input.id) || DataManager.randomUUID(),
      name: sanitizeString(input.name) || 'Recurring invoice',
      description: sanitizeString(input.description),
      clientId: client?.id || sanitizeString(input.clientId),
      clientName: client?.name || sanitizeString(input.clientName),
      clientBusinessName: client?.businessName || sanitizeString(input.clientBusinessName),
      frequency: frequency.value,
      frequencyLabel: frequency.label,
      dueDays: dueDaysValue,
      startDate: startDateIso,
      nextRun: nextRunIso,
      lastRun: lastRunIso,
      notes: sanitizeString(input.notes),
      lineItems,
      createdAt: preserveCreatedAt ? sanitizeString(input.createdAt) || nowIso : nowIso,
      updatedAt: sanitizeString(input.updatedAt) || nowIso
    };
  }

  static #resolveClient(input, { allowMissing }) {
    const clientId = sanitizeString(input.clientId || input.client?.id);
    if (!clientId) {
      return null;
    }
    const client = ClientManager.findById(clientId);
    if (!client && allowMissing) {
      return {
        id: clientId,
        name: sanitizeString(input.clientName) || 'Unknown client',
        businessName: sanitizeString(input.clientBusinessName)
      };
    }
    return client;
  }

  static #resolveFrequency(raw) {
    const value = sanitizeString(raw).toLowerCase();
    if (value && FREQUENCIES[value]) {
      return value;
    }
    return FREQUENCIES.monthly.value;
  }

  static #normalizeLineItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }
    return items
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
        return {
          id: sanitizeString(item.id) || DataManager.randomUUID(),
          serviceId: sanitizeString(item.serviceId),
          description,
          quantity,
          unitPrice,
          applyGst: Boolean(item.applyGst)
        };
      })
      .filter(Boolean);
  }

  static #recordRun(schedule, runDateIso, referenceDateIso) {
    const runDate = toDateAtStartOfDay(runDateIso);
    if (!runDate) {
      return schedule;
    }
    const referenceDate = toDateAtStartOfDay(referenceDateIso) || runDate;
    const frequency = FREQUENCIES[schedule.frequency] ?? FREQUENCIES.monthly;
    let nextRunDate = frequency.add(runDate);
    let iterations = 0;
    while (nextRunDate.getTime() <= referenceDate.getTime() && iterations < MAX_SCHEDULE_ADVANCE) {
      nextRunDate = frequency.add(nextRunDate);
      iterations += 1;
    }
    const normalized = {
      ...schedule,
      lastRun: runDate.toISOString(),
      nextRun: nextRunDate.toISOString(),
      updatedAt: DataManager.now()
    };
    return DataManager.saveRecurringSchedule(normalized);
  }
}

export default RecurringInvoiceManager;
