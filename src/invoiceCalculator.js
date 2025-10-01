const DEFAULT_GST_RATE = 0.1;

const roundCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError('Value must be a finite number');
  }

  return Math.round(numericValue * 100) / 100;
};

const normaliseNumber = (value, { allowNegative = false } = {}) => {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError('Numeric values must be finite numbers');
  }
  if (!allowNegative && numericValue < 0) {
    throw new RangeError('Numeric values must be non-negative');
  }

  return numericValue;
};

export const calculateInvoiceTotals = ({
  items = [],
  gstEnabled = true,
  gstRate = DEFAULT_GST_RATE,
  payments = [],
} = {}) => {
  if (!Array.isArray(items)) {
    throw new TypeError('Invoice items must be provided as an array');
  }
  if (!Array.isArray(payments)) {
    throw new TypeError('Payments must be provided as an array');
  }

  const sanitisedGstRate = normaliseNumber(gstRate, { allowNegative: false });
  const subtotal = items.reduce((runningTotal, item) => {
    const quantity = normaliseNumber(item?.quantity ?? 0, { allowNegative: false });
    const unitPrice = normaliseNumber(item?.unitPrice ?? 0, { allowNegative: false });
    const discount = normaliseNumber(item?.discount ?? 0, { allowNegative: false });

    const lineTotal = Math.max(0, quantity * unitPrice - discount);
    return runningTotal + lineTotal;
  }, 0);

  const gst = gstEnabled ? roundCurrency(subtotal * sanitisedGstRate) : 0;
  const total = roundCurrency(subtotal + gst);

  const amountPaid = payments.reduce((runningTotal, payment) => {
    const amount = normaliseNumber(payment?.amount ?? 0, { allowNegative: false });
    return roundCurrency(runningTotal + amount);
  }, 0);

  const balanceDue = roundCurrency(Math.max(0, total - amountPaid));

  return {
    subtotal: roundCurrency(subtotal),
    gst,
    total,
    amountPaid,
    balanceDue,
  };
};

export const getOutstandingStatus = (invoice) => {
  const totals = calculateInvoiceTotals(invoice);
  if (totals.balanceDue === 0) {
    return 'paid';
  }
  if (totals.amountPaid === 0) {
    return 'unpaid';
  }
  return 'partially_paid';
};

export default calculateInvoiceTotals;
