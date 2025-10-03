import { InvoiceManager } from './InvoiceManager.js';
import { ClientManager } from './ClientManager.js';
import { SettingsManager } from './SettingsManager.js';

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const escapeHtml = (value) =>
  sanitizeString(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

const sanitizeEmail = (value) => sanitizeString(value).replace(/[\r\n\s]+/g, '').toLowerCase();

const sanitizeMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br />');

const formatCurrency = (value) => currencyFormatter.format(Number.parseFloat(value) || 0);

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

const toSafeFilename = (value, fallback = 'invoice') => {
  const base = sanitizeString(value) || fallback;
  return base.replace(/[^a-z0-9]+/gi, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || fallback;
};

const getDocumentStyles = () => `
  :root {
    color-scheme: only light;
    font-family: 'Barlow', 'Segoe UI', system-ui, -apple-system, sans-serif;
    line-height: 1.6;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    padding: 32px;
    background: #f5f7fb;
    color: #1f2933;
    font-size: 14px;
  }
  .invoice-document {
    max-width: 840px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
    padding: 40px;
  }
  .invoice-document__header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 32px;
  }
  .invoice-document__identity h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
  }
  .invoice-document__identity p,
  .invoice-document__meta p,
  .invoice-document__billto p {
    margin: 4px 0;
  }
  .invoice-document__meta {
    text-align: right;
  }
  .invoice-document__meta h2 {
    margin: 0 0 8px 0;
    font-size: 20px;
    color: #0f172a;
  }
  .invoice-document__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 24px;
    margin-bottom: 32px;
  }
  .invoice-document__section h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #475569;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  thead th {
    text-align: left;
    background: #0f172a;
    color: #ffffff;
    padding: 12px;
    font-weight: 600;
  }
  tbody td {
    padding: 12px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  .text-right {
    text-align: right;
  }
  .invoice-totals {
    margin-left: auto;
    max-width: 320px;
  }
  .invoice-totals__row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-weight: 600;
  }
  .invoice-totals__row.invoice-totals__row--grand {
    font-size: 18px;
    color: #0f172a;
  }
  .invoice-notes {
    padding: 16px;
    border-radius: 12px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    margin-top: 16px;
  }
  .invoice-notes h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #475569;
  }
  .invoice-footer {
    margin-top: 40px;
    text-align: center;
    font-size: 12px;
    color: #64748b;
  }
  @media print {
    body {
      padding: 0;
      background: #ffffff;
    }
    .invoice-document {
      box-shadow: none;
      border: none;
      border-radius: 0;
    }
  }
`;

const ensureBrowserEnvironment = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('InvoiceDocumentManager requires a browser environment for this operation.');
  }
};

export class InvoiceDocumentManager {
  static #jsPdfLoader = null;

