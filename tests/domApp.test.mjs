/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');

const stubCanvasContext = () => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(),
  putImageData: jest.fn(),
  createImageData: jest.fn(),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  closePath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  transform: jest.fn(),
  rect: jest.fn(),
  clip: jest.fn()
});

await jest.unstable_mockModule('../styles/styles.css', () => ({ default: {} }));
const appModulePromise = import('../src/index.js');

const loadApp = async () => {
  document.documentElement.innerHTML = html;
  window.localStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
  HTMLCanvasElement.prototype.getContext = stubCanvasContext;
  global.Chart = class {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config?.data ?? { labels: [], datasets: [] };
      this.options = config?.options ?? {};
    }
    update() {
      return undefined;
    }
  };

  jest.resetModules();
  const exports = await appModulePromise;
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return exports;
};

const triggerInput = (element, value) => {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const submitForm = (form) => {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

describe('ZantraApp UI', () => {
  let managers;

  beforeEach(async () => {
    managers = await loadApp();
  });

  test('tab navigation toggles sections via clicks and keyboard', () => {
    const dashboardSection = document.getElementById('dashboard');
    const invoicesSection = document.getElementById('invoices');
    expect(dashboardSection.hasAttribute('hidden')).toBe(false);
    expect(invoicesSection.hasAttribute('hidden')).toBe(true);

    const invoicesTab = document.getElementById('tab-invoices');
    invoicesTab.click();
    expect(invoicesSection.hasAttribute('hidden')).toBe(false);
    expect(dashboardSection.hasAttribute('hidden')).toBe(true);

    const dashboardTab = document.getElementById('tab-dashboard');
    dashboardTab.focus();
    dashboardTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(invoicesTab);
    expect(invoicesTab.getAttribute('aria-selected')).toBe('true');
    expect(invoicesSection.classList.contains('is-active')).toBe(true);
  });

  test('header buttons focus correct sections and forms', () => {
    const resumeButton = document.querySelector('.resume-setup-btn');
    resumeButton.click();
    const settingsSection = document.getElementById('settings');
    expect(settingsSection.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement.id).toBe('settings-business');

    const newInvoiceButton = document.querySelector('.new-invoice-btn');
    newInvoiceButton.click();
    const invoiceSection = document.getElementById('invoices');
    const invoiceForm = document.getElementById('invoice-form');
    expect(invoiceSection.hasAttribute('hidden')).toBe(false);
    expect(invoiceForm.hasAttribute('hidden')).toBe(false);
  });

  test('invoice workflow stores data and allows marking paid', () => {
    document.getElementById('tab-clients').click();
    const clientForm = document.getElementById('client-form');
    triggerInput(clientForm.querySelector('[name="name"]'), 'Jane Doe');
    triggerInput(clientForm.querySelector('[name="businessName"]'), 'Doe Services');
    triggerInput(clientForm.querySelector('[name="address"]'), '1 Example Street');
    triggerInput(clientForm.querySelector('[name="abn"]'), '12 345 678 901');
    triggerInput(clientForm.querySelector('[name="contact"]'), '0400000000');
    triggerInput(clientForm.querySelector('[name="prefix"]'), 'JD');
    triggerInput(clientForm.querySelector('[name="email"]'), 'jane@example.com');
    submitForm(clientForm);
    const client = managers.ClientManager.list()[0];
    expect(client.businessName).toBe('Doe Services');

    document.getElementById('tab-services').click();
    const serviceForm = document.getElementById('service-form');
    triggerInput(serviceForm.querySelector('[name="description"]'), 'Consulting');
    triggerInput(serviceForm.querySelector('[name="unitPrice"]'), '150');
    submitForm(serviceForm);
    const service = managers.ServiceManager.list()[0];
    expect(service.description).toBe('Consulting');

    document.querySelector('.new-invoice-btn').click();
    const invoiceForm = document.getElementById('invoice-form');
    const clientSelect = invoiceForm.querySelector('[name="clientId"]');
    clientSelect.value = client.id;
    clientSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const issueInput = invoiceForm.querySelector('[name="issueDate"]');
    issueInput.value = '2024-03-01';
    issueInput.dispatchEvent(new Event('change', { bubbles: true }));
    const dueInput = invoiceForm.querySelector('[name="dueDate"]');
    dueInput.value = '2024-03-15';
    dueInput.dispatchEvent(new Event('change', { bubbles: true }));

    const lineItemRow = invoiceForm.querySelector('.line-item-row');
    const serviceSelect = lineItemRow.querySelector('[data-field="service"]');
    serviceSelect.value = service.id;
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const quantityInput = lineItemRow.querySelector('[data-field="quantity"]');
    triggerInput(quantityInput, '2');
    const priceInput = lineItemRow.querySelector('[data-field="unitPrice"]');
    triggerInput(priceInput, '150');
    const descriptionInput = lineItemRow.querySelector('[data-field="description"]');
    triggerInput(descriptionInput, 'On-site consulting');

    submitForm(invoiceForm);
    const invoices = managers.InvoiceManager.list();
    expect(invoices).toHaveLength(1);
    const invoice = invoices[0];
    expect(invoice.clientId).toBe(client.id);
    expect(invoice.total).toBeGreaterThan(0);

    const stored = window.localStorage.getItem('zantra-invoicing::invoices');
    expect(stored).not.toBeNull();

    document.getElementById('tab-payments').click();
    const recordButton = document.querySelector('[data-action="record-payment"]');
    expect(recordButton).not.toBeNull();
    recordButton.click();
    const updatedInvoice = managers.InvoiceManager.list()[0];
    expect(updatedInvoice.status).toBe('paid');
  });

  test('quote workflow persists entries and actions', () => {
    document.getElementById('tab-clients').click();
    const clientForm = document.getElementById('client-form');
    triggerInput(clientForm.querySelector('[name="name"]'), 'Sam Smith');
    triggerInput(clientForm.querySelector('[name="businessName"]'), 'Smith & Co');
    triggerInput(clientForm.querySelector('[name="address"]'), '22 Market Road');
    triggerInput(clientForm.querySelector('[name="abn"]'), '98 765 432 100');
    triggerInput(clientForm.querySelector('[name="contact"]'), '0400999888');
    triggerInput(clientForm.querySelector('[name="prefix"]'), 'SM');
    triggerInput(clientForm.querySelector('[name="email"]'), 'sam@example.com');
    submitForm(clientForm);
    const client = managers.ClientManager.list()[0];

    document.getElementById('tab-services').click();
    const serviceForm = document.getElementById('service-form');
    triggerInput(serviceForm.querySelector('[name="description"]'), 'Installation');
    triggerInput(serviceForm.querySelector('[name="unitPrice"]'), '80');
    submitForm(serviceForm);
    const service = managers.ServiceManager.list()[0];

    document.getElementById('tab-quotes').click();
    document.querySelector('[data-action="open-quote-form"]').click();
    const quoteForm = document.getElementById('quote-form');
    const clientSelect = quoteForm.querySelector('[name="clientId"]');
    clientSelect.value = client.id;
    clientSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const issueInput = quoteForm.querySelector('[name="issueDate"]');
    issueInput.value = '2024-04-01';
    issueInput.dispatchEvent(new Event('change', { bubbles: true }));
    const validInput = quoteForm.querySelector('[name="validUntil"]');
    validInput.value = '2024-04-30';
    validInput.dispatchEvent(new Event('change', { bubbles: true }));

    const lineItemRow = quoteForm.querySelector('.line-item-row');
    const serviceSelect = lineItemRow.querySelector('[data-field="service"]');
    serviceSelect.value = service.id;
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    triggerInput(lineItemRow.querySelector('[data-field="description"]'), 'Equipment installation');
    triggerInput(lineItemRow.querySelector('[data-field="quantity"]'), '3');
    triggerInput(lineItemRow.querySelector('[data-field="unitPrice"]'), '80');

    submitForm(quoteForm);
    const quotes = managers.QuoteManager.list();
    expect(quotes).toHaveLength(1);
    const quote = quotes[0];
    expect(quote.clientId).toBe(client.id);

    const acceptButton = document.querySelector('[data-action="accept"]');
    expect(acceptButton).not.toBeNull();
    acceptButton.click();
    const updatedQuote = managers.QuoteManager.list()[0];
    expect(updatedQuote.status).toBe('accepted');
  });

  test('settings persist values and remain after render', () => {
    const settingsTab = document.getElementById('tab-settings');
    settingsTab.click();
    const settingsForm = document.getElementById('settings-form');
    triggerInput(settingsForm.querySelector('[name="businessName"]'), 'Zantra Engineering');
    triggerInput(settingsForm.querySelector('[name="abn"]'), '55 444 333 222');
    triggerInput(settingsForm.querySelector('[name="contactName"]'), 'Alex Manager');
    triggerInput(settingsForm.querySelector('[name="contactEmail"]'), 'office@zantra.example');
    triggerInput(settingsForm.querySelector('[name="contactPhone"]'), '1300123456');
    triggerInput(settingsForm.querySelector('[name="address"]'), '88 Industrial Way');
    triggerInput(settingsForm.querySelector('[name="invoicePrefix"]'), 'ZN');
    triggerInput(settingsForm.querySelector('[name="quotePrefix"]'), 'ZT');
    triggerInput(settingsForm.querySelector('[name="gstRate"]'), '0.12');
    submitForm(settingsForm);

    const settings = managers.SettingsManager.get();
    expect(settings.businessName).toBe('Zantra Engineering');
    expect(settings.gstRate).toBeCloseTo(0.12);

    document.getElementById('tab-dashboard').click();
    settingsTab.click();
    expect(settingsForm.querySelector('[name="businessName"]').value).toBe('Zantra Engineering');
  });
});

describe('Stylesheet coverage', () => {
  test('includes key classnames and print styles', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/styles.css'), 'utf-8');
    expect(css).toContain('.app-shell');
    expect(css).toContain('.table-actions');
    expect(css).toContain('@media print');
  });
});
