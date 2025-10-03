import { InvoiceManager } from './InvoiceManager.js';

const CSV_HEADERS = [
  'Invoice Number',
  'Issue Date',
  'Due Date',
  'Client Name',
  'Client Business Name',
  'Status',
  'Subtotal',
  'GST Total',
  'Invoice Total',
  'Amount Paid',
  'Balance Due'
];

const STATUS_WHITELIST = new Set(['paid', 'partial', 'unpaid']);

export class ExportManager {
  static downloadGstCsv(range = {}) {
    const normalizedRange = ExportManager.#normalizeRange(range);
    const invoices = InvoiceManager.list();

    const filteredInvoices = invoices.filter((invoice) => {
      const issueTimestamp = ExportManager.#parseInvoiceDate(invoice.issueDate);
      if (issueTimestamp === null) {
        return false;
      }

      if (issueTimestamp < normalizedRange.startTimestamp || issueTimestamp > normalizedRange.endTimestamp) {
        return false;
      }

      if (normalizedRange.statuses && !normalizedRange.statuses.has(invoice.status)) {
        return false;
      }

      return true;
    });

    if (!filteredInvoices.length) {
      throw new Error('No invoices match the selected filters for export.');
    }

    const rows = [CSV_HEADERS, ...filteredInvoices.map((invoice) => ExportManager.#mapInvoiceToRow(invoice))];
    const csv = ExportManager.#rowsToCsv(rows);
    const filename = ExportManager.#buildFilename(normalizedRange.startDate, normalizedRange.endDate);

    const result = {
      csv,
      filename,
      rowCount: rows.length - 1,
      filters: {
        startDate: normalizedRange.startDate.toISOString(),
        endDate: normalizedRange.endDate.toISOString(),
        statuses: normalizedRange.statuses ? Array.from(normalizedRange.statuses) : []
      }
    };

    if (typeof document === 'undefined' || typeof Blob === 'undefined') {
      return result;
    }

    const urlApi = ExportManager.#getUrlApi();
    if (!urlApi?.createObjectURL) {
      return result;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = urlApi.createObjectURL(blob);

    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch (revokeError) {
          console.warn('ExportManager: failed to revoke object URL.', revokeError);
        }
      }, 1000);
    }

    return result;
  }

  static #normalizeRange(range) {
    const startInput = range?.startDate ?? range?.start ?? range?.from;
    const endInput = range?.endDate ?? range?.end ?? range?.to;

    const startTimestamp = ExportManager.#parseInputDate(startInput, { endOfDay: false });
    const endTimestamp = ExportManager.#parseInputDate(endInput, { endOfDay: true });

    if (startTimestamp === null || endTimestamp === null) {
      throw new Error('Export range must include both a valid start and end date.');
    }

    if (startTimestamp > endTimestamp) {
      throw new Error('Export start date must be on or before the end date.');
    }

    const statuses = ExportManager.#normalizeStatuses(range?.status);

    return {
      startTimestamp,
      endTimestamp,
      startDate: new Date(startTimestamp),
      endDate: new Date(endTimestamp),
      statuses
    };
  }

  static #normalizeStatuses(input) {
    if (!input) {
      return null;
    }

    const values = Array.isArray(input) ? input : [input];
    const normalized = values
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter((value) => STATUS_WHITELIST.has(value));

    if (!normalized.length || normalized.length === STATUS_WHITELIST.size) {
      return null;
    }

    return new Set(normalized);
  }

  static #parseInputDate(value, { endOfDay }) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const cloned = new Date(value.getTime());
      if (!ExportManager.#hasTimeComponent(value)) {
        ExportManager.#applyBoundary(cloned, endOfDay);
      }
      return cloned.getTime();
    }

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    const date = new Date(timestamp);
    if (!ExportManager.#hasTimeComponent(trimmed)) {
      ExportManager.#applyBoundary(date, endOfDay);
    }
    return date.getTime();
  }

  static #parseInvoiceDate(value) {
    if (!value) {
      return null;
    }
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return null;
    }
    return timestamp;
  }

  static #applyBoundary(date, endOfDay) {
    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
  }

  static #hasTimeComponent(value) {
    if (value instanceof Date) {
      return (
        value.getHours() !== 0 ||
        value.getMinutes() !== 0 ||
        value.getSeconds() !== 0 ||
        value.getMilliseconds() !== 0
      );
    }
    return typeof value === 'string' && value.includes('T');
  }

  static #mapInvoiceToRow(invoice) {
    return [
      ExportManager.#escapeCsv(invoice.number),
      ExportManager.#formatIsoDate(invoice.issueDate),
      ExportManager.#formatIsoDate(invoice.dueDate),
      ExportManager.#escapeCsv(invoice.clientName),
      ExportManager.#escapeCsv(invoice.clientBusinessName),
      ExportManager.#escapeCsv(ExportManager.#formatStatus(invoice.status)),
      ExportManager.#formatCurrency(invoice.subtotal),
      ExportManager.#formatCurrency(invoice.gstTotal),
      ExportManager.#formatCurrency(invoice.total),
      ExportManager.#formatCurrency(invoice.amountPaid),
      ExportManager.#formatCurrency(invoice.balanceDue)
    ];
  }

  static #formatIsoDate(value) {
    if (!value) {
      return '';
    }
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return '';
    }
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  static #formatStatus(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'paid':
        return 'Paid';
      case 'partial':
        return 'Partially Paid';
      case 'unpaid':
        return 'Unpaid';
      default:
        return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
    }
  }

  static #formatCurrency(value) {
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
      return '0.00';
    }
    return numeric.toFixed(2);
  }

  static #escapeCsv(value) {
    if (value === null || value === undefined) {
      return '';
    }
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  static #rowsToCsv(rows) {
    return rows.map((row) => row.join(',')).join('\n');
  }

  static #buildFilename(startDate, endDate) {
    const start = ExportManager.#formatForFilename(startDate);
    const end = ExportManager.#formatForFilename(endDate);
    return `gst-export-${start}-to-${end}.csv`;
  }

  static #formatForFilename(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return 'unknown';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  static #getUrlApi() {
    if (typeof window !== 'undefined' && window.URL) {
      return window.URL;
    }
    if (typeof globalThis !== 'undefined' && globalThis.URL) {
      return globalThis.URL;
    }
    return null;
  }
}
