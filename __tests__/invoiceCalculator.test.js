import { calculateInvoiceTotals, getOutstandingStatus } from '../src/invoiceCalculator.js';

describe('calculateInvoiceTotals', () => {
  it('returns zeros when no invoice items exist', () => {
    const totals = calculateInvoiceTotals({ items: [], gstEnabled: true });

    expect(totals).toEqual({
      subtotal: 0,
      gst: 0,
      total: 0,
      amountPaid: 0,
      balanceDue: 0,
    });
  });

  it('does not apply GST when gstEnabled is false', () => {
    const totals = calculateInvoiceTotals({
      items: [
        { description: 'Design work', quantity: 3, unitPrice: 100 },
        { description: 'Consulting', quantity: 2, unitPrice: 75 },
      ],
      gstEnabled: false,
      gstRate: 0.15,
    });

    expect(totals.subtotal).toBe(450);
    expect(totals.gst).toBe(0);
    expect(totals.total).toBe(450);
    expect(totals.balanceDue).toBe(450);
  });

  it('calculates balances correctly for partial payments', () => {
    const totals = calculateInvoiceTotals({
      items: [
        { description: 'Subscription', quantity: 12, unitPrice: 20 },
      ],
      gstEnabled: true,
      gstRate: 0.1,
      payments: [
        { amount: 50 },
        { amount: 30 },
      ],
    });

    expect(totals.subtotal).toBe(240);
    expect(totals.gst).toBeCloseTo(24);
    expect(totals.total).toBeCloseTo(264);
    expect(totals.amountPaid).toBe(80);
    expect(totals.balanceDue).toBeCloseTo(184);
  });
});

describe('getOutstandingStatus', () => {
  it('returns paid when the balance due is zero', () => {
    const status = getOutstandingStatus({
      items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      payments: [{ amount: 110 }],
      gstRate: 0.1,
    });

    expect(status).toBe('paid');
  });

  it('returns partially_paid when only part of the invoice is covered', () => {
    const status = getOutstandingStatus({
      items: [{ description: 'Hosting', quantity: 2, unitPrice: 80 }],
      payments: [{ amount: 50 }],
      gstRate: 0.1,
    });

    expect(status).toBe('partially_paid');
  });
});
