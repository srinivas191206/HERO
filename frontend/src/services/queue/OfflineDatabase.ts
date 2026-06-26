import Dexie, { type Table } from 'dexie';
import { Message, Incident, User, Evidence, Device } from '../../types';

export interface OutboundQueueItem {
  id?: number;
  priority: number; // P1 (Emergency SOS) to P8 (Logs)
  type: 'message' | 'sos' | 'gps' | 'evidence' | 'device_sync' | 'call_negotiate';
  payload: any;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
}

// Full In-Memory Table Mock matching Dexie's API for resilience fallback
export class InMemoryTable {
  private data = new Map<any, any>();

  async count() {
    return this.data.size;
  }

  async add(item: any) {
    const id = item.id || Math.floor(Math.random() * 1000000);
    const itemWithId = { ...item, id };
    this.data.set(id, itemWithId);
    return id;
  }

  async put(item: any, key?: any) {
    const k = key || item.id || item.deviceId || Math.floor(Math.random() * 1000000);
    this.data.set(k, item);
    return k;
  }

  async get(key: any) {
    return this.data.get(key) || null;
  }

  async delete(key: any) {
    this.data.delete(key);
  }

  async update(key: any, modifications: any) {
    const existing = this.data.get(key);
    if (existing) {
      this.data.set(key, { ...existing, ...modifications });
      return 1;
    }
    return 0;
  }

  async toArray() {
    return Array.from(this.data.values());
  }

  orderBy(index: string) {
    const sortedArray = () => {
      const arr = Array.from(this.data.values());
      return arr.sort((a, b) => (a[index] > b[index] ? 1 : -1));
    };

    const chain = {
      reverse: () => {
        const revSortedArray = () => {
          const arr = Array.from(this.data.values());
          return arr.sort((a, b) => (b[index] > a[index] ? 1 : -1));
        };
        return {
          toArray: async () => revSortedArray(),
          filter: (fn: (item: any) => boolean) => {
            const filtered = revSortedArray().filter(fn);
            return {
              first: async () => filtered[0] || null,
              toArray: async () => filtered
            };
          }
        };
      },
      toArray: async () => sortedArray(),
      filter: (fn: (item: any) => boolean) => {
        const filtered = sortedArray().filter(fn);
        return {
          first: async () => filtered[0] || null,
          toArray: async () => filtered
        };
      }
    };
    return chain;
  }

  where(index: string) {
    return {
      equals: (value: any) => ({
        toArray: async () => {
          return Array.from(this.data.values()).filter(item => item[index] === value);
        }
      })
    };
  }

  filter(fn: (item: any) => boolean) {
    return {
      first: async () => {
        return Array.from(this.data.values()).find(fn) || null;
      }
    };
  }
}

export class DexieOfflineDatabase extends Dexie {
  outboundQueue!: Table<OutboundQueueItem, number>;
  cachedMessages!: Table<Message, string>;
  cachedIncidents!: Table<Incident, string>;
  cachedOfficers!: Table<User, string>;
  cachedEvidence!: Table<Evidence, string>;
  cachedDevices!: Table<Device, string>;

  constructor() {
    super('eluru_offline_db');
    this.version(1).stores({
      outboundQueue: '++id, priority, type, timestamp, status',
      cachedMessages: 'id, senderId, recipientId, teamId, timestamp, syncStatus',
      cachedIncidents: 'id, priority, status, timestamp',
      cachedOfficers: 'id, badgeNumber, status, teamId',
      cachedEvidence: 'id, officerId, incidentId, timestamp, syncStatus',
      cachedDevices: 'deviceId, status'
    });
  }
}

let dexieDb: DexieOfflineDatabase | null = null;
let useFallback = false;

// Synchronous initial check to prevent crashing on window/indexedDB reference errors
if (typeof window !== 'undefined') {
  try {
    if (!window.indexedDB) {
      useFallback = true;
    } else {
      dexieDb = new DexieOfflineDatabase();
    }
  } catch (e) {
    useFallback = true;
  }
} else {
  useFallback = true; // Node SSR context
}

// Export a plain wrapper object so we can overwrite properties dynamically.
// Pre-initialize with InMemoryTable fallback to prevent null pointer crashes during startup.
export const localDb = {
  outboundQueue: (dexieDb ? dexieDb.outboundQueue : new InMemoryTable()) as any,
  cachedMessages: (dexieDb ? dexieDb.cachedMessages : new InMemoryTable()) as any,
  cachedIncidents: (dexieDb ? dexieDb.cachedIncidents : new InMemoryTable()) as any,
  cachedOfficers: (dexieDb ? dexieDb.cachedOfficers : new InMemoryTable()) as any,
  cachedEvidence: (dexieDb ? dexieDb.cachedEvidence : new InMemoryTable()) as any,
  cachedDevices: (dexieDb ? dexieDb.cachedDevices : new InMemoryTable()) as any,
  open: () => dexieDb ? dexieDb.open() : Promise.resolve()
};

// Hot-swap database tables to InMemory fallback
export function activateInMemoryFallback() {
  console.warn('[OfflineDatabase] IndexedDB blocked. Activating In-Memory storage fallback.');
  localDb.outboundQueue = new InMemoryTable() as any;
  localDb.cachedMessages = new InMemoryTable() as any;
  localDb.cachedIncidents = new InMemoryTable() as any;
  localDb.cachedOfficers = new InMemoryTable() as any;
  localDb.cachedEvidence = new InMemoryTable() as any;
  localDb.cachedDevices = new InMemoryTable() as any;
}

if (useFallback || !dexieDb) {
  activateInMemoryFallback();
} else {
  // Asynchronous verification check (handles lazy SecurityError blocks in WebViews)
  try {
    localDb.open()
      .then(() => {
        console.log('[OfflineDatabase] IndexedDB storage verified and running.');
      })
      .catch(err => {
        console.warn('[OfflineDatabase] IndexedDB open promise rejected, using fallback:', err);
        activateInMemoryFallback();
      });
  } catch (err) {
    console.warn('[OfflineDatabase] Synchronous error during IndexedDB open, using fallback:', err);
    activateInMemoryFallback();
  }
}
