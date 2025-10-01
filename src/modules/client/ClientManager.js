import { randomUUID } from 'crypto';

const REQUIRED_STRING_FIELDS = [
  { key: 'name', label: 'Client name' },
  { key: 'businessName', label: 'Business name' },
  { key: 'address', label: 'Address' },
  { key: 'abn', label: 'ABN' },
  { key: 'contactNumber', label: 'Contact number' },
  { key: 'email', label: 'Email' }
];

const VALID_PREFIXES = ['Mr', 'Mrs', 'Ms'];
const VALID_PRICING_TYPES = ['hourly', 'fixed'];

export class ClientManager {
  constructor(dataManager, { collectionName = 'clients' } = {}) {
    if (!dataManager || typeof dataManager.getCollection !== 'function' || typeof dataManager.saveCollection !== 'function') {
      throw new Error('ClientManager requires a DataManager instance.');
    }

    this.dataManager = dataManager;
    this.collectionName = collectionName;
  }

  async listClients() {
    return this.dataManager.getCollection(this.collectionName);
  }

  async getClientById(clientId) {
    if (!clientId) {
      throw new Error('Client ID is required.');
    }
    const clients = await this.dataManager.getCollection(this.collectionName);
    return clients.find((client) => client.id === clientId) || null;
  }

  async addClient(clientInput) {
    const clients = await this.dataManager.getCollection(this.collectionName);
    const sanitized = this.normalizeClientInput(clientInput);
    const timestamp = new Date().toISOString();
    const client = {
      ...sanitized,
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    clients.push(client);
    await this.dataManager.saveCollection(this.collectionName, clients);
    return client;
  }

  async updateClient(clientId, updates) {
    if (!clientId) {
      throw new Error('Client ID is required.');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Updates must be an object.');
    }

    const clients = await this.dataManager.getCollection(this.collectionName);
    const index = clients.findIndex((client) => client.id === clientId);
    if (index === -1) {
      throw new Error(`Client with ID ${clientId} was not found.`);
    }

    const existingClient = clients[index];
    const updatedClient = {
      ...this.normalizeClientInput({ ...existingClient, ...updates }, existingClient),
      id: existingClient.id,
      createdAt: existingClient.createdAt,
      updatedAt: new Date().toISOString()
    };

    clients[index] = updatedClient;
    await this.dataManager.saveCollection(this.collectionName, clients);
    return updatedClient;
  }

  async removeClient(clientId) {
    if (!clientId) {
      throw new Error('Client ID is required.');
    }
    const clients = await this.dataManager.getCollection(this.collectionName);
    const index = clients.findIndex((client) => client.id === clientId);
    if (index === -1) {
      throw new Error(`Client with ID ${clientId} was not found.`);
    }
    const [removed] = clients.splice(index, 1);
    await this.dataManager.saveCollection(this.collectionName, clients);
    return removed;
  }

  async addService(clientId, serviceInput) {
    if (!clientId) {
      throw new Error('Client ID is required.');
    }
    const clients = await this.dataManager.getCollection(this.collectionName);
    const index = clients.findIndex((client) => client.id === clientId);
    if (index === -1) {
      throw new Error(`Client with ID ${clientId} was not found.`);
    }

    const client = clients[index];
    const services = Array.isArray(client.services) ? [...client.services] : [];
    const service = this.normalizeService(serviceInput);
    services.push(service);

    const updatedClient = {
      ...client,
      services,
      updatedAt: new Date().toISOString()
    };

    clients[index] = updatedClient;
    await this.dataManager.saveCollection(this.collectionName, clients);
    return service;
  }

  async updateService(clientId, serviceId, updates) {
    if (!clientId) {
      throw new Error('Client ID is required.');
    }
    if (!serviceId) {
      throw new Error('Service ID is required.');
    }
    if (!updates || typeof updates !== 'object') {
      throw new Error('Updates must be an object.');
    }

    const clients = await this.dataManager.getCollection(this.collectionName);
    const clientIndex = clients.findIndex((client) => client.id === clientId);
    if (clientIndex === -1) {
      throw new Error(`Client with ID ${clientId} was not found.`);
    }

    const client = clients[clientIndex];
    const services = Array.isArray(client.services) ? [...client.services] : [];
    const serviceIndex = services.findIndex((service) => service.id === serviceId);
    if (serviceIndex === -1) {
      throw new Error(`Service with ID ${serviceId} was not found for client ${clientId}.`);
    }

    const existingService = services[serviceIndex];
    const updatedService = this.normalizeService({ ...existingService, ...updates }, existingService);
    services[serviceIndex] = updatedService;

    const updatedClient = {
      ...client,
      services,
      updatedAt: new Date().toISOString()
    };
    clients[clientIndex] = updatedClient;
    await this.dataManager.saveCollection(this.collectionName, clients);
    return updatedService;
  }

  async removeService(clientId, serviceId) {
    if (!clientId) {
      throw new Error('Client ID is required.');
    }
    if (!serviceId) {
      throw new Error('Service ID is required.');
    }

    const clients = await this.dataManager.getCollection(this.collectionName);
    const clientIndex = clients.findIndex((client) => client.id === clientId);
    if (clientIndex === -1) {
      throw new Error(`Client with ID ${clientId} was not found.`);
    }

    const client = clients[clientIndex];
    const services = Array.isArray(client.services) ? [...client.services] : [];
    const serviceIndex = services.findIndex((service) => service.id === serviceId);
    if (serviceIndex === -1) {
      throw new Error(`Service with ID ${serviceId} was not found for client ${clientId}.`);
    }

    const [removed] = services.splice(serviceIndex, 1);
    const updatedClient = {
      ...client,
      services,
      updatedAt: new Date().toISOString()
    };

    clients[clientIndex] = updatedClient;
    await this.dataManager.saveCollection(this.collectionName, clients);
    return removed;
  }

  normalizeClientInput(input, existingClient = null) {
    if (!input || typeof input !== 'object') {
      throw new Error('Client payload must be an object.');
    }

    const merged = existingClient ? { ...existingClient, ...input } : { ...input };
    const client = {};

    this.applyPrefix(merged, client, existingClient);
    this.applyStringFields(merged, client, existingClient);
    this.applyEmail(merged, client, existingClient);
    this.applyServices(merged, client, existingClient);

    return client;
  }

  applyPrefix(source, target, existingClient) {
    const value = source.prefix ?? source.title ?? existingClient?.prefix;
    if (!value) {
      throw new Error(`Prefix is required. Valid values: ${VALID_PREFIXES.join(', ')}.`);
    }
    const sanitized = String(value).trim();
    if (!VALID_PREFIXES.includes(sanitized)) {
      throw new Error(`Invalid prefix "${sanitized}". Valid values: ${VALID_PREFIXES.join(', ')}.`);
    }
    target.prefix = sanitized;
  }

  applyStringFields(source, target, existingClient) {
    REQUIRED_STRING_FIELDS.forEach(({ key, label }) => {
      const value = source[key];
      if (value === undefined || value === null) {
        const existingValue = existingClient?.[key];
        if (!existingValue) {
          throw new Error(`${label} is required.`);
        }
        target[key] = existingValue;
        return;
      }
      if (typeof value !== 'string') {
        throw new Error(`${label} must be a string.`);
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(`${label} cannot be empty.`);
      }
      if (key === 'contactNumber') {
        this.validateContactNumber(trimmed);
      }
      if (key === 'abn') {
        this.validateAbn(trimmed);
      }
      target[key] = trimmed;
    });
  }

  applyEmail(source, target, existingClient) {
    const email = target.email || source.email || existingClient?.email;
    const trimmed = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error('Email must be a valid email address.');
    }
    target.email = trimmed;
  }

