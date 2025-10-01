const GST_RATE = 0.1;
const CURRENCY = 'AUD';

const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
});

const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

const deepClone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

class StorageAdapter {
  constructor(storageKey) {
    this.storageKey = storageKey;
    this.memoryStore = {
      clients: [],
      invoices: [],
      quotes: [],
    };
    this.supportsLocalStorage = this.#detectSupport();
  }

  #detectSupport() {
    if (typeof window === 'undefined' || !('localStorage' in window)) {
      return false;
    }

    try {
      const testKey = `${this.storageKey}-test`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn('LocalStorage unavailable, falling back to memory store.', error);
      return false;
    }
  }

  load() {
    if (this.supportsLocalStorage) {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return deepClone(this.memoryStore);
      }

      try {
        const parsed = JSON.parse(raw);
        return {
          clients: Array.isArray(parsed.clients) ? parsed.clients : [],
          invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
          quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
        };
      } catch (error) {
        console.error('Failed to parse stored data. Resetting store.', error);
        this.save(this.memoryStore);
        return deepClone(this.memoryStore);
      }
    }

    return deepClone(this.memoryStore);
  }

  save(data) {
    const safeData = {
      clients: Array.isArray(data.clients) ? data.clients : [],
      invoices: Array.isArray(data.invoices) ? data.invoices : [],
      quotes: Array.isArray(data.quotes) ? data.quotes : [],
    };

    if (this.supportsLocalStorage) {
      window.localStorage.setItem(this.storageKey, JSON.stringify(safeData));
      return;
    }

    this.memoryStore = deepClone(safeData);
  }
}

class DataManager {
  constructor(storageKey = 'zantra-invoicing') {
    this.storage = new StorageAdapter(storageKey);
    this.data = this.storage.load();
  }

  #persist() {
    this.storage.save(this.data);
  }

  #generateId(prefix) {
    const fallback = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return fallback;
  }

  getClients() {
    return deepClone(this.data.clients);
  }

  addClient(client) {
    const trimmedName = client.name?.trim();
    if (!trimmedName) {
      throw new Error('Client name is required.');
    }

    const normalizedEmail = client.email?.trim();
    if (normalizedEmail && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      throw new Error('Client email is invalid.');
    }

    const newClient = {
      id: this.#generateId('client'),
      name: trimmedName,
      email: normalizedEmail || null,
      phone: client.phone?.trim() || null,
      address: client.address?.trim() || null,
      createdAt: new Date().toISOString(),
    };

    this.data.clients.push(newClient);
    this.#persist();
    return deepClone(newClient);
  }

  getClientById(id) {
    return deepClone(this.data.clients.find((client) => client.id === id) || null);
  }

  getInvoices() {
    return deepClone(this.data.invoices);
  }

  saveInvoice(invoice) {
    const payload = {
      ...invoice,
      id: invoice.id || this.#generateId('invoice'),
      savedAt: new Date().toISOString(),
    };

    const existingIndex = this.data.invoices.findIndex((item) => item.id === payload.id);
    if (existingIndex > -1) {
      this.data.invoices.splice(existingIndex, 1, payload);
    } else {
      this.data.invoices.push(payload);
    }

    this.#persist();
    return deepClone(payload);
  }

  getQuotes() {
    return deepClone(this.data.quotes);
  }

  saveQuote(quote) {
    const payload = {
      ...quote,
      id: quote.id || this.#generateId('quote'),
      savedAt: new Date().toISOString(),
    };

    const existingIndex = this.data.quotes.findIndex((item) => item.id === payload.id);
    if (existingIndex > -1) {
      this.data.quotes.splice(existingIndex, 1, payload);
    } else {
      this.data.quotes.push(payload);
    }

    this.#persist();
    return deepClone(payload);
  }
}

const dataManager = new DataManager();

const clientSelects = {
  invoice: document.getElementById('invoice-client-select'),
  quote: document.getElementById('quote-client-select'),
};

const clientDetailBlocks = {
  invoice: document.getElementById('invoice-client-details'),
  quote: document.getElementById('quote-client-details'),
};

const loadClients = () => {
  const clients = dataManager.getClients();
  Object.entries(clientSelects).forEach(([key, select]) => {
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">Select client</option>';
    clients.forEach((client) => {
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = client.name;
      select.append(option);
    });
    if (clients.some((client) => client.id === currentValue)) {
      select.value = currentValue;
    }
    renderClientDetails(key, select.value);
  });
};

