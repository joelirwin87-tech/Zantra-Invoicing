# Zantra Invoicing Dashboard

A responsive, trade-friendly dashboard prototype for Zantra Invoicing. The interface features bold visuals, a grid-driven layout, and an onboarding wizard that guides teams through first-time setup.

## Getting started

1. Open `index.html` in any modern browser. No build tools are required.
2. Interact with the primary navigation tabs to explore dashboard sections for Dashboard, Invoices, Quotes, Clients, Services, Payments, Reports, and Settings.
3. The onboarding wizard launches automatically on first load. Use the “Restart onboarding” button in the footer or the “Launch setup” action in Settings to revisit the wizard.

## Project structure

```
├── index.html          # Application markup and component structure
├── scripts
│   └── main.js         # Tab interactions and onboarding wizard logic
└── styles
    └── main.css        # Bold, responsive styling for the dashboard
```

## Accessibility & responsiveness

- Implements an accessible tablist/tabpanel pattern with keyboard navigation support.
- Ensures sufficient color contrast using a bold palette suited to trade operators.
- Uses CSS Grid and fluid spacing so panels adapt across desktop, tablet, and mobile breakpoints.
- Supports reduced motion preferences and maintains focus visibility across interactive controls.

