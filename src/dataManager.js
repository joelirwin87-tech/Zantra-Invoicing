import { calculateInvoiceTotals, getOutstandingStatus } from './invoiceCalculator.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const normaliseClient = (client) => {
  if (!client || typeof client !== 'object') {
    throw new TypeError('Client details are required');
  }
  const { name, email, id } = client;
  if (!name) {
    throw new Error('Client name is required');
  }
  if (!EMAIL_REGEX.test(email ?? '')) {
    throw new Error('A valid client email address is required');
  }

  return {
    id: id ?? email,
    name,
    email: email.toLowerCase(),
  };
};

const sanitisePayment = (payment) => {
  if (!payment || typeof payment !== 'object') {
    throw new TypeError('Payment details are required');
  }

  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError('Payment amounts must be a positive number');
  }

  return {
    amount,
    method: payment.method ?? 'unspecified',
    receivedAt: payment.receivedAt ?? new Date().toISOString(),
  };
};

const ensureInvoiceExists = (invoices, invoiceId) => {
  const existing = invoices.get(invoiceId);
  if (!existing) {
    throw new Error(`Invoice with id ${invoiceId} was not found`);
  }
  return existing;
};

export class DataManager {
  constructor() {
    this.clients = new Map();
    this.invoices = new Map();
    this.invoiceSequence = 1;
  }

  createInvoice({ client, items = [], gstEnabled = true, gstRate, payments = [], meta = {} }) {
    const normalisedClient = normaliseClient(client);
    this.clients.set(normalisedClient.id, normalisedClient);

    const invoiceId = this.#generateInvoiceId();
    const invoiceRecord = {
      id: invoiceId,
      client: normalisedClient,
      items: items.map((item) => ({ ...item })),
      gstEnabled,
      gstRate,
      payments: payments.map((payment) => sanitisePayment(payment)),
      meta: { ...meta },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    invoiceRecord.totals = calculateInvoiceTotals(invoiceRecord);
    invoiceRecord.status = getOutstandingStatus(invoiceRecord);

    this.invoices.set(invoiceId, invoiceRecord);

    return clone(invoiceRecord);
  }

  getInvoice(invoiceId) {
    const invoice = ensureInvoiceExists(this.invoices, invoiceId);
    return clone(invoice);
  }

  listInvoices() {
    return Array.from(this.invoices.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((invoice) => clone(invoice));
  }

  applyPayment(invoiceId, payment) {
    const invoice = ensureInvoiceExists(this.invoices, invoiceId);
    const sanitisedPayment = sanitisePayment(payment);

    const simulatedInvoice = {
      ...invoice,
      payments: [...invoice.payments, sanitisedPayment],
    };
    const totals = calculateInvoiceTotals(simulatedInvoice);
    if (totals.balanceDue < 0.01) {
      const overpayment = totals.amountPaid - totals.total;
      if (overpayment > 0) {
        throw new RangeError('Payment exceeds the invoice total');
      }
    }

    invoice.payments.push(sanitisedPayment);
    invoice.totals = totals;
    invoice.status = getOutstandingStatus(simulatedInvoice);
    invoice.updatedAt = new Date().toISOString();

    return clone(invoice);
  }

  updateInvoice(invoiceId, { items, gstEnabled, gstRate, client, meta }) {
    const invoice = ensureInvoiceExists(this.invoices, invoiceId);

    if (items) {
      if (!Array.isArray(items)) {
        throw new TypeError('Invoice items must be an array');
      }
      invoice.items = items.map((item) => ({ ...item }));
    }

    if (typeof gstEnabled === 'boolean') {
      invoice.gstEnabled = gstEnabled;
    }

    if (typeof gstRate === 'number') {
      invoice.gstRate = gstRate;
    }

    if (client) {
      const normalisedClient = normaliseClient(client);
      invoice.client = normalisedClient;
      this.clients.set(normalisedClient.id, normalisedClient);
    }

    if (meta) {
      invoice.meta = { ...meta };
    }

    invoice.totals = calculateInvoiceTotals(invoice);
    invoice.status = getOutstandingStatus(invoice);
    invoice.updatedAt = new Date().toISOString();

    return clone(invoice);
  }

  #generateInvoiceId() {
    const id = `INV-${String(this.invoiceSequence).padStart(4, '0')}`;
    this.invoiceSequence += 1;
    return id;
  }
}

export default DataManager;
