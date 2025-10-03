const loadStyles = async () => {
  if (typeof document === 'undefined') {
    return;
  }
  await import('../styles/styles.css');
};

loadStyles();
import { DataManager } from './data/DataManager.js';
import { ClientManager } from './managers/ClientManager.js';
import { ServiceManager } from './managers/ServiceManager.js';
import { InvoiceManager } from './managers/InvoiceManager.js';
import { QuoteManager } from './managers/QuoteManager.js';
import { PaymentManager } from './managers/PaymentManager.js';
import { ReportManager } from './managers/ReportManager.js';
import { ExportManager } from './managers/ExportManager.js';
import { SettingsManager } from './managers/SettingsManager.js';

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

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

const parseNumberInput = (input) => {
  if (!input) {
    return 0;
  }
  const numeric = Number.parseFloat(input.value || input.textContent || '0');
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return 0;
  }
  return numeric;
};

const clearChildren = (element) => {
  while (element?.firstChild) {
    element.removeChild(element.firstChild);
  }
};

const toggleHidden = (element, hidden) => {
  if (!element) {
    return;
  }
  if (hidden) {
    element.setAttribute('hidden', '');
  } else {
    element.removeAttribute('hidden');
  }
};

const setDateInputValue = (input, value) => {
  if (!input) {
    return;
  }
  if (!value) {
    input.value = '';
    return;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    input.value = '';
    return;
  }
  if ('valueAsDate' in input) {
    input.valueAsDate = date;
  } else {
    input.value = date.toISOString().slice(0, 10);
  }
};

const getLineItemTemplate = () => {
  const template = document.getElementById('line-item-template');
  if (!template) {
    throw new Error('Missing line item template in the document.');
  }
  return template;
};

class LineItemEditor {
  constructor(formElement, { onTotalsChange, services = [], gstRate = 0.1 }) {
    this.form = formElement;
    this.container = formElement.querySelector('[data-line-items-body]');
    this.onTotalsChange = typeof onTotalsChange === 'function' ? onTotalsChange : () => {};
    this.services = services;
    this.gstRate = gstRate;
    this.type = formElement.getAttribute('data-form');
    this.handleInputChange = this.handleInputChange.bind(this);
    this.handleRemoveClick = this.handleRemoveClick.bind(this);
  }

  refreshServices(services) {
    this.services = Array.isArray(services) ? services : [];
    this.container.querySelectorAll('[data-field="service"]').forEach((select) => {
      this.populateServiceOptions(select, select.value);
    });
  }

  populateServiceOptions(select, selectedId) {
    if (!select) {
      return;
    }
    const resolvedId = typeof selectedId === 'string' ? selectedId : '';
    clearChildren(select);
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Custom item';
    select.appendChild(defaultOption);

    let foundSelected = false;
    this.services.forEach((service) => {
      const option = document.createElement('option');
      option.value = service.id;
      option.textContent = `${service.description} (${formatCurrency(service.unitPrice)})`;
      if (service.id === resolvedId) {
        option.selected = true;
        foundSelected = true;
      }
      select.appendChild(option);
    });

    if (resolvedId && !foundSelected) {
      const archivedOption = document.createElement('option');
      archivedOption.value = resolvedId;
      archivedOption.textContent = 'Archived service';
      archivedOption.selected = true;
      select.appendChild(archivedOption);
    }
  }

  addRow(initial = {}) {
    if (!this.container) {
      return;
    }
    const template = getLineItemTemplate();
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.line-item-row');
    if (!row) {
      return;
    }
    const serviceSelect = row.querySelector('[data-field="service"]');
    const descriptionInput = row.querySelector('[data-field="description"]');
    const quantityInput = row.querySelector('[data-field="quantity"]');
    const priceInput = row.querySelector('[data-field="unitPrice"]');
    const gstCheckbox = row.querySelector('[data-field="gst"]');

    this.populateServiceOptions(serviceSelect, initial.serviceId);

    if (initial.serviceId) {
      serviceSelect.value = initial.serviceId;
    }
    if (initial.description !== undefined) {
      descriptionInput.value = initial.description;
    }
    const quantityValue = Number.parseFloat(initial.quantity);
    if (!Number.isNaN(quantityValue) && quantityValue > 0) {
      quantityInput.value = quantityValue;
    } else {
      quantityInput.value = 1;
    }
    if (initial.unitPrice !== undefined && initial.unitPrice !== null && initial.unitPrice !== '') {
      priceInput.value = initial.unitPrice;
    }
    gstCheckbox.checked = initial.applyGst !== undefined ? Boolean(initial.applyGst) : true;

    row.addEventListener('input', this.handleInputChange);
    row.addEventListener('change', this.handleInputChange);
    row.querySelector('[data-action="remove-line"]').addEventListener('click', this.handleRemoveClick);
    serviceSelect.addEventListener('change', () => {
      const service = this.services.find((item) => item.id === serviceSelect.value);
      if (service) {
        descriptionInput.value = service.description;
        priceInput.value = service.unitPrice;
        gstCheckbox.checked = true;
        if (!quantityInput.value) {
          quantityInput.value = 1;
        }
      }
      this.updateLineTotal(row);
      this.emitTotals();
    });

    this.container.appendChild(row);
    this.updateLineTotal(row);
    this.emitTotals();
  }

  removeAll() {
    clearChildren(this.container);
    this.emitTotals();
  }

  handleInputChange(event) {
    const row = event.currentTarget.closest('.line-item-row');
    if (!row) {
      return;
    }
    this.updateLineTotal(row);
    this.emitTotals();
  }

  handleRemoveClick(event) {
    event.preventDefault();
    const row = event.currentTarget.closest('.line-item-row');
    if (!row) {
      return;
    }
    row.removeEventListener('input', this.handleInputChange);
    row.removeEventListener('change', this.handleInputChange);
    row.remove();
    this.emitTotals();
  }

  updateLineTotal(row) {
    const quantity = parseNumberInput(row.querySelector('[data-field="quantity"]'));
    const unitPrice = parseNumberInput(row.querySelector('[data-field="unitPrice"]'));
    const applyGst = row.querySelector('[data-field="gst"]').checked;
    const subtotal = Math.round(quantity * unitPrice * 100) / 100;
    const gst = applyGst ? Math.round(subtotal * this.gstRate * 100) / 100 : 0;
    const total = subtotal + gst;
    const display = row.querySelector('[data-field="lineTotal"]');
    if (display) {
      display.textContent = formatCurrency(total);
    }
  }

