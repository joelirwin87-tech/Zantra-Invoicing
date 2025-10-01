import { DataManager } from "./dataManager.js";
import { ChartManager } from "./chartManager.js";
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatStatus
} from "./utils.js";

const dataManager = new DataManager();
const chartManager = new ChartManager();

const invoiceForm = document.getElementById("invoice-form");
const invoiceTableBody = document.getElementById("invoice-table-body");
const outstandingContainer = document.getElementById("outstanding-container");
const feedbackEl = document.getElementById("form-feedback");
const currentYearEl = document.getElementById("current-year");

if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear();
}

const STATUS = DataManager.STATUS;

const render = () => {
  renderInvoices();
  renderOutstanding();
  renderReports();
};

const resetFeedback = () => {
  if (!feedbackEl) {
    return;
  }
  feedbackEl.textContent = "";
  feedbackEl.classList.remove("is-error", "is-success");
};

const setFeedback = (message, type = "info") => {
  if (!feedbackEl) {
    return;
  }
  feedbackEl.textContent = message;
  feedbackEl.classList.remove("is-error", "is-success");
  if (type === "error") {
    feedbackEl.classList.add("is-error");
  } else if (type === "success") {
    feedbackEl.classList.add("is-success");
  }
};

const buildStatusOptions = (selected) => {
  const entries = [
    { label: "Unpaid", value: STATUS.UNPAID },
    { label: "Part Paid", value: STATUS.PART_PAID },
    { label: "Paid", value: STATUS.PAID }
  ];
  return entries
    .map(
      (entry) => `
        <option value="${entry.value}" ${entry.value === selected ? "selected" : ""}>
          ${entry.label}
        </option>
      `
    )
    .join("");
};

const renderInvoices = () => {
  if (!invoiceTableBody) {
    return;
  }
  const invoices = dataManager.getInvoices();

  if (!invoices.length) {
    invoiceTableBody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">No invoices captured yet.</td>
      </tr>
    `;
    return;
  }

  const rows = invoices
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
    .map((invoice) => {
      const gstAmount = invoice.amount * (invoice.gstRate / 100);
      const outstanding = Math.max(invoice.amount - invoice.paidAmount, 0);
      const statusClass = `status-pill status-${invoice.status}`;
      const paymentDate = invoice.paymentDate ? invoice.paymentDate : "";
      const paidValue = Number.isFinite(invoice.paidAmount) ? invoice.paidAmount : 0;
      const paidInputValue = paidValue.toFixed(2);
      const notesMarkup = invoice.notes
        ? `<p class="invoice-notes">${escapeHtml(invoice.notes)}</p>`
        : "";

      return `
        <tr data-id="${invoice.id}">
          <td>
            <div class="invoice-meta">
              <span class="invoice-number">${escapeHtml(invoice.invoiceNumber)}</span>
              ${notesMarkup}
            </div>
          </td>
          <td>${escapeHtml(invoice.clientName)}</td>
          <td>${formatDate(invoice.issueDate)}</td>
          <td>${formatDate(invoice.dueDate)}</td>
          <td class="numeric">${formatCurrency(invoice.amount)}</td>
          <td class="numeric">${formatCurrency(gstAmount)}</td>
          <td class="numeric">
            <input type="number" min="0" step="0.01" value="${paidInputValue}" data-field="paidAmount" aria-label="Paid amount for invoice ${escapeHtml(invoice.invoiceNumber)}" />
          </td>
          <td class="numeric">${formatCurrency(outstanding)}</td>
          <td>
            <span class="${statusClass}">${formatStatus(invoice.status)}</span>
            <select data-field="status" aria-label="Status for invoice ${escapeHtml(invoice.invoiceNumber)}">
              ${buildStatusOptions(invoice.status)}
            </select>
          </td>
          <td>
            <input type="date" value="${paymentDate}" data-field="paymentDate" aria-label="Payment date for invoice ${escapeHtml(invoice.invoiceNumber)}" />
          </td>
          <td class="actions">
            <div class="action-group">
              <button type="button" class="btn-inline" data-action="save">Save</button>
              <button type="button" class="btn-inline" data-action="mark-paid">Mark Paid</button>
              <button type="button" class="btn-inline" data-action="mark-unpaid">Reset</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  invoiceTableBody.innerHTML = rows;
};

const renderOutstanding = () => {
  if (!outstandingContainer) {
    return;
  }
  const outstanding = dataManager.getOutstandingInvoices();
  if (!outstanding.length) {
    outstandingContainer.innerHTML = '<p class="empty-state">All caught up! No outstanding invoices.</p>';
    return;
  }

  const list = document.createElement("ul");
  list.className = "outstanding-list";

  outstanding.forEach((invoice) => {
    const item = document.createElement("li");
    const outstandingAmount = Math.max(invoice.amount - invoice.paidAmount, 0);
    item.innerHTML = `
      <div class="outstanding-item">
        <div>
          <span class="invoice-number">${escapeHtml(invoice.invoiceNumber)}</span>
          <span class="client-name">${escapeHtml(invoice.clientName)}</span>
        </div>
        <div class="outstanding-meta">
          <span>${formatCurrency(outstandingAmount)} due</span>
          <span>Due ${formatDate(invoice.dueDate)}</span>
        </div>
      </div>
    `;
    list.appendChild(item);
  });

  outstandingContainer.innerHTML = "";
  outstandingContainer.appendChild(list);
};

const renderReports = () => {
  const paidTotals = dataManager.getPaidTotalsByMonth();
  const gstSummary = dataManager.getGstSummary();

  chartManager.updatePaidMonthly(paidTotals);
  chartManager.updateGstSummary(gstSummary);
};

invoiceForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  resetFeedback();

  const formData = new FormData(invoiceForm);

  const invoiceData = {
    invoiceNumber: formData.get("invoiceNumber"),
    clientName: formData.get("clientName"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
    gstRate: formData.get("gstRate"),
    notes: formData.get("notes")
  };

  try {
    dataManager.addInvoice(invoiceData);
    invoiceForm.reset();
    setFeedback("Invoice saved", "success");
    render();
  } catch (error) {
    console.error(error);
    setFeedback(error.message, "error");
  }
});

