import { DataManager } from '../data/DataManager.js';
import { InvoiceManager } from './InvoiceManager.js';
import { QuoteManager } from './QuoteManager.js';
import { PaymentManager } from './PaymentManager.js';
import { RecurringInvoiceManager } from './RecurringInvoiceManager.js';

const withTwoDecimals = (value) => Math.round(value * 100) / 100;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const UPCOMING_RECURRING_WINDOW_DAYS = 30;

const parseDate = (value) => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp);
};

const resolveNextRecurringDate = (invoice) => {
  if (!invoice || typeof invoice !== 'object') {
    return null;
  }
  const schedule = invoice.recurringSchedule || invoice.recurring || {};
  const candidates = [
    invoice.nextIssueDate,
    invoice.nextInvoiceDate,
    invoice.nextRecurringDate,
    schedule?.nextOccurrence,
    schedule?.nextIssueDate,
    schedule?.nextInvoiceDate,
    schedule?.nextRunAt,
    schedule?.nextScheduledAt
  ];
  for (const candidate of candidates) {
    const date = parseDate(candidate);
    if (date) {
      return date;
    }
  }
  return null;
};

const isRecurringEnabled = (invoice) => {
  if (!invoice || typeof invoice !== 'object') {
    return false;
  }

  if (typeof invoice.isRecurring === 'boolean') {
    return invoice.isRecurring;
  }

  if (typeof invoice.recurring === 'boolean') {
    return invoice.recurring;
  }

  const schedule = invoice.recurringSchedule || (typeof invoice.recurring === 'object' ? invoice.recurring : null);
  if (schedule && typeof schedule === 'object') {
    if ('enabled' in schedule && schedule.enabled === false) {
      return false;
    }
    if ('isEnabled' in schedule && schedule.isEnabled === false) {
      return false;
    }
    if ('isActive' in schedule && schedule.isActive === false) {
      return false;
    }
    return true;
  }

  if (invoice.recurrenceRule || invoice.billingInterval || invoice.frequency) {
    return true;
  }

  return Boolean(resolveNextRecurringDate(invoice));
};

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
    const schedules = RecurringInvoiceManager.list();
    const outstandingInvoices = invoices.filter(
      (invoice) => (invoice.balanceDue ?? invoice.total) > 0
    );
    const activeQuotes = quotes.filter((quote) => quote.status !== 'declined');
    const payments = PaymentManager.list();
    const now = new Date();
    const upcomingSchedules = schedules.filter((schedule) => {
      const days = RecurringInvoiceManager.daysUntilNextRun(schedule, now);
      return typeof days === 'number' && days >= 0 && days <= 7;
    });
    const materialReorders = schedules.filter((schedule) => {
      if (!schedule.requiresMaterials) {
        return false;
      }
      const days = RecurringInvoiceManager.daysUntilNextRun(schedule, now);
      return typeof days === 'number' && days >= 0 && days <= 14;
    });
    const pendingReminders = schedules.filter((schedule) =>
      RecurringInvoiceManager.needsReminder(schedule, now)
    );

    const openJobs = outstandingInvoices.length + activeQuotes.length;
    const invoicesDueAmount = withTwoDecimals(
      outstandingInvoices.reduce((sum, invoice) => sum + (invoice.balanceDue ?? invoice.total), 0)
    );
    const quoteApprovalRate = ReportManager.getQuoteApprovalRate();
    const averagePaymentTime = PaymentManager.getAveragePaymentDays();
    const now = Date.now();
    const recurringWindowEnd = now + UPCOMING_RECURRING_WINDOW_DAYS * MILLISECONDS_IN_DAY;
    const upcomingRecurringInvoices = invoices.filter((invoice) => {
      if (!isRecurringEnabled(invoice)) {
        return false;
      }
      const nextDate = resolveNextRecurringDate(invoice);
      if (!nextDate) {
        return false;
      }
      const time = nextDate.getTime();
      return time >= now && time <= recurringWindowEnd;
    });
    const upcomingRecurringAmount = withTwoDecimals(
      upcomingRecurringInvoices.reduce((total, invoice) => total + (invoice.total ?? 0), 0)
    );
    const overdueInvoices = outstandingInvoices.filter((invoice) => {
      const dueDate = parseDate(invoice.dueDate);
      if (!dueDate) {
        return false;
      }
      return dueDate.getTime() < now;
    });
    const overdueInvoiceAmount = withTwoDecimals(
      overdueInvoices.reduce((total, invoice) => total + (invoice.balanceDue ?? invoice.total ?? 0), 0)
    );

    return {
      openJobs,
      invoicesDueAmount,
      outstandingInvoiceCount: outstandingInvoices.length,
      quoteApprovalRate,
      averagePaymentTime,
      totalInvoices: invoices.length,
      totalQuotes: quotes.length,
      totalPayments: payments.length,
      upcomingRecurringCount: upcomingRecurringInvoices.length,
      upcomingRecurringAmount,
      overdueInvoiceCount: overdueInvoices.length,
      overdueInvoiceAmount
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
    const outstandingInvoices = invoices.filter((invoice) => (invoice.balanceDue ?? invoice.total) > 0);

    const paidGst = withTwoDecimals(paidInvoices.reduce((total, invoice) => total + invoice.gstTotal, 0));
    const outstandingGst = withTwoDecimals(
      outstandingInvoices.reduce((total, invoice) => {
        if (!invoice.total) {
          return total;
        }
        const ratio = Math.min(1, Math.max(0, (invoice.balanceDue ?? invoice.total) / invoice.total));
        return total + invoice.gstTotal * ratio;
      }, 0)
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