  emitTotals() {
    const items = this.getItems();
    this.onTotalsChange(items);
  }

  getItems() {
    const rows = Array.from(this.container.querySelectorAll('.line-item-row'));
    return rows
      .map((row) => {
        const description = row.querySelector('[data-field="description"]').value.trim();
        const quantity = parseNumberInput(row.querySelector('[data-field="quantity"]'));
        const unitPrice = parseNumberInput(row.querySelector('[data-field="unitPrice"]'));
        const applyGst = row.querySelector('[data-field="gst"]').checked;
        const serviceId = row.querySelector('[data-field="service"]').value.trim();
        if (!description || quantity <= 0) {
          return null;
        }
        return {
          serviceId: serviceId || undefined,
          description,
          quantity,
          unitPrice,
          applyGst
        };
      })
      .filter(Boolean);
  }
}

class ZantraApp {
  constructor() {
    this.state = {
      clients: [],
      services: [],
      invoices: [],
      quotes: [],
      payments: [],
      settings: SettingsManager.get()
    };
    this.reportChart = null;
    this.invoiceFormInitialized = false;
    this.quoteFormInitialized = false;
    this.clientFormInitialized = false;
    this.serviceFormInitialized = false;
    this.settingsFormInitialized = false;
    this.gstExportInitialized = false;
    this.toastDismissTimeout = null;
    this.handleQuoteListClick = this.handleQuoteListClick.bind(this);
    this.handleGstExportDownload = this.handleGstExportDownload.bind(this);
  }

  init() {
    this.cacheDom();
    this.setupNavigation();
    this.bindHeaderActions();
    this.refreshData();
    this.renderAll();
    this.exposeGlobals();
  }

  cacheDom() {
    this.root = document.documentElement;
    this.sections = new Map();
    document.querySelectorAll('main section[role="tabpanel"]').forEach((section) => {
      this.sections.set(section.id, section);
    });

    this.tablist = document.querySelector('.tabs');
    this.tabButtons = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
    this.resumeSetupButton = document.querySelector('.resume-setup-btn');
    this.newInvoiceButton = document.querySelector('.new-invoice-btn');
    this.sectionInvoiceButtons = Array.from(document.querySelectorAll('[data-action="open-invoice-form"]'));
    this.newQuoteButton = document.querySelector('[data-action="open-quote-form"]');

    this.dashboardMetrics = {
      openJobs: document.querySelector('[data-dashboard-value="openJobs"]'),
      invoicesDue: document.querySelector('[data-dashboard-value="invoicesDue"]'),
      quoteApproval: document.querySelector('[data-dashboard-value="quoteApproval"]'),
      paymentTime: document.querySelector('[data-dashboard-value="paymentTime"]')
    };

    this.dashboardOutstandingList = document.querySelector('[data-dashboard-outstanding]');

    this.invoiceForm = document.querySelector('#invoice-form');
    this.invoiceListBody = document.querySelector('[data-table="invoices"] tbody');

    this.quoteForm = document.querySelector('#quote-form');
    this.quoteListBody = document.querySelector('[data-table="quotes"] tbody');

    this.clientForm = document.querySelector('#client-form');
    this.clientListBody = document.querySelector('[data-table="clients"] tbody');

    this.serviceForm = document.querySelector('#service-form');
    this.serviceListBody = document.querySelector('[data-table="services"] tbody');

    this.paymentOutstandingBody = document.querySelector('[data-table="payments-outstanding"] tbody');
    this.paymentHistoryBody = document.querySelector('[data-table="payments-history"] tbody');

    this.settingsForm = document.querySelector('#settings-form');
    this.reportCanvas = document.getElementById('reports-chart');
    this.gstExportForm = document.querySelector('[data-gst-export-form]');
    this.gstExportStartInput = this.gstExportForm?.querySelector('[data-gst-export-start]') ?? null;
    this.gstExportEndInput = this.gstExportForm?.querySelector('[data-gst-export-end]') ?? null;
    this.gstExportFeedback = this.gstExportForm?.querySelector('[data-gst-export-feedback]') ?? null;
    this.gstExportButton = this.gstExportForm?.querySelector('[data-action="download-gst-csv"]') ?? null;

    this.toastRegion = document.querySelector('[data-toast-region]');

    this.invoiceFormEditor = new LineItemEditor(this.invoiceForm, {
      onTotalsChange: (items) => this.updateInvoiceTotals(items),
      services: this.state.services,
      gstRate: this.state.settings.gstRate
    });
    this.quoteFormEditor = new LineItemEditor(this.quoteForm, {
      onTotalsChange: (items) => this.updateQuoteTotals(items),
      services: this.state.services,
      gstRate: this.state.settings.gstRate
    });

    if (this.quoteListBody) {
      this.quoteListBody.addEventListener('click', this.handleQuoteListClick);
    }
  }

