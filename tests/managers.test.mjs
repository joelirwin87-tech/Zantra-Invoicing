/**
 * @jest-environment node
 */
import { DataManager } from '../src/data/DataManager.js';
import { ClientManager } from '../src/managers/ClientManager.js';
import { InvoiceManager } from '../src/managers/InvoiceManager.js';
import { QuoteManager } from '../src/managers/QuoteManager.js';
import { PaymentManager } from '../src/managers/PaymentManager.js';
import { ExportManager } from '../src/managers/ExportManager.js';

const createMockStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    }
  };
};

beforeEach(() => {
  const storage = createMockStorage();
  global.localStorage = storage;
  globalThis.localStorage = storage;
  global.window = { localStorage: storage };
  DataManager.clearAll();
});

afterEach(() => {
  DataManager.clearAll();
  delete global.window;
  delete global.localStorage;
  delete globalThis.localStorage;
});

describe('InvoiceManager resilience', () => {
  test('retains invoices after client removal and allows updates', () => {
    const client = ClientManager.create({
      name: 'Client One',
      businessName: 'Client Co',
      address: '1 Street',
      abn: '11 111 111 111',
      contact: '0400000000',
      prefix: 'CL',
      email: 'client1@example.com'
    });

    const invoice = InvoiceManager.create({
      clientId: client.id,
      issueDate: '2024-03-01',
      dueDate: '2024-03-15',
      lineItems: [
        { description: 'Service work', quantity: 2, unitPrice: 150, applyGst: false }
      ]
    });

    expect(invoice.clientId).toBe(client.id);

    ClientManager.remove(client.id);

    const listed = InvoiceManager.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].clientId).toBe(client.id);
    expect(listed[0].status).toBe('unpaid');
    expect(listed[0].balanceDue).toBe(listed[0].total);

    expect(() => InvoiceManager.markPaid(invoice.id, '2024-03-20')).not.toThrow();
    const updated = InvoiceManager.findById(invoice.id);
    expect(updated.status).toBe('paid');
    expect(updated.balanceDue).toBe(0);
    expect(updated.amountPaid).toBe(updated.total);
  });
});

describe('QuoteManager resilience', () => {
  test('returns quotes when client is removed', () => {
    const client = ClientManager.create({
      name: 'Quote Client',
      businessName: 'Quote Co',
      address: '2 Street',
      abn: '22 222 222 222',
      contact: '0400000001',
      prefix: 'QC',
      email: 'quote@example.com'
    });

    const quote = QuoteManager.create({
      clientId: client.id,
      issueDate: '2024-02-01',
      validUntil: '2024-02-15',
      lineItems: [
        { description: 'Quoted service', quantity: 1, unitPrice: 500, applyGst: true }
      ]
    });

    ClientManager.remove(client.id);

    const listed = QuoteManager.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].clientId).toBe(client.id);
    expect(listed[0].clientName).toBe('Quote Client');

    const accepted = QuoteManager.markAccepted(quote.id, '2024-02-10');
    expect(accepted.status).toBe('accepted');
  });
});

describe('PaymentManager validations', () => {
  test('enforces positive payments and tracks partial balances', () => {
    const client = ClientManager.create({
      name: 'Paying Client',
      businessName: 'Paying Co',
      address: '3 Street',
      abn: '33 333 333 333',
      contact: '0400000002',
      prefix: 'PC',
      email: 'pay@example.com'
    });

    const invoice = InvoiceManager.create({
      clientId: client.id,
      issueDate: '2024-01-01',
      dueDate: '2024-01-14',
      lineItems: [
        { description: 'Initial work', quantity: 1, unitPrice: 300, applyGst: false }
      ]
    });

    expect(invoice.balanceDue).toBe(invoice.total);

    expect(() => PaymentManager.recordPayment(invoice.id, 0, '2024-01-05')).toThrow(
      /amount must be greater than zero/
    );

    const partial = PaymentManager.recordPayment(invoice.id, 100, '2024-01-05');
    expect(partial.amount).toBe(100);

    const afterPartial = InvoiceManager.findById(invoice.id);
    expect(afterPartial.status).toBe('partial');
    expect(afterPartial.amountPaid).toBe(100);
    expect(afterPartial.balanceDue).toBe(afterPartial.total - 100);

    expect(() =>
      PaymentManager.recordPayment(invoice.id, afterPartial.balanceDue + 1, '2024-01-06')
    ).toThrow(/exceeds outstanding balance/);

    PaymentManager.recordPayment(invoice.id, afterPartial.balanceDue, '2024-01-10');

    const settled = InvoiceManager.findById(invoice.id);
    expect(settled.status).toBe('paid');
    expect(settled.amountPaid).toBe(settled.total);
    expect(settled.balanceDue).toBe(0);
    expect(settled.paidAt).not.toBe('');

    expect(PaymentManager.getOutstandingInvoices()).toHaveLength(0);
    expect(PaymentManager.getOutstandingBalance()).toBe(0);
    expect(PaymentManager.listByInvoice(invoice.id)).toHaveLength(2);
  });
});

describe('ExportManager GST CSV', () => {
  test('returns CSV data for filtered invoices when DOM is unavailable', () => {
    const client = ClientManager.create({
      name: 'GST Client',
      businessName: 'GST Services',
      address: '9 Export Way',
      abn: '44 444 444 444',
      contact: '0400000009',
      prefix: 'GC',
      email: 'gst@example.com'
    });

    const paidInvoice = InvoiceManager.create({
      clientId: client.id,
      issueDate: '2024-03-05',
      dueDate: '2024-03-19',
      lineItems: [
        { description: 'On-site install', quantity: 2, unitPrice: 220, applyGst: true }
      ]
    });

    InvoiceManager.markPaid(paidInvoice.id, '2024-03-20');

    InvoiceManager.create({
      clientId: client.id,
      issueDate: '2024-04-02',
      dueDate: '2024-04-16',
      lineItems: [
        { description: 'Follow-up support', quantity: 1, unitPrice: 110, applyGst: true }
      ]
    });

    const exportResult = ExportManager.downloadGstCsv({
      startDate: '2024-03-01',
      endDate: '2024-03-31',
      status: 'paid'
    });

    const settledInvoice = InvoiceManager.findById(paidInvoice.id);
    expect(exportResult.rowCount).toBe(1);
    expect(exportResult.filename).toBe('gst-export-20240301-to-20240331.csv');
    const rows = exportResult.csv.trim().split('\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Invoice Number');
    expect(rows[1]).toContain(settledInvoice.number);
    expect(rows[1]).toContain(settledInvoice.gstTotal.toFixed(2));
    expect(rows[1]).toContain('Paid');
  });

  test('validates export ranges before generating CSV', () => {
    expect(() =>
      ExportManager.downloadGstCsv({ startDate: '', endDate: '2024-03-10' })
    ).toThrow(/start and end date/i);
    expect(() =>
      ExportManager.downloadGstCsv({ startDate: '2024-03-15', endDate: '2024-03-10' })
    ).toThrow(/start date must be on or before the end date/i);
  });
});
