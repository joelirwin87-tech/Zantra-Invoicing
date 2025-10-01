import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';

const DEFAULT_ENCODING = 'utf-8';

export class DataManager {
  constructor(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('DataManager requires a valid file path.');
    }

    this.filePath = resolve(filePath);
    this.data = null;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await this.ensureDirectory();
    await this.ensureFile();
    this.initialized = true;
  }

  async ensureDirectory() {
    const directory = dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
  }

  async ensureFile() {
    try {
      await fs.access(this.filePath);
    } catch (error) {
      await fs.writeFile(this.filePath, '{}', DEFAULT_ENCODING);
    }
  }

  async loadData() {
    await this.ensureInitialized();
    if (this.data) {
      return this.data;
    }

    const raw = await fs.readFile(this.filePath, DEFAULT_ENCODING);
    if (!raw.trim()) {
      this.data = {};
      return this.data;
    }

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Data file must contain a JSON object.');
      }
      this.data = parsed;
      return this.data;
    } catch (error) {
      throw new Error(`Failed to parse data file: ${error.message}`);
    }
  }

  async getCollection(collectionName) {
    if (!collectionName) {
      throw new Error('Collection name is required.');
    }
    const data = await this.loadData();
    if (!Array.isArray(data[collectionName])) {
      data[collectionName] = [];
    }
    return data[collectionName].map((item) => this.clone(item));
  }

  async saveCollection(collectionName, items) {
    if (!collectionName) {
      throw new Error('Collection name is required.');
    }
    if (!Array.isArray(items)) {
      throw new Error('Collection items must be an array.');
    }
    const data = await this.loadData();
    data[collectionName] = items.map((item) => this.clone(item));
    await this.persist(data);
    return data[collectionName].map((item) => this.clone(item));
  }

  async persist(updatedData) {
    await this.ensureInitialized();
    const serialized = JSON.stringify(updatedData, null, 2);
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, serialized, DEFAULT_ENCODING);
    await fs.rename(tempPath, this.filePath);
    this.data = this.clone(updatedData);
  }

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}
