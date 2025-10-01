const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
const CURRENT_YEAR_ELEMENT = document.querySelector('#current-year');

const initializeTabs = () => {
  if (!tabs.length || !panels.length) {
    return;
  }

  let activeTabIndex = 0;

  const focusTabByIndex = (index) => {
    const target = tabs[index];
    if (target) {
      target.focus();
    }
  };

  const activateTab = (tab) => {
    const targetPanelId = tab.getAttribute('aria-controls');
    const targetPanel = document.getElementById(targetPanelId);
    if (!targetPanel) {
      return;
    }

    tabs.forEach((tabElement, index) => {
      const isActive = tabElement === tab;
      tabElement.setAttribute('aria-selected', String(isActive));
      tabElement.tabIndex = isActive ? 0 : -1;
      if (isActive) {
        activeTabIndex = index;
      }
    });

    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel === targetPanel);
    });
  };

  const handleTabKeydown = (event) => {
    const { key } = event;
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (activeTabIndex + 1) % tabs.length;
      activateTab(tabs[nextIndex]);
      focusTabByIndex(nextIndex);
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (activeTabIndex - 1 + tabs.length) % tabs.length;
      activateTab(tabs[prevIndex]);
      focusTabByIndex(prevIndex);
    } else if (key === 'Home') {
      event.preventDefault();
      activateTab(tabs[0]);
      focusTabByIndex(0);
    } else if (key === 'End') {
      event.preventDefault();
      activateTab(tabs[tabs.length - 1]);
      focusTabByIndex(tabs.length - 1);
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', handleTabKeydown);
  });

  activateTab(tabs[0]);
};

const initializeWizard = () => {
  const wizard = document.querySelector('.wizard');
  const wizardContent = document.querySelector('.wizard__content');
  const wizardProgress = document.querySelector('#wizard-progress');
  const wizardStatus = document.querySelector('#wizard-status');
  const wizardBack = document.querySelector('#wizard-back');
  const wizardNext = document.querySelector('#wizard-next');
  const wizardSkip = document.querySelector('#wizard-skip');
  const wizardBackdrop = document.querySelector('[data-wizard-close]');
  const wizardTriggers = Array.from(document.querySelectorAll('[data-wizard-trigger], #open-wizard'));

  if (
    !wizard ||
    !wizardContent ||
    !wizardProgress ||
    !wizardStatus ||
    !wizardBack ||
    !wizardNext ||
    !wizardSkip ||
    !wizardBackdrop
  ) {
    return;
  }

  const onboardingSteps = [
    {
      title: 'Add your business identity',
      description:
        'Upload your logo, set your trading name, and define the contact details that appear on invoices and quotes.',
      action: 'Open company profile',
    },
    {
      title: 'Configure taxes & labor rates',
      description:
        'Select default tax rates, overtime premiums, and standard labor costs so every estimate is accurate.',
      action: 'Review financial settings',
    },
    {
      title: 'Connect payment methods',
      description:
        'Enable ACH, card, or on-site payments to help clients pay faster and reduce reconciliation work.',
      action: 'Link payment providers',
    },
    {
      title: 'Invite your field team',
      description:
        'Send invites to technicians, estimators, and office admins so each role can access the tools they need.',
      action: 'Send team invites',
    },
  ];

  const STORAGE_KEY = 'zantra-onboarding-complete';
  let activeWizardStep = 0;

  const updateWizardStep = () => {
    const step = onboardingSteps[activeWizardStep];
    if (!step) {
      return;
    }

    wizardContent.innerHTML = `
      <h3>${step.title}</h3>
      <p>${step.description}</p>
      <button class="btn" type="button" data-wizard-action>${step.action}</button>
    `;

    const progress = ((activeWizardStep + 1) / onboardingSteps.length) * 100;
    wizardProgress.style.width = `${progress}%`;

    wizardBack.disabled = activeWizardStep === 0;
    wizardNext.textContent = activeWizardStep === onboardingSteps.length - 1 ? 'Finish' : 'Next';
    wizardStatus.textContent = `Step ${activeWizardStep + 1} of ${onboardingSteps.length}`;
  };

  const openWizard = () => {
    wizard.classList.add('is-open');
    wizard.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    activeWizardStep = 0;
    updateWizardStep();
    const actionButton = wizard.querySelector('[data-wizard-action]');
    if (actionButton) {
      actionButton.focus({ preventScroll: true });
    }
  };

  const closeWizard = ({ markComplete = false } = {}) => {
    wizard.classList.remove('is-open');
    wizard.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (markComplete) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (error) {
        // Swallow persistence failures to avoid blocking the UI
      }
    }
  };

  const handleWizardNext = () => {
    if (activeWizardStep < onboardingSteps.length - 1) {
      activeWizardStep += 1;
      updateWizardStep();
      const actionButton = wizard.querySelector('[data-wizard-action]');
      if (actionButton) {
        actionButton.focus({ preventScroll: true });
      }
    } else {
      closeWizard({ markComplete: true });
    }
  };

  const handleWizardBack = () => {
    if (activeWizardStep === 0) {
      return;
    }
    activeWizardStep -= 1;
    updateWizardStep();
    const actionButton = wizard.querySelector('[data-wizard-action]');
    if (actionButton) {
      actionButton.focus({ preventScroll: true });
    }
  };

  const handleWizardSkip = () => {
    closeWizard({ markComplete: true });
  };

  const handleWizardAction = () => {
    closeWizard();
  };

  wizardNext.addEventListener('click', handleWizardNext);
  wizardBack.addEventListener('click', handleWizardBack);
  wizardSkip.addEventListener('click', handleWizardSkip);

  wizardContent.addEventListener('click', (event) => {
    if (event.target.matches('[data-wizard-action]')) {
      handleWizardAction();
    }
  });

  wizardBackdrop.addEventListener('click', () => closeWizard());

  wizardTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      openWizard();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && wizard.classList.contains('is-open')) {
      closeWizard();
    }
  });

  const showWizardIfFirstVisit = () => {
    let shouldShow = true;
    try {
      shouldShow = localStorage.getItem(STORAGE_KEY) !== 'true';
    } catch (error) {
      shouldShow = true;
    }

    if (shouldShow) {
      openWizard();
    }
  };

  showWizardIfFirstVisit();
};

initializeTabs();
initializeWizard();

if (CURRENT_YEAR_ELEMENT) {
  CURRENT_YEAR_ELEMENT.textContent = new Date().getFullYear();
}