  static buildInvoiceHtml(invoiceOrId, { standalone = true } = {}) {
    const { invoice, client, settings } = InvoiceDocumentManager.#resolveContext(invoiceOrId);
    const businessName = escapeHtml(settings.businessName || 'Invoice');
    const abn = escapeHtml(settings.abn);
    const contactName = escapeHtml(settings.contactName);
    const contactEmail = escapeHtml(settings.contactEmail);
    const contactPhone = escapeHtml(settings.contactPhone);
    const businessAddress = escapeHtml(settings.address);

    const clientBusiness = escapeHtml(client.businessName || client.name || 'Client');
    const clientName = escapeHtml(client.name || '');
    const clientContact = escapeHtml(client.contact || clientName);
    const clientEmail = escapeHtml(client.email || '');
    const clientAddress = escapeHtml(client.address || '');
    const clientAbn = escapeHtml(client.abn || '');

    const issueDate = formatDate(invoice.issueDate);
    const dueDate = formatDate(invoice.dueDate);

    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const lineItemRows = lineItems
      .map((item) => {
        const description = sanitizeMultiline(item.description);
        const quantity = escapeHtml((item.quantity ?? 0).toString());
        const unitPrice = formatCurrency(item.unitPrice ?? 0);
        const gst = item.applyGst ? formatCurrency(item.gst ?? 0) : formatCurrency(0);
        const total = formatCurrency(item.total ?? 0);
        return `
          <tr>
            <td>${description}</td>
            <td class="text-right">${quantity}</td>
            <td class="text-right">${unitPrice}</td>
            <td class="text-right">${gst}</td>
            <td class="text-right">${total}</td>
          </tr>
        `;
      })
      .join('');

    const notesSection = invoice.notes
      ? `
          <section class="invoice-notes" aria-label="Invoice notes">
            <h3>Notes</h3>
            <p>${sanitizeMultiline(invoice.notes)}</p>
          </section>
        `
      : '';

    const footerLines = [businessName, businessAddress, contactPhone, contactEmail]
      .map((line) => line)
      .filter((line) => Boolean(line))
      .join(' · ');

    const tableBody = lineItemRows || `
      <tr>
        <td colspan="5">No line items available.</td>
      </tr>
    `;

    const totalsMarkup = `
      <div class="invoice-totals">
        <div class="invoice-totals__row">
          <span>Subtotal</span>
          <span>${formatCurrency(invoice.subtotal ?? 0)}</span>
        </div>
        <div class="invoice-totals__row">
          <span>GST</span>
          <span>${formatCurrency(invoice.gstTotal ?? 0)}</span>
        </div>
        <div class="invoice-totals__row invoice-totals__row--grand">
          <span>Total</span>
          <span>${formatCurrency(invoice.total ?? 0)}</span>
        </div>
      </div>
    `;

    const documentBody = `
      <div class="invoice-document" role="document" aria-label="Invoice">
        <header class="invoice-document__header">
          <div class="invoice-document__identity">
            <h1>${businessName}</h1>
            ${abn ? `<p>ABN ${abn}</p>` : ''}
            ${businessAddress ? `<p>${businessAddress}</p>` : ''}
            ${contactName ? `<p>Contact: ${contactName}</p>` : ''}
            ${contactEmail ? `<p>Email: ${contactEmail}</p>` : ''}
            ${contactPhone ? `<p>Phone: ${contactPhone}</p>` : ''}
          </div>
          <div class="invoice-document__meta" aria-label="Invoice summary">
            <h2>Invoice</h2>
            <p><strong>Invoice #</strong> ${escapeHtml(invoice.number)}</p>
            ${issueDate ? `<p><strong>Issued</strong> ${escapeHtml(issueDate)}</p>` : ''}
            ${dueDate ? `<p><strong>Due</strong> ${escapeHtml(dueDate)}</p>` : ''}
            ${invoice.status ? `<p><strong>Status</strong> ${escapeHtml(invoice.status)}</p>` : ''}
          </div>
        </header>
        <div class="invoice-document__grid">
          <section class="invoice-document__section invoice-document__billto" aria-label="Bill to">
            <h3>Bill to</h3>
            <p><strong>${clientBusiness}</strong></p>
            ${clientName ? `<p>Attention: ${clientName}</p>` : ''}
            ${clientContact && clientContact !== clientName ? `<p>Contact: ${clientContact}</p>` : ''}
            ${clientAddress ? `<p>${clientAddress}</p>` : ''}
            ${clientAbn ? `<p>ABN ${clientAbn}</p>` : ''}
            ${clientEmail ? `<p>Email: ${clientEmail}</p>` : ''}
          </section>
        </div>
        <table aria-label="Invoice line items">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" class="text-right">Qty</th>
              <th scope="col" class="text-right">Unit price</th>
              <th scope="col" class="text-right">GST</th>
              <th scope="col" class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>
        ${totalsMarkup}
        ${notesSection}
        <footer class="invoice-footer">
          ${footerLines}
        </footer>
      </div>
    `;

    if (!standalone) {
      return `<style>${getDocumentStyles()}</style>${documentBody}`;
    }

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice ${escapeHtml(invoice.number)}</title>
    <style>${getDocumentStyles()}</style>
  </head>
  <body>
    ${documentBody}
  </body>
</html>`;
  }

  static openPrintPreview(invoiceOrId) {
    ensureBrowserEnvironment();
    const html = InvoiceDocumentManager.buildInvoiceHtml(invoiceOrId, { standalone: true });
    const preview = window.open('', '_blank', 'noopener=yes,width=1024,height=768');
    if (!preview) {
      throw new Error('Unable to open a new window for printing.');
    }
    preview.document.open();
    preview.document.write(html);
    preview.document.close();
    preview.focus();
    setTimeout(() => {
      try {
        preview.print();
      } catch (error) {
        console.error('InvoiceDocumentManager: print failed', error);
      }
    }, 300);
  }

  static async downloadPdf(invoiceOrId) {
    ensureBrowserEnvironment();
    const { invoice } = InvoiceDocumentManager.#resolveContext(invoiceOrId);
    const JsPdfConstructor = await InvoiceDocumentManager.#loadJsPdf();
    if (!JsPdfConstructor) {
      InvoiceDocumentManager.openPrintPreview(invoiceOrId);
      return;
    }

    const htmlContent = InvoiceDocumentManager.buildInvoiceHtml(invoiceOrId, { standalone: false });
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '794px';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    try {
      const doc = new JsPdfConstructor({ unit: 'pt', format: 'a4' });
      await new Promise((resolve, reject) => {
        doc.html(container, {
          callback: (pdf) => {
            try {
              pdf.save(`${toSafeFilename(invoice.number || 'invoice')}.pdf`);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          margin: [36, 36, 36, 36],
          autoPaging: 'text',
          html2canvas: { scale: 0.72 },
          x: 0,
          y: 0
        });
      });
    } finally {
      document.body.removeChild(container);
    }
  }

  static generateMailtoLink(invoiceOrId) {
    const { invoice, client, settings } = InvoiceDocumentManager.#resolveContext(invoiceOrId);
    const recipient = sanitizeEmail(client.email || '');
    if (!recipient) {
      return '';
    }

    const businessName = sanitizeString(settings.businessName) || 'Our business';
    const contactName = sanitizeString(settings.contactName) || businessName;
    const dueDate = formatDate(invoice.dueDate);
    const greeting = sanitizeString(client.contact || client.name || 'there');

    const subject = `Invoice ${invoice.number} from ${businessName}`;

    const bodyLines = [
      `Hi ${greeting},`,
      '',
      `Please find attached invoice ${invoice.number} for ${formatCurrency(invoice.total ?? 0)} from ${businessName}.`
    ];

    if (dueDate) {
      bodyLines.push(`The invoice is due on ${dueDate}.`);
    }

    bodyLines.push('', 'If you have any questions, feel free to reach out.');

    const footer = [contactName, sanitizeString(settings.contactPhone), sanitizeString(settings.contactEmail)]
      .filter(Boolean)
      .join('\n');

    if (footer) {
      bodyLines.push('', footer);
    }

    const encodedSubject = encodeURIComponent(subject.replace(/\r?\n/g, ' '));
    const encodedBody = encodeURIComponent(bodyLines.join('\n'));

    return `mailto:${encodeURIComponent(recipient)}?subject=${encodedSubject}&body=${encodedBody}`;
  }

  static #resolveContext(invoiceOrId) {
    const invoice =
      typeof invoiceOrId === 'string' ? InvoiceManager.findById(invoiceOrId) : invoiceOrId;
    if (!invoice) {
      throw new Error('InvoiceDocumentManager: invoice not found.');
    }
    const clientRecord = ClientManager.findById(invoice.clientId);
    const settings = SettingsManager.get();

    const client = {
      businessName: sanitizeString(clientRecord?.businessName) || sanitizeString(invoice.clientBusinessName),
      name: sanitizeString(clientRecord?.name) || sanitizeString(invoice.clientName),
      contact: sanitizeString(clientRecord?.contact),
      address: sanitizeString(clientRecord?.address),
      abn: sanitizeString(clientRecord?.abn),
      email: sanitizeEmail(clientRecord?.email)
    };

    return { invoice, client, settings };
  }

  static async #loadJsPdf() {
    if (InvoiceDocumentManager.#jsPdfLoader) {
      return InvoiceDocumentManager.#jsPdfLoader;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    InvoiceDocumentManager.#jsPdfLoader = import(
      /* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
    )
      .then((module) => module.jsPDF || module.default?.jsPDF || null)
      .catch((error) => {
        console.error('Failed to load jsPDF from CDN:', error);
        return null;
      });

    return InvoiceDocumentManager.#jsPdfLoader;
  }
}
