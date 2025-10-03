import { ClientManager } from './ClientManager.js';
import { SettingsManager } from './SettingsManager.js';

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const formatDate = (value) => {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  return new Date(timestamp).toLocaleDateString();
};

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatCurrency = (value) => currencyFormatter.format(Number.parseFloat(value) || 0);

const escapeHtml = (value) =>
  sanitizeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br />');

const resolveClient = (invoice, explicitClient) => {
  if (explicitClient) {
    return explicitClient;
  }
  const fallback = ClientManager.findById(invoice?.clientId);
  if (fallback) {
    return fallback;
  }
  return {
    id: sanitizeString(invoice?.clientId),
    name: sanitizeString(invoice?.clientName) || 'Valued client',
    businessName: sanitizeString(invoice?.clientBusinessName) || '',
    email: '',
    address: '',
    abn: '',
    contact: ''
  };
};

const resolveSettings = (providedSettings) => {
  if (providedSettings && typeof providedSettings === 'object') {
    return providedSettings;
  }
  return SettingsManager.get();
};

export class InvoiceDocumentManager {
  static buildPrintableHtml(invoice, client, settings) {
    if (!invoice || typeof invoice !== 'object') {
      throw new Error('InvoiceDocumentManager: invoice payload is required.');
    }

    const resolvedClient = resolveClient(invoice, client);
    const resolvedSettings = resolveSettings(settings);

    const clientBlock = [
      resolvedClient.businessName || resolvedClient.name,
      resolvedClient.name !== resolvedClient.businessName ? resolvedClient.name : '',
      resolvedClient.address,
      resolvedClient.abn ? `ABN: ${resolvedClient.abn}` : ''
    ]
      .map((part) => sanitizeString(part))
      .filter(Boolean)
      .join('<br />');

    const senderBlock = [
      resolvedSettings.businessName,
      resolvedSettings.contactName,
      resolvedSettings.address,
      resolvedSettings.contactEmail,
      resolvedSettings.contactPhone,
      resolvedSettings.abn ? `ABN: ${resolvedSettings.abn}` : ''
    ]
      .map((part) => sanitizeString(part))
      .filter(Boolean)
      .join('<br />');

    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const lineRows = lineItems
      .map((item, index) => {
        const quantity = Number.parseFloat(item.quantity) || 0;
        const unitPrice = Number.parseFloat(item.unitPrice) || 0;
        const subtotal = Number.parseFloat(item.subtotal ?? quantity * unitPrice) || 0;
        const gst = Number.parseFloat(item.gst ?? 0) || 0;
        const total = Number.parseFloat(item.total ?? subtotal + gst) || 0;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.description)}</td>
            <td>${quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
            <td>${formatCurrency(unitPrice)}</td>
            <td>${formatCurrency(subtotal)}</td>
            <td>${gst > 0 ? formatCurrency(gst) : '-'}</td>
            <td>${formatCurrency(total)}</td>
          </tr>
        `;
      })
      .join('');

    const notesBlock = sanitizeString(invoice.notes)
      ? `<section class="notes"><h2>Notes</h2><p>${formatMultiline(invoice.notes)}</p></section>`
      : '';

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${escapeHtml(invoice.number)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: 'Barlow', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        --border: rgba(0, 0, 0, 0.15);
      }
      body {
        margin: 0;
        padding: 32px;
        font-size: 14px;
        line-height: 1.6;
        color: #1b1b23;
        background: #f5f7fb;
      }
      @media (prefers-color-scheme: dark) {
        body {
          color: #f6f7fb;
          background: #06060d;
        }
        .card {
          background: #111123;
          border-color: rgba(255,255,255,0.12);
        }
        table {
          border-color: rgba(255,255,255,0.12);
        }
      }
      h1, h2, h3 {
        margin: 0 0 12px;
      }
      h1 {
        font-size: 28px;
      }
      h2 {
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        flex-wrap: wrap;
        margin-bottom: 32px;
      }
      .card {
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 16px 40px rgba(9, 9, 16, 0.12);
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin-bottom: 32px;
      }
      .meta div {
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: rgba(255,255,255,0.6);
      }
      .meta strong {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid var(--border);
      }
      th, td {
        padding: 12px;
        border-bottom: 1px solid var(--border);
        text-align: left;
      }
      th {
        background: rgba(9, 9, 16, 0.04);
        font-weight: 600;
      }
      tfoot td {
        font-weight: 600;
      }
      .totals {
        margin-top: 24px;
        display: flex;
        justify-content: flex-end;
      }
      .totals table {
        width: auto;
        min-width: 260px;
      }
      .notes {
        margin-top: 32px;
      }
      .notes p {
        margin: 0;
        white-space: pre-wrap;
      }
      @media print {
        body {
          padding: 0;
          background: #fff;
        }
        .card {
          box-shadow: none;
          border: none;
          padding: 0;
        }
        .meta div {
          background: transparent;
        }
      }
    </style>
  </head>
  <body>
    <article class="card">
      <header class="header">
        <div>
          <h1>Invoice ${escapeHtml(invoice.number)}</h1>
          <p>Issued ${formatDate(invoice.issueDate)}${invoice.dueDate ? ` · Due ${formatDate(invoice.dueDate)}` : ''}</p>
        </div>
        <div style="text-align:right;">
          ${senderBlock || ''}
        </div>
      </header>

      <section class="meta">
        <div>
          <strong>Billed to</strong>
          <div>${clientBlock || escapeHtml(resolvedClient.name)}</div>
        </div>
        <div>
          <strong>Invoice amount</strong>
          <div>${formatCurrency(invoice.total)}</div>
        </div>
        <div>
          <strong>Status</strong>
          <div>${escapeHtml(invoice.status || 'Unpaid')}</div>
        </div>
      </section>

      <section>
        <h2>Line items</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Subtotal</th>
              <th>GST</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineRows || '<tr><td colspan="7">No line items recorded.</td></tr>'}
          </tbody>
        </table>
      </section>

      <section class="totals">
        <table>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>${formatCurrency(invoice.subtotal ?? invoice.total)}</td>
            </tr>
            <tr>
              <td>GST</td>
              <td>${formatCurrency(invoice.gstTotal ?? 0)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total due</td>
              <td>${formatCurrency(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      ${notesBlock}
    </article>
  </body>
</html>`;
  }

  static printInvoice(invoice, client, settings) {
    if (typeof window === 'undefined') {
      throw new Error('Invoice printing is only available in a browser environment.');
    }
    const html = InvoiceDocumentManager.buildPrintableHtml(invoice, client, settings);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200');
    if (!printWindow) {
      throw new Error('Unable to open print window. Please allow pop-ups for this site.');
    }

    const triggerPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        console.error('InvoiceDocumentManager.printInvoice failed to trigger print:', error);
      }
    };

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    if (printWindow.document.readyState === 'complete') {
      setTimeout(triggerPrint, 150);
    } else {
      printWindow.addEventListener('load', triggerPrint, { once: true });
      setTimeout(triggerPrint, 300);
    }
  }

  static getMailtoPayload(invoice, client, settings) {
    if (!invoice || typeof invoice !== 'object') {
      throw new Error('InvoiceDocumentManager: invoice payload is required.');
    }
    const resolvedClient = resolveClient(invoice, client);
    if (!resolvedClient.email) {
      throw new Error('InvoiceDocumentManager: client email is required to compose a message.');
    }
    const resolvedSettings = resolveSettings(settings);
    const businessName = sanitizeString(resolvedSettings.businessName) || 'Zantra Invoicing';
    const subject = `${businessName} · Invoice ${sanitizeString(invoice.number)}`.trim();
    const greetingName = sanitizeString(resolvedClient.contact || resolvedClient.name || resolvedClient.businessName);
    const greeting = greetingName ? `Hi ${greetingName},` : 'Hello,';
    const dueLine = invoice.dueDate ? `This invoice is due on ${formatDate(invoice.dueDate)}.` : '';
    const lines = [
      greeting,
      '',
      `Please find invoice ${sanitizeString(invoice.number)} for ${formatCurrency(invoice.total)}.`,
      dueLine,
      '',
      sanitizeString(resolvedSettings.contactName)
        ? `${resolvedSettings.contactName}\n${businessName}`
        : businessName
    ];
    const body = lines.filter(Boolean).join('\n');
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    const href = `mailto:${encodeURIComponent(resolvedClient.email)}?subject=${encodedSubject}&body=${encodedBody}`;
    return {
      to: resolvedClient.email,
      subject,
      body,
      href
    };
  }

  static emailInvoice(invoice, client, settings) {
    if (typeof window === 'undefined') {
      throw new Error('Invoice emailing is only available in a browser environment.');
    }
    const payload = InvoiceDocumentManager.getMailtoPayload(invoice, client, settings);
    window.location.href = payload.href;
    return payload;
  }
}

export default InvoiceDocumentManager;
