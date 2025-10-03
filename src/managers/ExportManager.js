import { InvoiceManager } from './InvoiceManager.js';

const CSV_COLUMNS = [
  { key: 'invoiceNumber', label: 'Invoice Number' },
  { key: 'issueDate', label: 'Issue Date' },
  { key: 'paidDate', label: 'Paid Date' },
  { key: 'clientName', label: 'Client Name' },
  { key: 'clientBusinessName', label: 'Client Business Name' },
  { key: 'subtotal', label: 'Subtotal (ex GST)' },
  { key: 'gstTotal', label: 'GST Amount' },
  { key: 'invoiceTotal', label: 'Invoice Total' },
  { key: 'amountPaid', label: 'Amount Paid' }
];

const sanitizeDateBoundary = (value, boundary) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }

  let parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    parsed = new Date(`${trimmed}T00:00:00`);
  }

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${boundary} date. Please enter a valid date.`);
  }

  const date = new Date(parsed.getTime());
  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const resolveTimestamp = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return timestamp;
};

const formatDateForCsv = (value) => {
  const timestamp = resolveTimestamp(value);
  if (!timestamp) {
    return '';
  }
  return new Date(timestamp).toISOString().slice(0, 10);
};

const formatCurrencyValue = (value) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return '0.00';
  }
  return numeric.toFixed(2);
};

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const buildFilename = ({ startDate, endDate }) => {
  const base = 'zantra-gst-paid-invoices';
  const start = startDate ? formatDateForCsv(startDate) : '';
  const end = endDate ? formatDateForCsv(endDate) : '';
  if (start && end) {
    return `${base}-${start}-to-${end}.csv`;
  }
  if (start) {
    return `${base}-from-${start}.csv`;
  }
  if (end) {
    return `${base}-until-${end}.csv`;
  }
  const now = new Date();
  return `${base}-${now.toISOString().slice(0, 10)}.csv`;
};

const downloadCsv = (filename, csv) => {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const normalizeDateFilters = (options = {}) => {
  const startDate = sanitizeDateBoundary(options.startDate, 'start');
  const endDate = sanitizeDateBoundary(options.endDate, 'end');

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new Error('Start date cannot be later than end date.');
  }

  return { startDate, endDate };
};

const collectPaidInvoiceRows = ({ startDate, endDate }) =>
  InvoiceManager.list()
    .filter((invoice) => invoice.status === 'paid')
    .map((invoice) => {
      const paidTimestamp = resolveTimestamp(invoice.paidAt) ?? resolveTimestamp(invoice.issueDate);
      return {
        paidTimestamp,
        data: {
          invoiceNumber: invoice.number,
          issueDate: formatDateForCsv(invoice.issueDate),
          paidDate: formatDateForCsv(invoice.paidAt),
          clientName: invoice.clientName,
          clientBusinessName: invoice.clientBusinessName,
          subtotal: formatCurrencyValue(invoice.subtotal),
          gstTotal: formatCurrencyValue(invoice.gstTotal),
          invoiceTotal: formatCurrencyValue(invoice.total),
          amountPaid: formatCurrencyValue(invoice.amountPaid ?? invoice.total ?? 0)
        }
      };
    })
    .filter((entry) => {
      if (!entry.paidTimestamp) {
        return true;
      }
      if (startDate && entry.paidTimestamp < startDate.getTime()) {
        return false;
      }
      if (endDate && entry.paidTimestamp > endDate.getTime()) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.paidTimestamp && b.paidTimestamp) {
        return a.paidTimestamp - b.paidTimestamp;
      }
      if (a.paidTimestamp) {
        return -1;
      }
      if (b.paidTimestamp) {
        return 1;
      }
      return 0;
    })
    .map((entry) => entry.data);

const buildCsvFromRows = (rows) => {
  const header = CSV_COLUMNS.map((column) => escapeCsvValue(column.label)).join(',');
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(row[column.key] ?? '')).join(',')
  );
  return [header, ...lines].join('\r\n');
};

export class ExportManager {
  static getPaidInvoiceRows(options = {}) {
    const filters = normalizeDateFilters(options);
    return collectPaidInvoiceRows(filters);
  }

  static buildPaidInvoiceCsv(options = {}) {
    const filters = normalizeDateFilters(options);
    const rows = collectPaidInvoiceRows(filters);
    if (!rows.length) {
      throw new Error('No paid invoices were found for the selected criteria.');
    }
    return buildCsvFromRows(rows);
  }

  static downloadPaidInvoicesCsv(options = {}) {
    const filters = normalizeDateFilters(options);
    const rows = collectPaidInvoiceRows(filters);
    if (!rows.length) {
      throw new Error('No paid invoices were found for the selected criteria.');
    }

    const csv = buildCsvFromRows(rows);
    const filename = buildFilename(filters);
    downloadCsv(filename, csv);
    return {
      filename,
      csv,
      rowCount: rows.length
    };
  }
}
