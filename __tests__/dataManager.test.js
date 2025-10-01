import DataManager from '../src/dataManager.js';

describe('DataManager', () => {
  let manager;

  beforeEach(() => {
    manager = new DataManager();
  });

  it('creates invoices with zero totals when no line items exist', () => {
    const invoice = manager.createInvoice({
      client: { name: 'Empty Corp', email: 'accounts@empty.com' },
      items: [],
      gstEnabled: true,
    });

    expect(invoice.totals).toEqual({
      subtotal: 0,
      gst: 0,
      total: 0,
      amountPaid: 0,
      balanceDue: 0,
    });
    expect(invoice.status).toBe('paid');
  });

  it('does not apply GST when disabled for the invoice', () => {
    const invoice = manager.createInvoice({
      client: { name: 'No Tax Pty Ltd', email: 'hello@notax.com' },
      items: [
        { description: 'Labour', quantity: 5, unitPrice: 40 },
      ],
      gstEnabled: false,
      gstRate: 0.15,
    });

    expect(invoice.totals.gst).toBe(0);
    expect(invoice.totals.total).toBe(200);
    expect(invoice.status).toBe('unpaid');
  });

  it('rejects invoices with invalid client emails', () => {
    expect(() =>
      manager.createInvoice({
        client: { name: 'Invalid Email', email: 'invalid-email' },
        items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      }),
    ).toThrow('A valid client email address is required');
  });

  it('tracks partial payments and updates balances correctly', () => {
    const invoice = manager.createInvoice({
      client: { name: 'Partials Inc', email: 'billing@partials.io' },
      items: [
        { description: 'Consulting', quantity: 4, unitPrice: 150 },
      ],
      gstEnabled: true,
      gstRate: 0.1,
    });

    const updatedInvoice = manager.applyPayment(invoice.id, { amount: 300, method: 'card' });

    expect(updatedInvoice.totals.amountPaid).toBe(300);
    expect(updatedInvoice.totals.balanceDue).toBeCloseTo(updatedInvoice.totals.total - 300);
    expect(updatedInvoice.status).toBe('partially_paid');

    const finalInvoice = manager.applyPayment(invoice.id, { amount: updatedInvoice.totals.balanceDue, method: 'bank_transfer' });

    expect(finalInvoice.totals.balanceDue).toBe(0);
    expect(finalInvoice.status).toBe('paid');
  });
});
