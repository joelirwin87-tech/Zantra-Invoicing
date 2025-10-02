import { DataManager } from '../data/DataManager.js';
import { InvoiceManager } from './InvoiceManager.js';

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

export class PaymentManager {
  static list() {
    return DataManager.listPayments();
  }

  static listByInvoice(invoiceId) {
    const id = sanitizeString(invoiceId);
    if (!id) {
      return [];
    }
    return PaymentManager.list().filter((payment) => payment.invoiceId === id);
  }

  static recordPayment(invoiceId, amount, paymentDate, notes = '') {
    const invoice = InvoiceManager.findById(invoiceId);
    if (!invoice) {
      throw new Error(`PaymentManager.recordPayment: invoice "${invoiceId}" not found.`);
    }

    const dateIso = coerceDate(paymentDate, DataManager.now());
    const normalizedAmount = sanitizeNumber(amount);
    if (normalizedAmount <= 0) {
      throw new Error('PaymentManager.recordPayment: amount must be greater than zero.');
    }

    const previousPayments = PaymentManager.listByInvoice(invoice.id);
    const alreadyPaid = withTwoDecimals(
      previousPayments.reduce((sum, payment) => sum + sanitizeNumber(payment.amount), 0)
    );
    const remainingBalance = withTwoDecimals(Math.max(0, invoice.total - alreadyPaid));
    if (normalizedAmount > remainingBalance) {
      throw new Error('PaymentManager.recordPayment: amount exceeds outstanding balance.');
    }

    const totalPaid = withTwoDecimals(alreadyPaid + normalizedAmount);
    const balanceDue = withTwoDecimals(Math.max(0, invoice.total - totalPaid));
    const status = balanceDue === 0 ? 'paid' : 'partial';
    const paidAt = status === 'paid' ? dateIso : '';
    const payment = {
      id: DataManager.randomUUID(),
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      amount: normalizedAmount,
      recordedAt: DataManager.now(),
      paymentDate: dateIso,
      notes: sanitizeString(notes)
    };

    DataManager.savePayment(payment);
    InvoiceManager.update(invoice.id, {
      status,
      paidAt,
      amountPaid: totalPaid,
      balanceDue
    });
    return payment;
  }

  static remove(paymentId) {
    return DataManager.deletePayment(paymentId);
  }

  static getOutstandingInvoices() {
    return InvoiceManager.getOutstandingInvoices();
  }

  static getOutstandingBalance() {
    return PaymentManager.getOutstandingInvoices().reduce(
      (total, invoice) => total + (invoice.balanceDue ?? invoice.total),
      0
    );
  }

  static getAveragePaymentDays() {
    const payments = PaymentManager.list();
    if (!payments.length) {
      return 0;
    }
    const invoices = InvoiceManager.list();
    const totals = payments.reduce(
      (accumulator, payment) => {
        const invoice = invoices.find((item) => item.id === payment.invoiceId);
        if (!invoice || !invoice.paidAt) {
          return accumulator;
        }
        const issued = Date.parse(invoice.issueDate);
        const paid = Date.parse(invoice.paidAt);
        if (Number.isNaN(issued) || Number.isNaN(paid)) {
          return accumulator;
        }
        const diffDays = Math.max(0, Math.round((paid - issued) / (24 * 60 * 60 * 1000)));
        return {
          count: accumulator.count + 1,
          totalDays: accumulator.totalDays + diffDays
        };
      },
      { count: 0, totalDays: 0 }
    );
    if (!totals.count) {
      return 0;
    }
    return Math.round((totals.totalDays / totals.count) * 10) / 10;
  }
}