  applyServices(source, target, existingClient) {
    const services = source.services ?? existingClient?.services ?? [];
    if (!Array.isArray(services)) {
      throw new Error('Services must be provided as an array.');
    }
    const existingServices = existingClient?.services ?? [];
    target.services = services.map((service) => this.normalizeService(service, existingServices.find((item) => item.id === service.id)));
  }

  validateContactNumber(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 6) {
      throw new Error('Contact number must include at least six digits.');
    }
  }

  validateAbn(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 11) {
      throw new Error('ABN must contain exactly 11 digits.');
    }
  }

  normalizeService(serviceInput, existingService = null) {
    if (!serviceInput || typeof serviceInput !== 'object') {
      throw new Error('Service payload must be an object.');
    }

    const description = this.resolveServiceDescription(serviceInput, existingService);
    const pricing = this.resolveServicePricing(serviceInput, existingService);

    return {
      id: existingService?.id ?? serviceInput.id ?? randomUUID(),
      description,
      pricing
    };
  }

  resolveServiceDescription(serviceInput, existingService) {
    const value = serviceInput.description ?? existingService?.description;
    if (!value || typeof value !== 'string') {
      throw new Error('Service description is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Service description cannot be empty.');
    }
    return trimmed;
  }

  resolveServicePricing(serviceInput, existingService) {
    const basePricing =
      serviceInput.pricing && typeof serviceInput.pricing === 'object'
        ? { ...serviceInput.pricing }
        : {};

    if (serviceInput.pricingType && basePricing.type === undefined) {
      basePricing.type = serviceInput.pricingType;
    }
    if (serviceInput.type && basePricing.type === undefined) {
      basePricing.type = serviceInput.type;
    }

    if (serviceInput.amount !== undefined) {
      basePricing.amount = serviceInput.amount;
    }
    if (serviceInput.rate !== undefined && basePricing.amount === undefined) {
      basePricing.amount = serviceInput.rate;
    }
    if (serviceInput.price !== undefined && basePricing.amount === undefined) {
      basePricing.amount = serviceInput.price;
    }
    if (serviceInput.value !== undefined && basePricing.amount === undefined) {
      basePricing.amount = serviceInput.value;
    }

    const existingPricing = existingService?.pricing ?? {};

    const type = this.extractPricingType(basePricing, existingPricing);
    const amount = this.extractPricingAmount(basePricing, existingPricing);

    return { type, amount };
  }

  extractPricingType(pricing, existingPricing) {
    const candidates = [pricing.type, pricing.pricingType, existingPricing.type];

    const value = candidates.find((candidate) => typeof candidate === 'string');
    if (!value) {
      throw new Error(`Service pricing type is required. Valid values: ${VALID_PRICING_TYPES.join(', ')}.`);
    }

    const normalized = value.toLowerCase();
    if (!VALID_PRICING_TYPES.includes(normalized)) {
      throw new Error(`Invalid pricing type "${value}". Valid values: ${VALID_PRICING_TYPES.join(', ')}.`);
    }
    return normalized;
  }

  extractPricingAmount(pricing, existingPricing) {
    const candidates = [pricing.amount, pricing.value, pricing.rate, existingPricing.amount];

    const candidate = candidates.find((item) => this.isValidNumericCandidate(item));
    if (candidate === undefined) {
      throw new Error('Service pricing amount must be a finite number.');
    }
    const value = this.toNumber(candidate);
    if (value <= 0) {
      throw new Error('Service pricing amount must be greater than zero.');
    }
    return value;
  }

  isValidNumericCandidate(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (typeof value === 'string') {
      return value.trim() !== '' && Number.isFinite(Number(value));
    }
    return false;
  }

  toNumber(value) {
    return typeof value === 'number' ? value : Number(value);
  }
}
