import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataManager } from '../src/data/DataManager.js';
import { ClientManager } from '../src/modules/client/ClientManager.js';

async function createManagers(t) {
  const directory = await mkdtemp(join(tmpdir(), 'client-mgr-'));
  const dataFile = join(directory, 'store.json');
  const dataManager = new DataManager(dataFile);
  const clientManager = new ClientManager(dataManager);
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return { dataManager, clientManager };
}

test('adds a client with services', async (t) => {
  const { clientManager } = await createManagers(t);
  const client = await clientManager.addClient({
    prefix: 'Mr',
    name: 'John Doe',
    businessName: 'Doe Consulting',
    address: '123 Business Rd',
    abn: '12 345 678 901',
    contactNumber: '+61 400 000 000',
    email: 'JOHN@EXAMPLE.COM',
    services: [
      {
        description: 'Consulting',
        pricing: { type: 'hourly', amount: 150 }
      }
    ]
  });

  assert.ok(client.id, 'Client should receive an ID');
  assert.equal(client.email, 'john@example.com');
  assert.equal(client.services.length, 1);
  assert.ok(client.services[0].id, 'Service should receive an ID');
  assert.equal(client.services[0].pricing.type, 'hourly');
  assert.equal(client.services[0].pricing.amount, 150);

  const storedClients = await clientManager.listClients();
  assert.equal(storedClients.length, 1);
});

test('updates an existing client and services', async (t) => {
  const { clientManager } = await createManagers(t);
  const client = await clientManager.addClient({
    prefix: 'Ms',
    name: 'Jane Smith',
    businessName: 'Smith Creative',
    address: '456 Market Ave',
    abn: '98 765 432 109',
    contactNumber: '0400 123 456',
    email: 'contact@smithcreative.com',
    services: [
      {
        description: 'Design',
        pricingType: 'fixed',
        price: 2500
      }
    ]
  });

  const updated = await clientManager.updateClient(client.id, {
    prefix: 'Mrs',
    email: 'UPDATED@SMITHCREATIVE.COM',
    services: client.services.map((service) => ({
      ...service,
      pricing: { type: 'fixed', amount: 3000 }
    }))
  });

  assert.equal(updated.prefix, 'Mrs');
  assert.equal(updated.email, 'updated@smithcreative.com');
  assert.equal(updated.services[0].pricing.amount, 3000);
});

test('rejects invalid prefixes', async (t) => {
  const { clientManager } = await createManagers(t);
  await assert.rejects(
    () =>
      clientManager.addClient({
        prefix: 'Dr',
        name: 'Invalid Prefix',
        businessName: 'Test Pty Ltd',
        address: '789 Example St',
        abn: '11 111 111 111',
        contactNumber: '0400 000 001',
        email: 'invalid@example.com',
        services: []
      }),
    /Invalid prefix/
  );
});

test('manages services lifecycle for a client', async (t) => {
  const { clientManager } = await createManagers(t);
  const client = await clientManager.addClient({
    prefix: 'Mr',
    name: 'Service Manager',
    businessName: 'Service Co',
    address: '101 Service Way',
    abn: '22 222 222 222',
    contactNumber: '0400 222 222',
    email: 'services@example.com',
    services: []
  });

  const newService = await clientManager.addService(client.id, {
    description: 'Maintenance',
    pricing: { type: 'hourly', amount: 120 }
  });

  assert.ok(newService.id);

  const updatedService = await clientManager.updateService(client.id, newService.id, {
    amount: 150,
    pricingType: 'hourly'
  });

  assert.equal(updatedService.pricing.amount, 150);

  const removed = await clientManager.removeService(client.id, newService.id);
  assert.equal(removed.id, newService.id);

  const refreshed = await clientManager.getClientById(client.id);
  assert.equal(refreshed.services.length, 0);
});

test('rejects invalid service pricing amount', async (t) => {
  const { clientManager } = await createManagers(t);

  await assert.rejects(
    () =>
      clientManager.addClient({
        prefix: 'Ms',
        name: 'Bad Pricing',
        businessName: 'Error Inc',
        address: '404 Error Blvd',
        abn: '33 333 333 333',
        contactNumber: '0400 333 333',
        email: 'error@example.com',
        services: [
          {
            description: 'Bug Fixing',
            pricing: { type: 'hourly', amount: 0 }
          }
        ]
      }),
    /greater than zero/
  );
});
