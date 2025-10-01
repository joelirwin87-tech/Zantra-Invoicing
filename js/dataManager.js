const DEFAULT_SCHEMA = Object.freeze({
  version: 1,
  invoices: []
});

const STORAGE_KEY = "zantra-invoicing-store";

const STATUS = Object.freeze({
  PAID: "paid",
  UNPAID: "unpaid",
  PART_PAID: "part-paid"
});

const safeParseFloat = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const deepFreeze = (object) => {
  Object.freeze(object);
  Object.getOwnPropertyNames(object).forEach((prop) => {
    const value = object[prop];
    if (
      value &&
      (typeof value === "object" || typeof value === "function") &&
      !Object.isFrozen(value)
    ) {
      deepFreeze(value);
    }
  });
  return object;
};

deepFreeze(DEFAULT_SCHEMA);
deepFreeze(STATUS);

const clone = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export class DataManager {
  constructor({ storageKey = STORAGE_KEY } = {}) {
    this.storageKey = storageKey;
    this.state = clone(DEFAULT_SCHEMA);
    this.hasWindow = typeof window !== "undefined";
    this.storageAvailable = this.hasWindow ? this.#detectStorage() : false;
    if (this.hasWindow) {
      this.load();
    }
  }

  static get STATUS() {
    return STATUS;
  }

  load() {
    if (!this.storageAvailable || !this.hasWindow) {
      this.state = clone(DEFAULT_SCHEMA);
      return;
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        this.state = clone(DEFAULT_SCHEMA);
        this.save();
        return;
      }

      const parsed = JSON.parse(raw);
      this.state = this.#validate(parsed) ? parsed : clone(DEFAULT_SCHEMA);
    } catch (error) {
      console.error("Failed to load data, reverting to defaults", error);
      this.state = clone(DEFAULT_SCHEMA);
    }
  }

  save() {
    if (!this.storageAvailable || !this.hasWindow) {
      return;
    }
    try {
      const serialised = JSON.stringify(this.state);
      window.localStorage.setItem(this.storageKey, serialised);
    } catch (error) {
      console.error("Failed to persist data", error);
    }
  }

  getInvoices() {
    return this.state.invoices.map((invoice) => ({ ...invoice }));
  }

  getInvoiceById(id) {
    return this.getInvoices().find((invoice) => invoice.id === id) || null;
  }

  addInvoice(invoiceInput) {
    const invoice = this.#normaliseInvoice(invoiceInput);
    this.state.invoices.push(invoice);
    this.save();
    return { ...invoice };
  }

  updateInvoice(id, updates) {
    const index = this.state.invoices.findIndex((invoice) => invoice.id === id);
    if (index === -1) {
      throw new Error(`Invoice with id ${id} not found`);
    }

    const current = this.state.invoices[index];
    const next = this.#normaliseInvoice({ ...current, ...updates }, current.id);
    this.state.invoices[index] = next;
    this.save();
    return { ...next };
  }

  getOutstandingInvoices() {
    return this.getInvoices()
      .filter((invoice) => this.#calculateOutstanding(invoice) > 0)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  getPaidTotalsByMonth() {
    const totals = new Map();
    this.state.invoices.forEach((invoice) => {
      const paidAmount = safeParseFloat(invoice.paidAmount);
      if (paidAmount <= 0) {
        return;
      }
      const paymentDate = invoice.paymentDate || invoice.issueDate;
      if (!paymentDate) {
        return;
      }
      const monthKey = paymentDate.slice(0, 7); // YYYY-MM
      const currentTotal = totals.get(monthKey) || 0;
      totals.set(monthKey, currentTotal + paidAmount);
    });

    return Array.from(totals.entries())
      .sort((a, b) => {
        if (a[0] === b[0]) {
          return 0;
        }
        return a[0] < b[0] ? -1 : 1;
      })
      .map(([month, total]) => ({ month, total }));
  }

  getGstSummary() {
    let totalNet = 0;
    let totalGst = 0;
    let totalPaidNet = 0;
    let totalPaidGst = 0;
    let totalOutstandingNet = 0;
    let totalOutstandingGst = 0;

    this.state.invoices.forEach((invoice) => {
      const amount = safeParseFloat(invoice.amount);
      const paidAmount = clamp(safeParseFloat(invoice.paidAmount), 0, amount);
      const outstanding = amount - paidAmount;
      const gstRate = clamp(safeParseFloat(invoice.gstRate), 0, 100);
      const gstFactor = gstRate / 100;
      const invoiceGst = amount * gstFactor;
      const paidGst = paidAmount * gstFactor;
      const outstandingGst = outstanding * gstFactor;

      totalNet += amount;
      totalGst += invoiceGst;
      totalPaidNet += paidAmount;
      totalPaidGst += paidGst;
      totalOutstandingNet += outstanding;
      totalOutstandingGst += outstandingGst;
    });

    return {
      totalNet,
      totalGst,
      grossTotal: totalNet + totalGst,
      totalPaidNet,
      totalPaidGst,
      totalOutstandingNet,
      totalOutstandingGst
    };
  }

  #normaliseInvoice(input, existingId) {
    const id = existingId || this.#createId();
    const invoiceNumber = String(input.invoiceNumber || "").trim();
    const clientName = String(input.clientName || "").trim();
    const issueDate = input.issueDate || new Date().toISOString().slice(0, 10);
    const dueDate = input.dueDate || issueDate;
    const amount = clamp(safeParseFloat(input.amount), 0, Number.MAX_SAFE_INTEGER);
    const gstRate = clamp(safeParseFloat(input.gstRate ?? 10), 0, 100);
    const status = this.#resolveStatus(amount, input.paidAmount);
    const paidAmountRaw = safeParseFloat(input.paidAmount);
    const paidAmount = clamp(
      status === STATUS.PAID ? amount : paidAmountRaw,
      0,
      amount
    );
    const paymentDate = status === STATUS.UNPAID ? null : input.paymentDate || null;
    const notes = String(input.notes || "").trim();

    if (!invoiceNumber) {
      throw new Error("Invoice number is required");
    }
    if (!clientName) {
      throw new Error("Client name is required");
    }

    return {
      id,
      invoiceNumber,
      clientName,
      issueDate,
      dueDate,
      amount,
      gstRate,
      status,
      paidAmount,
      paymentDate,
      notes,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  #createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `inv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  #resolveStatus(amount, paidAmount) {
    const paidValue = safeParseFloat(paidAmount);

    if (paidValue <= 0) {
      return STATUS.UNPAID;
    }
    if (paidValue >= amount) {
      return STATUS.PAID;
    }
    return STATUS.PART_PAID;
  }

  #calculateOutstanding(invoice) {
    const amount = safeParseFloat(invoice.amount);
    const paidAmount = clamp(safeParseFloat(invoice.paidAmount), 0, amount);
    return amount - paidAmount;
  }

  #validate(raw) {
    if (!raw || typeof raw !== "object") {
      return false;
    }

    if (!Array.isArray(raw.invoices)) {
      return false;
    }

    return raw.invoices.every((invoice) => this.#isInvoiceValid(invoice));
  }

  #isInvoiceValid(invoice) {
    if (!invoice || typeof invoice !== "object") {
      return false;
    }

    const requiredStringFields = ["id", "invoiceNumber", "clientName", "issueDate", "dueDate"];
    if (!requiredStringFields.every((field) => typeof invoice[field] === "string" && invoice[field])) {
      return false;
    }

    if (typeof invoice.amount !== "number" || invoice.amount < 0) {
      return false;
    }

    if (typeof invoice.gstRate !== "number" || invoice.gstRate < 0 || invoice.gstRate > 100) {
      return false;
    }

    if (!Object.values(STATUS).includes(invoice.status)) {
      return false;
    }

    if (typeof invoice.paidAmount !== "number" || invoice.paidAmount < 0 || invoice.paidAmount > invoice.amount) {
      return false;
    }

    return true;
  }

  #detectStorage() {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn("Local storage unavailable, falling back to in-memory mode.", error);
      return false;
    }
  }
}