  setupNavigation() {
    const activateSection = (sectionId, focusTab = false) => {
      if (!sectionId || !this.sections.has(sectionId)) {
        return;
      }
      this.sections.forEach((section, id) => {
        const isActive = id === sectionId;
        section.classList.toggle('is-active', isActive);
        section.setAttribute('aria-hidden', String(!isActive));
        section.toggleAttribute('hidden', !isActive);
      });
      this.tabButtons.forEach((tab) => {
        const controls = tab.getAttribute('aria-controls');
        const isActive = controls === sectionId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
        if (isActive && focusTab) {
          tab.focus();
        }
      });
    };

    const focusTabByIndex = (index) => {
      if (!this.tabButtons.length) {
        return;
      }
      const normalizedIndex = (index + this.tabButtons.length) % this.tabButtons.length;
      const targetTab = this.tabButtons[normalizedIndex];
      const sectionId = targetTab?.getAttribute('aria-controls');
      if (sectionId) {
        activateSection(sectionId, true);
      }
    };

    this.tabButtons.forEach((tab, index) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        const sectionId = tab.getAttribute('aria-controls');
        activateSection(sectionId, true);
      });
      tab.addEventListener('keydown', (event) => {
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            event.preventDefault();
            focusTabByIndex(index + 1);
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            event.preventDefault();
            focusTabByIndex(index - 1);
            break;
          case 'Home':
            event.preventDefault();
            focusTabByIndex(0);
            break;
          case 'End':
            event.preventDefault();
            focusTabByIndex(this.tabButtons.length - 1);
            break;
          default:
            break;
        }
      });
    });

    const defaultTab = this.tabButtons.find((tab) => tab.classList.contains('active')) ?? this.tabButtons[0];
    if (defaultTab) {
      activateSection(defaultTab.getAttribute('aria-controls'));
    }

    this.activateSection = activateSection;
  }

  bindHeaderActions() {
    if (this.resumeSetupButton) {
      this.resumeSetupButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.activateSection('settings');
        const focusTarget = this.settingsForm?.querySelector('input, select, textarea');
        focusTarget?.focus();
      });
    }
    if (this.newInvoiceButton) {
      this.newInvoiceButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.activateSection('invoices');
        this.toggleInvoiceForm(true);
      });
    }
    if (this.sectionInvoiceButtons.length) {
      this.sectionInvoiceButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          this.activateSection('invoices');
          this.toggleInvoiceForm(true);
        });
      });
    }
    if (this.newQuoteButton) {
      this.newQuoteButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.activateSection('quotes');
        this.toggleQuoteForm(true);
      });
    }
  }

  refreshData() {
    this.state.clients = ClientManager.list();
    this.state.services = ServiceManager.list();
    this.state.invoices = InvoiceManager.list().map((invoice) => ({
      ...invoice,
      type: invoice.type || 'invoice'
    }));
    this.state.quotes = QuoteManager.list().map((quote) => ({
      ...quote,
      type: quote.type || 'quote'
    }));
    this.state.payments = PaymentManager.list();
    this.state.settings = SettingsManager.get();

    this.invoiceFormEditor.refreshServices(this.state.services);
    this.quoteFormEditor.refreshServices(this.state.services);
    this.invoiceFormEditor.gstRate = this.state.settings.gstRate;
    this.quoteFormEditor.gstRate = this.state.settings.gstRate;
  }

  renderAll() {
    this.renderDashboard();
    this.renderInvoices();
    this.renderQuotes();
    this.renderClients();
    this.renderServices();
    this.renderPayments();
    this.renderReports();
    this.renderSettings();
  }

  renderDashboard() {
    const metrics = ReportManager.getDashboardMetrics();
    if (this.dashboardMetrics.openJobs) {
      this.dashboardMetrics.openJobs.textContent = metrics.openJobs.toString();
    }
    if (this.dashboardMetrics.invoicesDue) {
      this.dashboardMetrics.invoicesDue.textContent = `${formatCurrency(metrics.invoicesDueAmount)} · ${metrics.outstandingInvoiceCount} invoices`;
    }
    if (this.dashboardMetrics.quoteApproval) {
      this.dashboardMetrics.quoteApproval.textContent = `${metrics.quoteApprovalRate.toFixed(1)}%`;
    }
    if (this.dashboardMetrics.paymentTime) {
      this.dashboardMetrics.paymentTime.textContent = `${metrics.averagePaymentTime} days`;
    }

    if (this.dashboardOutstandingList) {
      clearChildren(this.dashboardOutstandingList);
      const outstanding = this.state.invoices.filter((invoice) => (invoice.balanceDue ?? invoice.total) > 0);
      if (!outstanding.length) {
        const empty = document.createElement('li');
        empty.textContent = 'All invoices are paid.';
        this.dashboardOutstandingList.appendChild(empty);
      } else {
        outstanding.slice(0, 5).forEach((invoice) => {
          const item = document.createElement('li');
          const balance = invoice.balanceDue ?? invoice.total;
          item.innerHTML = `<strong>${invoice.number}</strong> · ${invoice.clientName} · Due ${formatDate(
            invoice.dueDate
          )} · ${formatCurrency(balance)}`;
          this.dashboardOutstandingList.appendChild(item);
        });
      }
    }
  }

  toggleInvoiceForm(visible, invoice = null) {
    if (!this.invoiceForm) {
      return;
    }
    const feedback = this.invoiceForm.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }
    const idField = this.invoiceForm.querySelector('[name="invoiceId"]');
    if (!visible) {
      this.invoiceFormEditor.removeAll();
      this.invoiceForm.reset();
      this.updateInvoiceTotals([]);
      toggleHidden(this.invoiceForm, true);
      if (idField) {
        idField.value = '';
      }
      delete this.invoiceForm.dataset.mode;
      return;
    }

    toggleHidden(this.invoiceForm, false);
    this.invoiceForm.reset();
    this.invoiceFormEditor.removeAll();

    if (invoice) {
      this.invoiceForm.dataset.mode = 'edit';
      if (idField) {
        idField.value = invoice.id;
      }
      this.populateInvoiceForm(invoice);
    } else {
      this.invoiceForm.dataset.mode = 'create';
      if (idField) {
        idField.value = '';
      }
      this.invoiceFormEditor.addRow();
      const issueInput = this.invoiceForm.querySelector('[name="issueDate"]');
      const dueInput = this.invoiceForm.querySelector('[name="dueDate"]');
      setDateInputValue(issueInput, new Date());
      const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      setDateInputValue(dueInput, dueDate);
      this.updateInvoiceTotals(this.invoiceFormEditor.getItems());
    }

    const clientSelect = this.invoiceForm.querySelector('[name="clientId"]');
    if (clientSelect) {
      clientSelect.value = invoice ? invoice.clientId : '';
      clientSelect.focus();
    }

    this.invoiceForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  populateInvoiceForm(invoice) {
    if (!invoice || !this.invoiceForm) {
      return;
    }
    const issueInput = this.invoiceForm.querySelector('[name="issueDate"]');
    const dueInput = this.invoiceForm.querySelector('[name="dueDate"]');
    const notesInput = this.invoiceForm.querySelector('[name="notes"]');
    setDateInputValue(issueInput, invoice.issueDate);
    setDateInputValue(dueInput, invoice.dueDate);
    if (notesInput) {
      notesInput.value = invoice.notes || '';
    }

    if (Array.isArray(invoice.lineItems) && invoice.lineItems.length) {
      invoice.lineItems.forEach((item) => {
        this.invoiceFormEditor.addRow({
          serviceId: item.serviceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          applyGst: item.applyGst
        });
      });
    } else {
      this.invoiceFormEditor.addRow();
    }
    this.updateInvoiceTotals(invoice.lineItems || []);
  }

  toggleQuoteForm(visible, quote = null) {
    if (!this.quoteForm) {
      return;
    }
    const feedback = this.quoteForm.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }
    const idField = this.quoteForm.querySelector('[name="quoteId"]');
    if (!visible) {
      this.quoteFormEditor.removeAll();
      this.quoteForm.reset();
      this.updateQuoteTotals([]);
      toggleHidden(this.quoteForm, true);
      if (idField) {
        idField.value = '';
      }
      delete this.quoteForm.dataset.mode;
      return;
    }

    toggleHidden(this.quoteForm, false);
    this.quoteForm.reset();
    this.quoteFormEditor.removeAll();

    if (quote) {
      this.quoteForm.dataset.mode = 'edit';
      if (idField) {
        idField.value = quote.id;
      }
      this.populateQuoteForm(quote);
    } else {
      this.quoteForm.dataset.mode = 'create';
      if (idField) {
        idField.value = '';
      }
      this.quoteFormEditor.addRow();
      const issueInput = this.quoteForm.querySelector('[name="issueDate"]');
      const validInput = this.quoteForm.querySelector('[name="validUntil"]');
      setDateInputValue(issueInput, new Date());
      const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      setDateInputValue(validInput, validDate);
      this.updateQuoteTotals(this.quoteFormEditor.getItems());
    }

    const clientSelect = this.quoteForm.querySelector('[name="clientId"]');
    if (clientSelect) {
      clientSelect.value = quote ? quote.clientId : '';
      clientSelect.focus();
    }

    this.quoteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  populateQuoteForm(quote) {
    if (!quote || !this.quoteForm) {
      return;
    }
    const issueInput = this.quoteForm.querySelector('[name="issueDate"]');
    const validInput = this.quoteForm.querySelector('[name="validUntil"]');
    const notesInput = this.quoteForm.querySelector('[name="notes"]');
    setDateInputValue(issueInput, quote.issueDate);
    setDateInputValue(validInput, quote.validUntil);
    if (notesInput) {
      notesInput.value = quote.notes || '';
    }

    if (Array.isArray(quote.lineItems) && quote.lineItems.length) {
      quote.lineItems.forEach((item) => {
        this.quoteFormEditor.addRow({
          serviceId: item.serviceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          applyGst: item.applyGst
        });
      });
    } else {
      this.quoteFormEditor.addRow();
    }
    this.updateQuoteTotals(quote.lineItems || []);
  }

  updateInvoiceTotals(items) {
    const totals = InvoiceManager.calculateTotals(items, this.state.settings.gstRate);
    const subtotal = this.invoiceForm.querySelector('[data-total="subtotal"]');
    const gst = this.invoiceForm.querySelector('[data-total="gst"]');
    const total = this.invoiceForm.querySelector('[data-total="total"]');
    if (subtotal) subtotal.textContent = formatCurrency(totals.subtotal);
    if (gst) gst.textContent = formatCurrency(totals.gstTotal);
    if (total) total.textContent = formatCurrency(totals.total);
  }

  renderInvoices() {
    if (!this.invoiceForm || !this.invoiceListBody) {
      return;
    }

    const clientSelect = this.invoiceForm.querySelector('[name="clientId"]');
    if (clientSelect) {
      clearChildren(clientSelect);
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select client';
      clientSelect.appendChild(placeholder);
      this.state.clients.forEach((client) => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.businessName} (${client.name})`;
        clientSelect.appendChild(option);
      });
    }

    if (!this.invoiceFormInitialized) {
      this.invoiceForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleInvoiceSubmit();
      });
      this.invoiceForm.querySelector('[data-action="add-line"]').addEventListener('click', (event) => {
        event.preventDefault();
        this.invoiceFormEditor.addRow();
      });
      this.invoiceForm.querySelector('[data-action="cancel"]').addEventListener('click', (event) => {
        event.preventDefault();
        this.toggleInvoiceForm(false);
      });
      this.invoiceFormInitialized = true;
    }

    clearChildren(this.invoiceListBody);
    if (!this.state.invoices.length) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No invoices recorded yet.';
      emptyRow.appendChild(cell);
      this.invoiceListBody.appendChild(emptyRow);
    } else {
      this.state.invoices
        .sort((a, b) => Date.parse(b.issueDate) - Date.parse(a.issueDate))
        .forEach((invoice) => {
          const row = document.createElement('tr');
          let statusMarkup = `<span class="status-pill status-pill--warning">Unpaid</span>`;
          if (invoice.status === 'paid') {
            statusMarkup = `<span class="status-pill status-pill--success">Paid</span>`;
          } else if (invoice.status === 'partial') {
            statusMarkup = `<span class="status-pill status-pill--info">Partial</span>`;
          }
          const balanceMeta =
            invoice.status !== 'paid' && (invoice.balanceDue ?? invoice.total) > 0
              ? `<div class="status-meta">Balance ${formatCurrency(invoice.balanceDue ?? invoice.total)}</div>`
              : '';
          const actions = [
            `<button class="btn btn--sm btn--ghost" data-action="edit" data-id="${invoice.id}">Edit</button>`,
            (invoice.balanceDue ?? invoice.total) > 0
              ? `<button class="btn btn--sm btn--primary" data-action="mark-paid" data-id="${invoice.id}">Mark paid</button>`
              : '',
            `<button class="btn btn--sm btn--destructive" data-action="delete" data-id="${invoice.id}">Delete</button>`
          ]
            .filter(Boolean)
            .join('');
          const paidMeta =
            invoice.status === 'paid' && invoice.paidAt
              ? `<div class="status-meta">Paid ${formatDate(invoice.paidAt)}</div>`
              : '';
          row.innerHTML = `
            <td>${invoice.number}</td>
            <td>${invoice.clientName}</td>
            <td>${formatDate(invoice.issueDate)}</td>
            <td>${formatDate(invoice.dueDate)}</td>
            <td>${formatCurrency(invoice.total)}</td>
            <td>${statusMarkup}${paidMeta}${balanceMeta}</td>
            <td class="text-right">
              <div class="table-actions">${actions}</div>
            </td>
          `;
          this.invoiceListBody.appendChild(row);
        });

      this.invoiceListBody.querySelectorAll('[data-action="mark-paid"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const invoiceId = button.getAttribute('data-id');
          try {
            const invoice = this.state.invoices.find((item) => item.id === invoiceId);
            if (!invoice) {
              return;
            }
            const amountDue = invoice.balanceDue ?? invoice.total;
            if (amountDue <= 0) {
              return;
            }
            PaymentManager.recordPayment(invoiceId, amountDue, new Date());
            this.refreshData();
            this.renderAll();
          } catch (error) {
            console.error(error);
          }
        });
      });

      this.invoiceListBody.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const invoiceId = button.getAttribute('data-id');
          const invoice = this.state.invoices.find((item) => item.id === invoiceId);
          if (!invoice) {
            return;
          }
          this.activateSection('invoices');
          this.toggleInvoiceForm(true, invoice);
        });
      });

      this.invoiceListBody.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const invoiceId = button.getAttribute('data-id');
          InvoiceManager.remove(invoiceId);
          this.refreshData();
          this.renderAll();
        });
      });
    }
  }

  handleInvoiceSubmit() {
    const form = this.invoiceForm;
    const invoiceId = form.querySelector('[name="invoiceId"]').value;
    const clientId = form.querySelector('[name="clientId"]').value;
    const issueDate = form.querySelector('[name="issueDate"]').value;
    const dueDate = form.querySelector('[name="dueDate"]').value;
    const notes = form.querySelector('[name="notes"]').value;
    const items = this.invoiceFormEditor.getItems();
    const feedback = form.querySelector('[data-feedback]');

    if (feedback) {
      feedback.textContent = '';
    }

    try {
      if (!clientId) {
        throw new Error('Please select a client for the invoice.');
      }
      if (!items.length) {
        throw new Error('Add at least one line item before saving.');
      }
      if (invoiceId) {
        InvoiceManager.update(invoiceId, {
          clientId,
          issueDate,
          dueDate,
          notes,
          lineItems: items
        });
      } else {
        InvoiceManager.create({
          clientId,
          issueDate,
          dueDate,
          notes,
          lineItems: items
        });
      }
      this.toggleInvoiceForm(false);
      this.refreshData();
      this.renderAll();
    } catch (error) {
      console.error(error);
      if (feedback) {
        feedback.textContent = error.message;
      }
    }
  }

  updateQuoteTotals(items) {
    const totals = QuoteManager.calculateTotals(items, this.state.settings.gstRate);
    const subtotal = this.quoteForm.querySelector('[data-total="subtotal"]');
    const gst = this.quoteForm.querySelector('[data-total="gst"]');
    const total = this.quoteForm.querySelector('[data-total="total"]');
    if (subtotal) subtotal.textContent = formatCurrency(totals.subtotal);
    if (gst) gst.textContent = formatCurrency(totals.gstTotal);
    if (total) total.textContent = formatCurrency(totals.total);
  }

  renderQuotes() {
    if (!this.quoteForm || !this.quoteListBody) {
      return;
    }

    const clientSelect = this.quoteForm.querySelector('[name="clientId"]');
    if (clientSelect) {
      clearChildren(clientSelect);
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select client';
      clientSelect.appendChild(placeholder);
      this.state.clients.forEach((client) => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.businessName} (${client.name})`;
        clientSelect.appendChild(option);
      });
    }

    if (!this.quoteFormInitialized) {
      this.quoteForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleQuoteSubmit();
      });
      this.quoteForm.querySelector('[data-action="add-line"]').addEventListener('click', (event) => {
        event.preventDefault();
        this.quoteFormEditor.addRow();
      });
      this.quoteForm.querySelector('[data-action="cancel"]').addEventListener('click', (event) => {
        event.preventDefault();
        this.toggleQuoteForm(false);
      });
      this.quoteFormInitialized = true;
    }

    clearChildren(this.quoteListBody);
    if (!this.state.quotes.length) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No quotes recorded yet.';
      emptyRow.appendChild(cell);
      this.quoteListBody.appendChild(emptyRow);
    } else {
      this.state.quotes
        .sort((a, b) => Date.parse(b.issueDate) - Date.parse(a.issueDate))
        .forEach((quote) => {
          const row = document.createElement('tr');
          const isConverted = quote.status === 'converted';
          const isPending = quote.status === 'pending';
          const canConvert = !isConverted && quote.status !== 'declined';
          const statusMarkup =
            quote.status === 'accepted'
              ? `<span class="status-pill status-pill--success">Accepted</span>`
              : quote.status === 'declined'
              ? `<span class="status-pill status-pill--muted">Declined</span>`
              : isConverted
              ? `<span class="status-pill status-pill--info">Converted</span>`
              : `<span class="status-pill status-pill--warning">Pending</span>`;
          const decisionLabel =
            quote.status === 'accepted'
              ? 'Accepted'
              : quote.status === 'declined'
              ? 'Declined'
              : isConverted
              ? 'Converted'
              : '';
          const decisionMeta =
            decisionLabel && quote.decisionDate
              ? `<div class="status-meta">${decisionLabel} ${formatDate(quote.decisionDate)}</div>`
              : '';

          const convertButton = `<button class="convert-to-invoice-btn" type="button" data-quote-id="${quote.id}" ${
            canConvert ? '' : 'disabled aria-disabled="true"'
          }>Convert</button>`;

          const actions = [
            convertButton,
            `<button class="btn btn--sm btn--ghost" data-action="edit" data-id="${quote.id}">Edit</button>`,
            isPending
              ? `<button class="btn btn--sm btn--primary" data-action="accept" data-id="${quote.id}">Accept</button>`
              : '',
            isPending
              ? `<button class="btn btn--sm btn--secondary" data-action="decline" data-id="${quote.id}">Decline</button>`
              : '',
            `<button class="btn btn--sm btn--destructive" data-action="delete" data-id="${quote.id}">Delete</button>`
          ]
            .filter(Boolean)
            .join('');

          row.innerHTML = `
            <td>${quote.number}</td>
            <td>${quote.clientName}</td>
            <td>${formatDate(quote.issueDate)}</td>
            <td>${formatDate(quote.validUntil)}</td>
            <td>${formatCurrency(quote.total)}</td>
            <td>${statusMarkup}${decisionMeta}</td>
            <td class="text-right">
              <div class="table-actions">${actions}</div>
            </td>
          `;

          row.classList.toggle('quote-row--converted', isConverted);
          if (isConverted) {
            row.setAttribute('aria-disabled', 'true');
          } else {
            row.removeAttribute('aria-disabled');
          }

          this.quoteListBody.appendChild(row);
        });

      this.quoteListBody.querySelectorAll('[data-action="accept"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const quoteId = button.getAttribute('data-id');
          QuoteManager.markAccepted(quoteId, new Date());
          this.refreshData();
          this.renderAll();
        });
      });

      this.quoteListBody.querySelectorAll('[data-action="decline"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const quoteId = button.getAttribute('data-id');
          QuoteManager.markDeclined(quoteId, new Date());
          this.refreshData();
          this.renderAll();
        });
      });

      this.quoteListBody.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const quoteId = button.getAttribute('data-id');
          const quote = this.state.quotes.find((item) => item.id === quoteId);
          if (!quote) {
            return;
          }
          this.activateSection('quotes');
          this.toggleQuoteForm(true, quote);
        });
      });

      this.quoteListBody.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const quoteId = button.getAttribute('data-id');
          QuoteManager.remove(quoteId);
          this.refreshData();
          this.renderAll();
        });
      });
    }
  }

  handleQuoteListClick(event) {
    const target = event.target.closest('.convert-to-invoice-btn');
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') {
      return;
    }
    event.preventDefault();
    const quoteId = target.getAttribute('data-quote-id');
    if (!quoteId) {
      return;
    }
    this.convertQuoteToInvoice(quoteId);
  }

  convertQuoteToInvoice(quoteId) {
    const quote = this.state.quotes.find((item) => item.id === quoteId);
    if (!quote) {
      this.showToast('Unable to locate quote for conversion.', 'error');
      return;
    }
    if (quote.status === 'converted') {
      this.showToast('Quote has already been converted.', 'info');
      return;
    }
    if (!Array.isArray(quote.lineItems) || !quote.lineItems.length) {
      this.showToast('Quote must contain at least one line item before conversion.', 'error');
      return;
    }

    try {
      const now = new Date();
      let issueDate = now;
      if (quote.issueDate) {
        const parsed = Date.parse(quote.issueDate);
        if (!Number.isNaN(parsed)) {
          issueDate = new Date(parsed);
        }
      }
      const issueDateIso = issueDate.toISOString();
      const dueDateIso = new Date(issueDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const invoicePayload = {
        clientId: quote.clientId,
        issueDate: issueDateIso,
        dueDate: dueDateIso,
        notes: quote.notes,
        lineItems: quote.lineItems.map((item) => ({
          serviceId: item.serviceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          applyGst: item.applyGst
        })),
        status: 'unpaid',
        type: 'invoice'
      };

      const createdInvoice = InvoiceManager.create(invoicePayload);
      DataManager.saveInvoice({ ...createdInvoice, type: 'invoice' });

      const updatedQuote = QuoteManager.update(quoteId, {
        status: 'converted',
        decisionDate: DataManager.now()
      });
      DataManager.saveQuote({ ...updatedQuote, type: 'quote' });

      this.refreshData();
      this.renderAll();
      this.showToast('Quote converted to Invoice successfully', 'success');
    } catch (error) {
      console.error('Failed to convert quote to invoice:', error);
      this.showToast('Unable to convert quote. Please try again.', 'error');
    }
  }

  showToast(message, variant = 'info') {
    if (!message) {
      return;
    }
    const region = this.ensureToastRegion();
    if (!region) {
      console.warn('Toast region is unavailable. Message:', message);
      return;
    }

    region.querySelectorAll('.toast').forEach((existing) => existing.remove());

    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    region.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    if (this.toastDismissTimeout) {
      clearTimeout(this.toastDismissTimeout);
    }
    this.toastDismissTimeout = setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => {
        toast.remove();
      }, 200);
    }, 3200);
  }

  ensureToastRegion() {
    if (this.toastRegion && document.body.contains(this.toastRegion)) {
      return this.toastRegion;
    }
    if (typeof document === 'undefined') {
      return null;
    }
    const region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.dataset.toastRegion = 'true';
    document.body.appendChild(region);
    this.toastRegion = region;
    return region;
  }

  handleQuoteSubmit() {
    const form = this.quoteForm;
    const quoteId = form.querySelector('[name="quoteId"]').value;
    const clientId = form.querySelector('[name="clientId"]').value;
    const issueDate = form.querySelector('[name="issueDate"]').value;
    const validUntil = form.querySelector('[name="validUntil"]').value;
    const notes = form.querySelector('[name="notes"]').value;
    const items = this.quoteFormEditor.getItems();
    const feedback = form.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }
    try {
      if (!clientId) {
        throw new Error('Please select a client for the quote.');
      }
      if (!items.length) {
        throw new Error('Add at least one line item before saving.');
      }
      if (quoteId) {
        QuoteManager.update(quoteId, {
          clientId,
          issueDate,
          validUntil,
          notes,
          lineItems: items
        });
      } else {
        QuoteManager.create({
          clientId,
          issueDate,
          validUntil,
          notes,
          lineItems: items
        });
      }
      this.toggleQuoteForm(false);
      this.refreshData();
      this.renderAll();
    } catch (error) {
      console.error(error);
      if (feedback) {
        feedback.textContent = error.message;
      }
    }
  }

  renderClients() {
    if (!this.clientForm || !this.clientListBody) {
      return;
    }

    this.clientForm.reset();
    const feedback = this.clientForm.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }

    if (!this.clientFormInitialized) {
      this.clientForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleClientSubmit();
      });
      this.clientFormInitialized = true;
    }

    clearChildren(this.clientListBody);
    if (!this.state.clients.length) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No clients added yet.';
      emptyRow.appendChild(cell);
      this.clientListBody.appendChild(emptyRow);
    } else {
      this.state.clients
        .sort((a, b) => a.businessName.localeCompare(b.businessName))
        .forEach((client) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${client.businessName}</td>
            <td>${client.name}</td>
            <td>${client.abn}</td>
            <td>${client.contact}</td>
            <td>${client.prefix}</td>
            <td>${client.email || ''}</td>
            <td>
              <button class="btn btn--sm btn--secondary" data-action="edit" data-id="${client.id}">Edit</button>
              <button class="btn btn--sm btn--destructive" data-action="delete" data-id="${client.id}">Delete</button>
            </td>
          `;
          this.clientListBody.appendChild(row);
        });

      this.clientListBody.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const clientId = button.getAttribute('data-id');
          const client = this.state.clients.find((item) => item.id === clientId);
          if (!client) {
            return;
          }
          this.clientForm.querySelector('[name="clientId"]').value = client.id;
          this.clientForm.querySelector('[name="name"]').value = client.name;
          this.clientForm.querySelector('[name="businessName"]').value = client.businessName;
          this.clientForm.querySelector('[name="address"]').value = client.address;
          this.clientForm.querySelector('[name="abn"]').value = client.abn;
          this.clientForm.querySelector('[name="contact"]').value = client.contact;
          this.clientForm.querySelector('[name="prefix"]').value = client.prefix;
          this.clientForm.querySelector('[name="email"]').value = client.email || '';
          this.clientForm.scrollIntoView({ behavior: 'smooth' });
        });
      });

      this.clientListBody.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const clientId = button.getAttribute('data-id');
          ClientManager.remove(clientId);
          this.refreshData();
          this.renderAll();
        });
      });
    }
  }

  handleClientSubmit() {
    const form = this.clientForm;
    const clientId = form.querySelector('[name="clientId"]').value;
    const payload = {
      name: form.querySelector('[name="name"]').value,
      businessName: form.querySelector('[name="businessName"]').value,
      address: form.querySelector('[name="address"]').value,
      abn: form.querySelector('[name="abn"]').value,
      contact: form.querySelector('[name="contact"]').value,
      prefix: form.querySelector('[name="prefix"]').value,
      email: form.querySelector('[name="email"]').value
    };
    const feedback = form.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }
    try {
      if (clientId) {
        ClientManager.update(clientId, payload);
      } else {
        ClientManager.create(payload);
      }
      form.reset();
      this.refreshData();
      this.renderAll();
    } catch (error) {
      console.error(error);
      if (feedback) {
        feedback.textContent = error.message;
      }
    }
  }

  renderServices() {
    if (!this.serviceForm || !this.serviceListBody) {
      return;
    }
    this.serviceForm.reset();
    const feedback = this.serviceForm.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }

    if (!this.serviceFormInitialized) {
      this.serviceForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const description = this.serviceForm.querySelector('[name="description"]').value;
        const unitPrice = this.serviceForm.querySelector('[name="unitPrice"]').value;
        try {
          ServiceManager.create({ description, unitPrice });
          this.serviceForm.reset();
          this.refreshData();
          this.renderAll();
        } catch (error) {
          console.error(error);
          if (feedback) {
            feedback.textContent = error.message;
          }
        }
      });
      this.serviceFormInitialized = true;
    }

    clearChildren(this.serviceListBody);
    if (!this.state.services.length) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.textContent = 'No services in catalog yet.';
      emptyRow.appendChild(cell);
      this.serviceListBody.appendChild(emptyRow);
    } else {
      this.state.services
        .sort((a, b) => a.description.localeCompare(b.description))
        .forEach((service) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${service.description}</td>
            <td>${formatCurrency(service.unitPrice)}</td>
            <td>
              <button class="btn btn--sm btn--destructive" data-action="remove" data-id="${service.id}">Delete</button>
            </td>
          `;
          this.serviceListBody.appendChild(row);
        });

      this.serviceListBody.querySelectorAll('[data-action="remove"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const serviceId = button.getAttribute('data-id');
          ServiceManager.remove(serviceId);
          this.refreshData();
          this.renderAll();
        });
      });
    }
  }

  renderPayments() {
    if (!this.paymentOutstandingBody || !this.paymentHistoryBody) {
      return;
    }

    clearChildren(this.paymentOutstandingBody);
    const outstanding = PaymentManager.getOutstandingInvoices();
    if (!outstanding.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No outstanding invoices.';
      row.appendChild(cell);
      this.paymentOutstandingBody.appendChild(row);
    } else {
      outstanding.forEach((invoice) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${invoice.number}</td>
          <td>${invoice.clientName}</td>
          <td>${formatDate(invoice.dueDate)}</td>
          <td>${formatCurrency(invoice.balanceDue ?? invoice.total)}</td>
          <td><button class="btn btn--sm btn--primary" data-action="record-payment" data-id="${invoice.id}">Record payment</button></td>
        `;
        this.paymentOutstandingBody.appendChild(row);
      });

      this.paymentOutstandingBody.querySelectorAll('[data-action="record-payment"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const invoiceId = button.getAttribute('data-id');
          const invoice = this.state.invoices.find((item) => item.id === invoiceId);
          if (!invoice) {
            return;
          }
          const amountDue = invoice.balanceDue ?? invoice.total;
          if (amountDue <= 0) {
            return;
          }
          PaymentManager.recordPayment(invoiceId, amountDue, new Date());
          this.refreshData();
          this.renderAll();
        });
      });
    }

    clearChildren(this.paymentHistoryBody);
    if (!this.state.payments.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No payments recorded.';
      row.appendChild(cell);
      this.paymentHistoryBody.appendChild(row);
    } else {
      this.state.payments
        .sort((a, b) => Date.parse(b.paymentDate) - Date.parse(a.paymentDate))
        .forEach((payment) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${payment.invoiceNumber}</td>
            <td>${payment.clientName}</td>
            <td>${formatDate(payment.paymentDate)}</td>
            <td>${formatCurrency(payment.amount)}</td>
            <td>${payment.notes || ''}</td>
          `;
          this.paymentHistoryBody.appendChild(row);
        });
    }
  }

  renderReports() {
    if (!this.reportCanvas) {
      return;
    }
    const ctx = this.reportCanvas.getContext('2d');
    const summary = ReportManager.getMonthlyInvoiceSummary(6);
    const gstSummary = ReportManager.getGstSummary();

    const paidGstElement = document.querySelector('[data-report="paid-gst"]');
    const outstandingGstElement = document.querySelector('[data-report="outstanding-gst"]');
    const totalGstElement = document.querySelector('[data-report="total-gst"]');
    if (paidGstElement) paidGstElement.textContent = formatCurrency(gstSummary.paidGst);
    if (outstandingGstElement) outstandingGstElement.textContent = formatCurrency(gstSummary.outstandingGst);
    if (totalGstElement) totalGstElement.textContent = formatCurrency(gstSummary.totalGst);

    if (typeof Chart !== 'undefined' && ctx) {
      const labels = summary.map((item) => item.label);
      const invoicedData = summary.map((item) => item.invoiced);
      const paidData = summary.map((item) => item.paid);
      if (this.reportChart) {
        this.reportChart.data.labels = labels;
        this.reportChart.data.datasets[0].data = invoicedData;
        this.reportChart.data.datasets[1].data = paidData;
        this.reportChart.update();
      } else {
        this.reportChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Invoiced',
                data: invoicedData,
                backgroundColor: '#2563eb'
              },
              {
                label: 'Paid',
                data: paidData,
                backgroundColor: '#059669'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom'
              },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                }
              }
            },
            scales: {
              y: {
                ticks: {
                  callback: (value) => formatCurrency(value)
                }
              }
            }
          }
        });
      }
    }

    if (this.gstExportForm && !this.gstExportInitialized) {
      this.gstExportForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleGstExportDownload();
      });
      if (this.gstExportButton && this.gstExportButton.type === 'button') {
        this.gstExportButton.addEventListener('click', (event) => {
          event.preventDefault();
          this.handleGstExportDownload();
        });
      }
      this.gstExportInitialized = true;
    }
  }

  handleGstExportDownload() {
    const startValue = this.gstExportStartInput?.value
      ? this.gstExportStartInput.value.trim()
      : '';
    const endValue = this.gstExportEndInput?.value ? this.gstExportEndInput.value.trim() : '';
    const feedback = this.gstExportFeedback ?? null;

    if (feedback) {
      delete feedback.dataset.tone;
      feedback.textContent = '';
    }

    const setLoading = (isLoading) => {
      if (!this.gstExportButton) {
        return;
      }
      this.gstExportButton.disabled = isLoading;
      if (isLoading) {
        this.gstExportButton.setAttribute('aria-busy', 'true');
      } else {
        this.gstExportButton.removeAttribute('aria-busy');
      }
    };

    setLoading(true);
    try {
      const result = ExportManager.downloadPaidInvoicesCsv({
        startDate: startValue,
        endDate: endValue
      });
      if (feedback) {
        feedback.dataset.tone = 'success';
        const invoiceLabel = result.rowCount === 1 ? 'invoice' : 'invoices';
        feedback.textContent = `Downloaded ${result.rowCount} paid ${invoiceLabel}.`;
      }
    } catch (error) {
      console.error(error);
      if (feedback) {
        feedback.dataset.tone = 'error';
        feedback.textContent = error?.message ?? 'Unable to export GST CSV. Please try again.';
      }
    } finally {
      setLoading(false);
    }
  }

  renderSettings() {
    if (!this.settingsForm) {
      return;
    }
    const settings = this.state.settings;
    this.settingsForm.querySelector('[name="businessName"]').value = settings.businessName;
    this.settingsForm.querySelector('[name="abn"]').value = settings.abn;
    this.settingsForm.querySelector('[name="contactName"]').value = settings.contactName;
    this.settingsForm.querySelector('[name="contactEmail"]').value = settings.contactEmail;
    this.settingsForm.querySelector('[name="contactPhone"]').value = settings.contactPhone;
    this.settingsForm.querySelector('[name="address"]').value = settings.address;
    this.settingsForm.querySelector('[name="invoicePrefix"]').value = settings.invoicePrefix;
    this.settingsForm.querySelector('[name="quotePrefix"]').value = settings.quotePrefix;
    this.settingsForm.querySelector('[name="gstRate"]').value = settings.gstRate;

    const feedback = this.settingsForm.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = '';
    }

    if (!this.settingsFormInitialized) {
      this.settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
          SettingsManager.update({
            businessName: this.settingsForm.querySelector('[name="businessName"]').value,
            abn: this.settingsForm.querySelector('[name="abn"]').value,
            contactName: this.settingsForm.querySelector('[name="contactName"]').value,
            contactEmail: this.settingsForm.querySelector('[name="contactEmail"]').value,
            contactPhone: this.settingsForm.querySelector('[name="contactPhone"]').value,
            address: this.settingsForm.querySelector('[name="address"]').value,
            invoicePrefix: this.settingsForm.querySelector('[name="invoicePrefix"]').value,
            quotePrefix: this.settingsForm.querySelector('[name="quotePrefix"]').value,
            gstRate: this.settingsForm.querySelector('[name="gstRate"]').value
          });
          if (feedback) {
            feedback.textContent = 'Settings saved successfully.';
          }
          this.refreshData();
          this.renderAll();
        } catch (error) {
          console.error(error);
          if (feedback) {
            feedback.textContent = error.message;
          }
        }
      });
      this.settingsFormInitialized = true;
    }
  }

  exposeGlobals() {
    if (typeof window !== 'undefined') {
      window.ZantraApp = {
        ...(window.ZantraApp || {}),
        DataManager,
        ClientManager,
        ServiceManager,
        InvoiceManager,
        QuoteManager,
        PaymentManager,
        ReportManager,
        ExportManager,
        SettingsManager
      };
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new ZantraApp();
  app.init();
});

export {
  DataManager,
  ClientManager,
  ServiceManager,
  InvoiceManager,
  QuoteManager,
  PaymentManager,
  ReportManager,
  ExportManager,
  SettingsManager
};
