import { DataManager } from '../data/DataManager.js';

const BACKUP_MIME_TYPE = 'application/json';
const BACKUP_FILENAME_PREFIX = 'zantra-backup';

const resolveDocument = () => (typeof document !== 'undefined' ? document : null);

const createTimestampedFilename = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${BACKUP_FILENAME_PREFIX}-${timestamp}.json`;
};

const triggerDownload = (blob, filename) => {
  const doc = resolveDocument();
  if (!doc) {
    throw new Error('Unable to initiate download in this environment.');
  }
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('File downloads are not supported in this environment.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    doc.body.appendChild(anchor);
    anchor.click();
    doc.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export class BackupManager {
  static async downloadBackup() {
    const payload = DataManager.exportAll();
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: BACKUP_MIME_TYPE });
    triggerDownload(blob, createTimestampedFilename());
    return payload;
  }

  static async restoreBackup(file) {
    if (!file) {
      throw new Error('Select a backup file to restore.');
    }
    if (typeof file.size === 'number' && file.size === 0) {
      throw new Error('The selected backup file is empty.');
    }
    let raw;
    try {
      if (typeof file.text === 'function') {
        raw = await file.text();
      } else if (typeof file.arrayBuffer === 'function') {
        raw = await file.arrayBuffer();
      } else {
        throw new Error('Unsupported backup file type.');
      }
    } catch (error) {
      throw new Error('Unable to read the selected backup file.');
    }
    const payload = DataManager.parseBackupPayload(raw);
    DataManager.restoreAll(payload);
    return payload;
  }
}

export default BackupManager;