invoiceTableBody?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const row = target.closest("tr[data-id]");
  if (!row) {
    return;
  }
  const invoiceId = row.getAttribute("data-id");
  if (!invoiceId) {
    return;
  }

  resetFeedback();

  if (target.matches('[data-action="save"]')) {
    handleSave(row, invoiceId);
  }

  if (target.matches('[data-action="mark-paid"]')) {
    handleMarkPaid(invoiceId);
  }

  if (target.matches('[data-action="mark-unpaid"]')) {
    handleMarkUnpaid(invoiceId);
  }
});

const handleSave = (row, invoiceId) => {
  const paidAmountInput = row.querySelector('[data-field="paidAmount"]');
  const statusSelect = row.querySelector('[data-field="status"]');
  const paymentDateInput = row.querySelector('[data-field="paymentDate"]');

  const updates = {
    paidAmount: paidAmountInput?.value ?? 0,
    status: statusSelect?.value ?? STATUS.UNPAID,
    paymentDate: paymentDateInput?.value ?? null
  };

  try {
    dataManager.updateInvoice(invoiceId, updates);
    render();
    setFeedback("Invoice updated", "success");
  } catch (error) {
    console.error(error);
    setFeedback(error.message, "error");
  }
};

const handleMarkPaid = (invoiceId) => {
  try {
    const invoice = dataManager.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }
    const today = new Date().toISOString().slice(0, 10);
    dataManager.updateInvoice(invoiceId, {
      paidAmount: invoice.amount,
      status: STATUS.PAID,
      paymentDate: today
    });
    render();
    setFeedback("Invoice marked as paid", "success");
  } catch (error) {
    console.error(error);
    setFeedback(error.message, "error");
  }
};

const handleMarkUnpaid = (invoiceId) => {
  try {
    dataManager.updateInvoice(invoiceId, {
      paidAmount: 0,
      status: STATUS.UNPAID,
      paymentDate: null
    });
    render();
    setFeedback("Invoice reset to unpaid", "success");
  } catch (error) {
    console.error(error);
    setFeedback(error.message, "error");
  }
};

render();
