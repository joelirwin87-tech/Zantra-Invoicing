import { DataManager, DEFAULT_SETTINGS } from '../data/DataManager.js';

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizeNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(numeric * 100) / 100;
};

export class SettingsManager {
  static get() {
    return DataManager.getSettings();
  }

  static update(input) {
    const payload = input && typeof input === 'object' ? input : {};
    const merged = {
      ...DEFAULT_SETTINGS,
      ...payload
    };

    const sanitized = {
      businessName: sanitizeString(merged.businessName),
      abn: sanitizeString(merged.abn),
      contactName: sanitizeString(merged.contactName),
      contactEmail: sanitizeString(merged.contactEmail).toLowerCase(),
      contactPhone: sanitizeString(merged.contactPhone),
      address: sanitizeString(merged.address),
      invoicePrefix: sanitizeString(merged.invoicePrefix || DEFAULT_SETTINGS.invoicePrefix).toUpperCase(),
      quotePrefix: sanitizeString(merged.quotePrefix || DEFAULT_SETTINGS.quotePrefix).toUpperCase(),
      gstRate: Math.max(0, Math.min(1, sanitizeNumber(merged.gstRate, DEFAULT_SETTINGS.gstRate)))
    };

    if (sanitized.contactEmail && !SettingsManager.#isValidEmail(sanitized.contactEmail)) {
      throw new Error('SettingsManager: contact email is invalid.');
    }

    return DataManager.saveSettings(sanitized);
  }

  static #isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
