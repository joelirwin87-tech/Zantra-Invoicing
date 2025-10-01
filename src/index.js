import '../styles/styles.css';
import { DataManager } from './data/DataManager.js';
import { ClientManager } from './modules/client/ClientManager.js';

const bootstrap = () => {
  console.log('Zantra initialized');
  const clients = ClientManager.getAllClients();
  console.log('Loaded clients:', clients);
};

bootstrap();

export { DataManager, ClientManager };
