import '../styles/styles.css';
import { DataManager } from './data/DataManager.js';
import { ClientManager } from './modules/client/ClientManager.js';

const isElementNode = (value) => {
  if (!value) {
    return false;
  }
  if (typeof HTMLElement === 'function') {
    return value instanceof HTMLElement;
  }
  return typeof value === 'object' && value.nodeType === 1;
};

const getControlledSectionId = (tab) => {
  if (!tab) {
    return '';
  }
  const controls = tab.getAttribute('aria-controls');
  return typeof controls === 'string' ? controls.trim() : '';
};

const applyActiveSection = (sections, tabs, targetId) => {
  if (!targetId || !sections.has(targetId)) {
    return;
  }

  sections.forEach((section, sectionId) => {
    const isActive = sectionId === targetId;
    section.classList.toggle('is-active', isActive);
    section.setAttribute('aria-hidden', String(!isActive));
    if (isActive) {
      section.removeAttribute('hidden');
      section.style.removeProperty('display');
    } else {
      section.setAttribute('hidden', '');
      section.style.display = 'none';
    }
  });

  tabs.forEach((tab) => {
    const controlsId = getControlledSectionId(tab);
    const isActive = controlsId === targetId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  });
};

const initializeNavigation = () => {
  const tabs = Array.from(document.querySelectorAll('.primary-nav [role="tab"]'));
  if (!tabs.length) {
    return;
  }

  const sections = new Map();
  tabs.forEach((tab) => {
    const sectionId = getControlledSectionId(tab);
    if (sectionId && !sections.has(sectionId)) {
      const sectionElement = document.getElementById(sectionId);
      if (isElementNode(sectionElement)) {
        if (!sectionElement.hasAttribute('aria-hidden')) {
          sectionElement.setAttribute('aria-hidden', String(!tab.classList.contains('active')));
        }
        sections.set(sectionId, sectionElement);
      }
    }
  });

  const activateSection = (sectionId) => {
    applyActiveSection(sections, tabs, sectionId);
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      activateSection(getControlledSectionId(tab));
    });
  });

  const defaultTab = tabs.find((tab) => tab.classList.contains('active')) ?? tabs[0];
  if (defaultTab) {
    activateSection(getControlledSectionId(defaultTab));
  }
};

const bindActionButtons = (handlers) => {
  if (!handlers || typeof handlers !== 'object') {
    return;
  }

  Object.entries(handlers).forEach(([selector, handler]) => {
    if (typeof selector !== 'string' || typeof handler !== 'function') {
      return;
    }
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      if (!isElementNode(element)) {
        return;
      }
      element.addEventListener('click', (event) => {
        event.preventDefault();
        handler(event);
      });
    });
  });
};

const safeAlert = (message) => {
  const alertFn =
    (typeof window !== 'undefined' && typeof window.alert === 'function' && window.alert) ||
    (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function' && globalThis.alert);
  if (alertFn) {
    alertFn(message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initializeNavigation();
  bindActionButtons({
    '.resume-setup-btn': () => safeAlert('Resume setup...'),
    '.new-invoice-btn': () => safeAlert('Create new invoice...')
  });

  if (typeof window !== 'undefined') {
    window.ZantraApp = {
      ...(window.ZantraApp || {}),
      DataManager,
      ClientManager
    };
  }
});

export { DataManager, ClientManager };