const renderClientDetails = (moduleKey, clientId) => {
  const target = clientDetailBlocks[moduleKey];
  if (!target) return;

  if (!clientId) {
    target.textContent = 'Select a client to link contact details.';
    target.hidden = false;
    return;
  }

  const client = dataManager.getClientById(clientId);
  if (!client) {
    target.textContent = 'Client not found.';
    target.hidden = false;
    return;
  }

  const details = [client.name];
  if (client.email) details.push(`Email: ${client.email}`);
  if (client.phone) details.push(`Phone: ${client.phone}`);
  if (client.address) details.push(`Address: ${client.address}`);
  target.textContent = details.join('\n');
  target.hidden = false;
};

const setupClientForms = () => {
  const configs = [
    {
      addButtonId: 'invoice-add-client',
      formId: 'invoice-client-form',
      fields: {
        name: 'invoice-client-name',
        email: 'invoice-client-email',
        phone: 'invoice-client-phone',
        address: 'invoice-client-address',
      },
      saveButtonId: 'invoice-save-client',
      cancelButtonId: 'invoice-cancel-client',
      selectKey: 'invoice',
    },
    {
      addButtonId: 'quote-add-client',
      formId: 'quote-client-form',
      fields: {
        name: 'quote-client-name',
        email: 'quote-client-email',
        phone: 'quote-client-phone',
        address: 'quote-client-address',
      },
      saveButtonId: 'quote-save-client',
      cancelButtonId: 'quote-cancel-client',
      selectKey: 'quote',
    },
  ];

  configs.forEach((config) => {
    const addButton = document.getElementById(config.addButtonId);
    const form = document.getElementById(config.formId);
    const saveButton = document.getElementById(config.saveButtonId);
    const cancelButton = document.getElementById(config.cancelButtonId);

    const showForm = () => {
      form.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const hideForm = () => {
      form.hidden = true;
      Object.values(config.fields).forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
      });
    };

    addButton?.addEventListener('click', () => {
      showForm();
    });

    cancelButton?.addEventListener('click', () => {
      hideForm();
    });

    saveButton?.addEventListener('click', () => {
      try {
        const clientPayload = Object.fromEntries(
          Object.entries(config.fields).map(([key, fieldId]) => {
            const field = document.getElementById(fieldId);
            return [key, field?.value ?? ''];
          })
        );

        const savedClient = dataManager.addClient(clientPayload);
        hideForm();
        loadClients();
        const select = clientSelects[config.selectKey];
        if (select) {
          select.value = savedClient.id;
          renderClientDetails(config.selectKey, savedClient.id);
        }
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
};

const createLineItemRow = () => {
  const template = document.getElementById('line-item-template');
  if (!template?.content) {
    throw new Error('Missing line item template.');
  }
  return template.content.firstElementChild.cloneNode(true);
};

const calculateTotals = (tbody) => {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  let subtotal = 0;
  let gst = 0;

  rows.forEach((row) => {
    const quantityField = row.querySelector('.line-quantity');
    const priceField = row.querySelector('.line-price');
    const gstField = row.querySelector('.line-gst');
    const lineTotalCell = row.querySelector('.line-total');

    const quantity = Math.max(Number.parseFloat(quantityField?.value ?? '0') || 0, 0);
    const unitPrice = Math.max(Number.parseFloat(priceField?.value ?? '0') || 0, 0);
    const applyGst = Boolean(gstField?.checked);

    const net = quantity * unitPrice;
    const gstAmount = applyGst ? net * GST_RATE : 0;
    const gross = net + gstAmount;

    subtotal += net;
    gst += gstAmount;

    if (lineTotalCell) {
      lineTotalCell.textContent = formatCurrency(gross);
    }
  });

  return { subtotal, gst, total: subtotal + gst };
};

const registerLineItemEvents = (row, onChange) => {
  const quantityField = row.querySelector('.line-quantity');
  const priceField = row.querySelector('.line-price');
  const gstField = row.querySelector('.line-gst');
  const removeButton = row.querySelector('.remove-item');

  [quantityField, priceField].forEach((field) => {
    field?.addEventListener('input', onChange);
  });
  gstField?.addEventListener('change', onChange);
  removeButton?.addEventListener('click', () => {
    row.remove();
    onChange();
  });
};

const ensureLineItem = (tbody, onChange) => {
  if (tbody.children.length === 0) {
    const row = createLineItemRow();
    tbody.append(row);
    registerLineItemEvents(row, onChange);
    onChange();
  }
};

const updateTotalsUI = (subtotalEl, gstEl, totalEl, totals) => {
  if (subtotalEl) subtotalEl.textContent = formatCurrency(totals.subtotal);
  if (gstEl) gstEl.textContent = formatCurrency(totals.gst);
  if (totalEl) totalEl.textContent = formatCurrency(totals.total);
};

const mapRowsToLineItems = (tbody) =>
  Array.from(tbody.querySelectorAll('tr')).map((row) => {
    const quantity = Math.max(Number.parseFloat(row.querySelector('.line-quantity')?.value ?? '0') || 0, 0);
    const unitPrice = Math.max(Number.parseFloat(row.querySelector('.line-price')?.value ?? '0') || 0, 0);
    const applyGst = Boolean(row.querySelector('.line-gst')?.checked);
    const net = quantity * unitPrice;
    const gst = applyGst ? net * GST_RATE : 0;

    return {
      description: row.querySelector('.line-description')?.value?.trim() || 'Untitled item',
      quantity,
      unitPrice,
      applyGst,
      net,
      gst,
      total: net + gst,
    };
  });

const calculateDueDate = (baseDate, terms) => {
  if (!baseDate) return '';
  const currentDate = new Date(baseDate);
  if (Number.isNaN(currentDate.getTime())) return '';

  if (terms === 'on_receipt') {
    return currentDate.toISOString().slice(0, 10);
  }

  const days = Number.parseInt(terms, 10);
  if (Number.isFinite(days)) {
    currentDate.setDate(currentDate.getDate() + days);
    return currentDate.toISOString().slice(0, 10);
  }

  return '';
};

const setupDateAutomation = (config) => {
  const baseField = document.getElementById(config.baseFieldId);
  const termsField = document.getElementById(config.termsFieldId);
  const targetField = document.getElementById(config.targetFieldId);

  const update = () => {
    if (!baseField || !termsField || !targetField) return;
    const termsValue = termsField.value;
    if (termsValue === 'custom') {
      targetField.removeAttribute('readonly');
      return;
    }

    targetField.setAttribute('readonly', 'true');
    const calculated = calculateDueDate(baseField.value, termsValue);
    targetField.value = calculated;
  };

  baseField?.addEventListener('change', update);
  termsField?.addEventListener('change', update);
  update();
};

const renderRecords = (listElement, records, type) => {
  if (!listElement) return;
  listElement.innerHTML = '';

  if (!records.length) {
    const empty = document.createElement('li');
    empty.className = 'record';
    empty.textContent = `No ${type} saved yet.`;
    listElement.append(empty);
    return;
  }

  const clients = dataManager.getClients().reduce((acc, client) => {
    acc[client.id] = client;
    return acc;
  }, {});

  records
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .forEach((record) => {
      const item = document.createElement('li');
      item.className = 'record';
      const client = clients[record.clientId];
      const title = document.createElement('strong');
      title.textContent = `${type === 'invoice' ? 'Invoice' : 'Quote'} ${record.number}`;

      const clientLine = document.createElement('span');
      clientLine.textContent = client
        ? `Client: ${client.name}`
        : 'Client: Unlinked';

      const totalLine = document.createElement('span');
      totalLine.textContent = `Total: ${formatCurrency(record.totals?.total ?? 0)}`;

      const dateLine = document.createElement('span');
      dateLine.textContent = type === 'invoice'
        ? `Due: ${record.dueDate || 'N/A'}`
        : `Valid until: ${record.expiryDate || 'N/A'}`;

      item.append(title, clientLine, totalLine, dateLine);
      listElement.append(item);
    });
};

const exportToPdf = async (config, data) => {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    window.alert('jsPDF failed to load. Please check your connection.');
    return;
  }

  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const lineHeight = 18;
  let y = margin;

  const addLine = (text, options = {}) => {
    doc.text(text, margin, y, options);
    y += lineHeight;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  addLine(config.title, { align: 'left' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  addLine(`${config.numberLabel}: ${data.number}`);
  addLine(`Date: ${data.issueDate || data.quoteDate}`);
  if (config.dueLabel && data.dueDate) {
    addLine(`${config.dueLabel}: ${data.dueDate}`);
  }
  if (config.expiryLabel && data.expiryDate) {
    addLine(`${config.expiryLabel}: ${data.expiryDate}`);
  }

  y += lineHeight;
  const client = dataManager.getClientById(data.clientId);
  addLine('Bill To:', { align: 'left' });
  if (client) {
    addLine(client.name);
    if (client.email) addLine(client.email);
    if (client.phone) addLine(client.phone);
    if (client.address) {
      client.address.split(/\r?\n/).forEach((line) => addLine(line));
    }
  } else {
    addLine('Unlinked client');
  }

  y += lineHeight;

  doc.setFont('helvetica', 'bold');
  addLine('Items:');
  doc.setFont('helvetica', 'normal');

  data.lineItems.forEach((item, index) => {
    addLine(`${index + 1}. ${item.description}`);
    addLine(`   Qty: ${item.quantity} @ ${formatCurrency(item.unitPrice)} (${item.applyGst ? 'GST' : 'No GST'})`);
    addLine(`   Line total: ${formatCurrency(item.total)}`);
  });

  y += lineHeight;
  doc.setFont('helvetica', 'bold');
  addLine(`Subtotal: ${formatCurrency(data.totals.subtotal)}`);
  addLine(`GST: ${formatCurrency(data.totals.gst)}`);
  addLine(`Total: ${formatCurrency(data.totals.total)}`);

  const fileName = `${config.filePrefix}-${data.number || 'document'}.pdf`.replace(/\s+/g, '-');
  doc.save(fileName);
};

const setupModule = (moduleConfig) => {
  const form = document.getElementById(moduleConfig.formId);
  const addItemButton = document.getElementById(moduleConfig.addItemButtonId);
  const itemsTbody = document.getElementById(moduleConfig.itemsTbodyId);
  const subtotalEl = document.getElementById(moduleConfig.subtotalId);
  const gstEl = document.getElementById(moduleConfig.gstId);
  const totalEl = document.getElementById(moduleConfig.totalId);
  const exportButton = document.getElementById(moduleConfig.exportButtonId);
  const listElement = document.getElementById(moduleConfig.listId);

  const recalculate = () => {
    if (!itemsTbody) return;
    const totals = calculateTotals(itemsTbody);
    updateTotalsUI(subtotalEl, gstEl, totalEl, totals);
    return totals;
  };

  ensureLineItem(itemsTbody, recalculate);

  addItemButton?.addEventListener('click', () => {
    const row = createLineItemRow();
    itemsTbody.append(row);
    registerLineItemEvents(row, recalculate);
    recalculate();
  });

  Array.from(itemsTbody?.querySelectorAll('tr') ?? []).forEach((row) =>
    registerLineItemEvents(row, recalculate)
  );

  form?.addEventListener('submit', (event) => {
    event.preventDefault();

    const numberField = document.getElementById(moduleConfig.numberFieldId);
    const dateField = document.getElementById(moduleConfig.dateFieldId);
    const targetField = document.getElementById(moduleConfig.targetFieldId);
    const clientSelect = clientSelects[moduleConfig.type];

    if (!numberField?.value.trim()) {
      numberField?.focus();
      numberField?.setCustomValidity('This field is required.');
      numberField?.reportValidity();
      numberField?.addEventListener('input', () => numberField.setCustomValidity(''), {
        once: true,
      });
      return;
    }

    if (!dateField?.value) {
      dateField?.focus();
      dateField?.setCustomValidity('Please select a date.');
      dateField?.reportValidity();
      dateField?.addEventListener('change', () => dateField.setCustomValidity(''), {
        once: true,
      });
      return;
    }

    if (!clientSelect?.value) {
      clientSelect?.focus();
      clientSelect?.setCustomValidity('Please link a client.');
      clientSelect?.reportValidity();
      clientSelect?.addEventListener('change', () => clientSelect.setCustomValidity(''), {
        once: true,
      });
      return;
    }

    const lineItems = mapRowsToLineItems(itemsTbody);
    if (!lineItems.length) {
      window.alert('Please add at least one line item.');
      return;
    }

    const totals = recalculate();
    const payload = {
      number: numberField.value.trim(),
      clientId: clientSelect.value,
      lineItems,
      totals,
      notes: null,
    };

    if (moduleConfig.type === 'invoice') {
      Object.assign(payload, {
        issueDate: dateField.value,
        dueDate: targetField?.value || '',
        dueTerms: document.getElementById(moduleConfig.termsFieldId)?.value || 'on_receipt',
      });
      const saved = dataManager.saveInvoice(payload);
      window.alert(`Invoice ${saved.number} saved.`);
    } else {
      Object.assign(payload, {
        quoteDate: dateField.value,
        expiryDate: targetField?.value || '',
        validityTerms: document.getElementById(moduleConfig.termsFieldId)?.value || '14',
      });
      const saved = dataManager.saveQuote(payload);
      window.alert(`Quote ${saved.number} saved.`);
    }

    renderRecords(
      listElement,
      moduleConfig.type === 'invoice' ? dataManager.getInvoices() : dataManager.getQuotes(),
      moduleConfig.type
    );
  });

  exportButton?.addEventListener('click', () => {
    const numberField = document.getElementById(moduleConfig.numberFieldId);
    const dateField = document.getElementById(moduleConfig.dateFieldId);
    const targetField = document.getElementById(moduleConfig.targetFieldId);
    const clientSelect = clientSelects[moduleConfig.type];
    const totals = recalculate();
    const data = {
      number: numberField?.value.trim() || '',
      clientId: clientSelect?.value || '',
      lineItems: mapRowsToLineItems(itemsTbody),
      totals,
    };

    if (moduleConfig.type === 'invoice') {
      Object.assign(data, {
        issueDate: dateField?.value || '',
        dueDate: targetField?.value || '',
      });
    } else {
      Object.assign(data, {
        quoteDate: dateField?.value || '',
        expiryDate: targetField?.value || '',
      });
    }

    exportToPdf(moduleConfig.pdfConfig, data);
  });

  renderRecords(
    listElement,
    moduleConfig.type === 'invoice' ? dataManager.getInvoices() : dataManager.getQuotes(),
    moduleConfig.type
  );
};

const setupTabs = () => {
  const buttons = Array.from(document.querySelectorAll('.tab-button'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      buttons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      });
      panels.forEach((panel) => {
        const shouldShow = panel.id === targetId;
        panel.classList.toggle('is-hidden', !shouldShow);
        panel.toggleAttribute('hidden', !shouldShow);
      });
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadClients();
  setupClientForms();

  setupDateAutomation({
    baseFieldId: 'invoice-issue-date',
    termsFieldId: 'invoice-due-terms',
    targetFieldId: 'invoice-due-date',
  });

  setupDateAutomation({
    baseFieldId: 'quote-date',
    termsFieldId: 'quote-valid-terms',
    targetFieldId: 'quote-valid-date',
  });

  setupModule({
    type: 'invoice',
    formId: 'invoice-form',
    addItemButtonId: 'invoice-add-item',
    itemsTbodyId: 'invoice-items',
    subtotalId: 'invoice-subtotal',
    gstId: 'invoice-gst',
    totalId: 'invoice-total',
    exportButtonId: 'invoice-export',
    listId: 'invoice-list',
    numberFieldId: 'invoice-number',
    dateFieldId: 'invoice-issue-date',
    targetFieldId: 'invoice-due-date',
    termsFieldId: 'invoice-due-terms',
    pdfConfig: {
      title: 'Invoice',
      numberLabel: 'Invoice Number',
      dueLabel: 'Due Date',
      filePrefix: 'invoice',
    },
  });

  setupModule({
    type: 'quote',
    formId: 'quote-form',
    addItemButtonId: 'quote-add-item',
    itemsTbodyId: 'quote-items',
    subtotalId: 'quote-subtotal',
    gstId: 'quote-gst',
    totalId: 'quote-total',
    exportButtonId: 'quote-export',
    listId: 'quote-list',
    numberFieldId: 'quote-number',
    dateFieldId: 'quote-date',
    targetFieldId: 'quote-valid-date',
    termsFieldId: 'quote-valid-terms',
    pdfConfig: {
      title: 'Quote',
      numberLabel: 'Quote Number',
      expiryLabel: 'Valid Until',
      filePrefix: 'quote',
    },
  });

  Object.entries(clientSelects).forEach(([key, select]) => {
    select?.addEventListener('change', (event) => {
      renderClientDetails(key, event.target.value);
    });
  });
});
