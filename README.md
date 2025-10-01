# Zantra Invoicing

This project provides a file-backed data layer (`DataManager`) and a client management module (`ClientManager`) for managing client profiles and their services. Each client record captures:

- Personal prefix (`Mr`, `Mrs`, or `Ms`)
- Name and business details
- Address and ABN
- Contact number and email (validated and normalized)
- A list of services with descriptions and hourly or fixed pricing information

## Getting Started

```bash
npm install
```

## Running Tests

```bash
npm test
```

## Usage

```js
import { DataManager, ClientManager } from './src/index.js';

const dataManager = new DataManager('./data/clients.json');
const clientManager = new ClientManager(dataManager);

const client = await clientManager.addClient({
  prefix: 'Ms',
  name: 'Jamie Doe',
  businessName: 'Jamie Doe & Co',
  address: '100 Example Street',
  abn: '12 345 678 901',
  contactNumber: '0400 123 456',
  email: 'jamie@example.com',
  services: [
    {
      description: 'Consulting',
      pricing: { type: 'hourly', amount: 150 }
    }
  ]
});
```

