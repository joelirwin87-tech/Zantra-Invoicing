const ACCESS_STORAGE_KEY = "zantraAccessExpiry";
const ACCESS_CODE = "12345678";
const ACCESS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const redirectToApp = () => {
  window.location.replace("app.html");
};

const getStoredAccess = () => {
  const rawValue = localStorage.getItem(ACCESS_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed.expiry !== "number") {
      localStorage.removeItem(ACCESS_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    return null;
  }
};

const isExpired = (expiry) => {
  return Number.isFinite(expiry) ? Date.now() > expiry : true;
};

const persistAccess = () => {
  const expiry = Date.now() + ACCESS_DURATION_MS;
  localStorage.setItem(
    ACCESS_STORAGE_KEY,
    JSON.stringify({ expiry })
  );
};

const showMessage = (messageElement, message) => {
  if (!messageElement) return;
  messageElement.textContent = message;
};

const clearMessage = (messageElement) => {
  if (!messageElement) return;
  messageElement.textContent = "";
};

const handleFormSubmit = (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const input = form.querySelector("#access-code");
  const messageElement = document.querySelector("#message");

  if (!input) {
    showMessage(messageElement, "Unable to verify access code.");
    return;
  }

  const providedCode = input.value.trim();
  if (providedCode.length === 0) {
    showMessage(messageElement, "Please enter your access code.");
    input.focus();
    return;
  }

  if (providedCode !== ACCESS_CODE) {
    showMessage(messageElement, "The access code is incorrect.");
    input.value = "";
    input.focus();
    return;
  }

  persistAccess();
  clearMessage(messageElement);
  redirectToApp();
};

const enforceAccess = () => {
  const storedAccess = getStoredAccess();
  if (storedAccess && !isExpired(storedAccess.expiry)) {
    redirectToApp();
  }
};

window.addEventListener("DOMContentLoaded", () => {
  enforceAccess();

  const accessForm = document.querySelector("#access-form");
  const messageElement = document.querySelector("#message");

  if (accessForm) {
    accessForm.addEventListener("submit", handleFormSubmit);
  }

  // Clear stale error messages when the user starts typing again.
  const accessInput = document.querySelector("#access-code");
  if (accessInput) {
    accessInput.addEventListener("input", () => clearMessage(messageElement));
  }
});
