# Zantra Invoicing Local Data Manager

This repository provides a lightweight, local-first data management layer built for invoicing workflows. The manager stores clients, invoices, quotes, services, and payments inside the browser using IndexedDB. It exposes production-ready CRUD helpers, soft deletion, versioning, and CSV import/export utilities while validating payloads against a JSON schema for each entity type.

## Features

- **IndexedDB storage** – resilient offline storage without external dependencies.
- **Entity schemas** – enforced JSON schemas for all supported entities.
- **CRUD APIs** – create, read, update, list, soft delete, and restore records.
- **Automatic versioning** – every update increments a record version and timestamps.
- **Soft delete model** – records gain `isDeleted` and `deletedAt` metadata while remaining recoverable.
- **CSV import/export** – export collections to CSV and import from validated CSV snapshots.
- **Reset & schema discovery** – helper to wipe the database and inspect entity schemas.

## Getting Started

Import the module in any browser-based application. The bundle is published as standard ES modules and requires IndexedDB support.

```html
<script type="module">
  import { LocalDataManager, ENTITY_TYPES } from './src/index.js';

  async function demo() {
    const manager = new LocalDataManager();
    await manager.init();

    const client = await manager.create(ENTITY_TYPES.CLIENTS, {
      name: 'Acme Corp',
      email: 'contact@acme.test',
      phone: '+1-222-333-4444',
    });

    const invoice = await manager.create(ENTITY_TYPES.INVOICES, {
      clientId: client.id,
      issueDate: '2024-01-12',
      dueDate: '2024-02-12',
      items: [
        { description: 'Consulting hours', quantity: 10, unitPrice: 125 },
      ],
      status: 'draft',
      total: 1250,
      currency: 'USD',
    });

    const csv = await manager.exportToCSV(ENTITY_TYPES.INVOICES);
    console.log(csv);
  }

  demo();
</script>
```

## API Overview

All methods throw descriptive errors when validation fails or when operations target missing entities.

### Initialization

```js
const manager = new LocalDataManager({ dbName: 'customName', version: 1 });
await manager.init();
```

### CRUD & Soft Delete

```js
// Create
const client = await manager.create(ENTITY_TYPES.CLIENTS, payload);

// Read
const record = await manager.read(ENTITY_TYPES.CLIENTS, client.id);

// Update
const updated = await manager.update(ENTITY_TYPES.CLIENTS, client.id, { phone: '+1 555 1234' });

// List (with optional filter and deleted records)
const clients = await manager.list(ENTITY_TYPES.CLIENTS, {
  includeDeleted: false,
  filter: (entry) => entry.email.endsWith('@acme.test'),
});

// Soft delete and restore
await manager.softDelete(ENTITY_TYPES.CLIENTS, client.id);
await manager.restore(ENTITY_TYPES.CLIENTS, client.id);
```

### CSV Export & Import

```js
const csv = await manager.exportToCSV(ENTITY_TYPES.PAYMENTS, { includeDeleted: true });
await manager.importFromCSV(ENTITY_TYPES.PAYMENTS, csv, { overwrite: true });
```

### Reset Database

```js
await manager.reset();
```

## Entity Schemas

Retrieve the JSON schema for a specific entity type:

```js
const schema = manager.getEntitySchema(ENTITY_TYPES.SERVICES);
```

## Testing

Interact with the manager directly inside a browser application or automated tests that provide an IndexedDB implementation (e.g., `fake-indexeddb`).

---

Crafted to serve as a robust local-first foundation for invoicing tools.
