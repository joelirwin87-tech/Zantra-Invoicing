export const formatCurrency = (value, { currency = "AUD" } = {}) => {
  const number = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
};

export const formatDate = (value) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
};

export const formatStatus = (status) => {
  switch (status) {
    case "paid":
      return "Paid";
    case "part-paid":
      return "Part Paid";
    case "unpaid":
    default:
      return "Unpaid";
  }
};

export const toPercent = (value) => `${(value * 100).toFixed(0)}%`;

export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
