import { DataManager } from '../data/DataManager.js';
import { InvoiceManager } from './InvoiceManager.js';
import { QuoteManager } from './QuoteManager.js';
import { PaymentManager } from './PaymentManager.js';

const withTwoDecimals = (value) => Math.round(value * 100) / 100;

const formatMonthKey = (dateIso) => {
  const timestamp = Date.parse(dateIso);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (monthKey) => {
  if (!monthKey) {
    return '';
  }
  const [year, month] = monthKey.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month) {
    return monthKey;
  }
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  });
};

export class ReportManager {
  static getDashboardMetrics() {
    const invoices = InvoiceManager.list();
    const quotes = QuoteManager.list();
    const outstandingInvoices = invoices.filter((invoice) => invoice.status !== 'paid');
    const activeQuotes = quotes.filter((quote) => quote.status !== 'declined');
    const payments = PaymentManager.list();

    const openJobs = outstandingInvoices.length + activeQuotes.length;
    const invoicesDueAmount = withTwoDecimals(outstandingInvoices.reduce((sum, invoice) => sum + invoice.total, 0));
    const quoteApprovalRate = ReportManager.getQuoteApprovalRate();
    const averagePaymentTime = PaymentManager.getAveragePaymentDays();

    return {
      openJobs,
      invoicesDueAmount,
      outstandingInvoiceCount: outstandingInvoices.length,
      quoteApprovalRate,
      averagePaymentTime,
      totalInvoices: invoices.length,
      totalQuotes: quotes.length,
      totalPayments: payments.length
    };
  }

  static getQuoteApprovalRate() {
    const quotes = QuoteManager.list();
    if (!quotes.length) {
      return 0;
    }
    const accepted = quotes.filter((quote) => quote.status === 'accepted').length;
    return Math.round((accepted / quotes.length) * 1000) / 10;
  }

  static getMonthlyInvoiceSummary(monthCount = 6) {
    const invoices = InvoiceManager.list();
    const payments = PaymentManager.list();
    const monthMap = new Map();

    invoices.forEach((invoice) => {
      const key = formatMonthKey(invoice.issueDate);
      if (!key) {
        return;
      }
      if (!monthMap.has(key)) {
        monthMap.set(key, { invoiced: 0, paid: 0 });
      }
      const entry = monthMap.get(key);
      entry.invoiced = withTwoDecimals(entry.invoiced + invoice.total);
    });

    payments.forEach((payment) => {
      const key = formatMonthKey(payment.paymentDate || payment.recordedAt);
      if (!key) {
        return;
      }
      if (!monthMap.has(key)) {
        monthMap.set(key, { invoiced: 0, paid: 0 });
      }
      const entry = monthMap.get(key);
      entry.paid = withTwoDecimals(entry.paid + payment.amount);
    });

    const sortedKeys = Array.from(monthMap.keys()).sort();
    const limitedKeys = sortedKeys.slice(-monthCount);
    return limitedKeys.map((key) => ({
      monthKey: key,
      label: monthLabel(key),
      invoiced: withTwoDecimals(monthMap.get(key)?.invoiced ?? 0),
      paid: withTwoDecimals(monthMap.get(key)?.paid ?? 0)
    }));
  }

  static getGstSummary() {
    const invoices = InvoiceManager.list();
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
    const outstandingInvoices = invoices.filter((invoice) => invoice.status !== 'paid');

    const paidGst = withTwoDecimals(paidInvoices.reduce((total, invoice) => total + invoice.gstTotal, 0));
    const outstandingGst = withTwoDecimals(
      outstandingInvoices.reduce((total, invoice) => total + invoice.gstTotal, 0)
    );
    return {
      paidGst,
      outstandingGst,
      totalGst: withTwoDecimals(paidGst + outstandingGst)
    };
  }

  static getSettings() {
    return DataManager.getSettings();
  }
}
