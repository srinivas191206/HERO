import { localDb, OutboundQueueItem } from '../queue/OfflineDatabase';
import { clientEventBus } from '../events/EventBus';

export interface ITransport {
  send(priority: number, type: string, payload: any): Promise<any>;
  isConnected(): boolean;
}

export class PriorityEngine {
  private transport: ITransport | null = null;
  private isProcessing = false;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Listen for connection status changes to automatically trigger sync
    clientEventBus.subscribe('network:online', () => {
      console.log('[PriorityEngine] Network online event received. Draining queue...');
      this.triggerProcess();
    });
  }

  setTransport(transport: ITransport) {
    this.transport = transport;
    console.log('[PriorityEngine] Transport provider attached.');
    if (this.transport.isConnected()) {
      this.triggerProcess();
    }
  }

  // Add an item to the priority queue
  async enqueue(
    type: OutboundQueueItem['type'],
    priority: number,
    payload: any,
    dedupKey?: string
  ): Promise<number> {
    try {
      // Duplicate prevention: If a matching pending payload exists, skip insertion
      if (dedupKey) {
        const existing = await localDb.outboundQueue
          .where('status')
          .equals('pending')
          .toArray();
        
        const isDuplicate = existing.some((item: any) => {
          if (type === 'gps' && item.type === 'gps') {
            return item.payload.timestamp === payload.timestamp;
          }
          if (type === 'message' && item.type === 'message') {
            return item.payload.id === payload.id;
          }
          return false;
        });

        if (isDuplicate) {
          console.log(`[PriorityEngine] Duplicate detected for ${type}. Skipping queue.`);
          return -1;
        }
      }

      const id = await localDb.outboundQueue.add({
        priority,
        type,
        payload,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0
      });

      console.log(`[PriorityEngine] Enqueued [P${priority}] task of type: ${type} (ID: ${id})`);
      
      // Notify bus of new item (useful for updating dashboard counters)
      clientEventBus.publish('queue:change', { size: await this.getQueueSize() });

      // Trigger queue process immediately if online
      this.triggerProcess();

      return id;
    } catch (error) {
      console.error('[PriorityEngine] Failed to enqueue item:', error);
      throw error;
    }
  }

  // Trigger non-blocking asynchronous queue processing
  triggerProcess() {
    if (this.isProcessing) return;
    this.processQueue().catch(err => console.error('[PriorityEngine] Queue run error:', err));
  }

  async getQueueSize(): Promise<number> {
    return localDb.outboundQueue.count();
  }

  private async processQueue() {
    if (this.isProcessing) return;
    if (!this.transport || !this.transport.isConnected()) {
      console.log('[PriorityEngine] Queue sweep skipped: Transport unavailable.');
      return;
    }

    this.isProcessing = true;

    try {
      let active = true;

      while (active) {
        // Fetch items sorted by priority ascending (1 is highest, 8 is lowest)
        const nextItem = await localDb.outboundQueue
          .orderBy('priority')
          .filter((item: any) => item.status !== 'syncing' && item.retryCount < 5)
          .first();

        if (!nextItem || !nextItem.id) {
          active = false;
          break;
        }

        // Double check network state before sending
        if (!this.transport.isConnected()) {
          console.log('[PriorityEngine] Link lost during queue transmission. Stopping.');
          active = false;
          break;
        }

        await this.syncItem(nextItem);
      }
    } catch (err) {
      console.error('[PriorityEngine] Error processing priority queue:', err);
    } finally {
      this.isProcessing = false;
      clientEventBus.publish('queue:change', { size: await this.getQueueSize() });
    }
  }

  private async syncItem(item: OutboundQueueItem) {
    if (!item.id || !this.transport) return;

    // Mark as syncing
    await localDb.outboundQueue.update(item.id, { status: 'syncing' });

    try {
      console.log(`[PriorityEngine] Syncing P${item.priority} (${item.type}) ID: ${item.id}...`);
      
      // Send via transport
      await this.transport.send(item.priority, item.type, item.payload);

      // Success: Remove from queue database
      await localDb.outboundQueue.delete(item.id);
      console.log(`[PriorityEngine] Synced and cleared item: ${item.id}`);

      // Handle custom caching resolutions upon sync completion
      if (item.type === 'message') {
        await localDb.cachedMessages.update(item.payload.id, { syncStatus: 'delivered' });
        clientEventBus.publish('message:synced', { id: item.payload.id });
      } else if (item.type === 'evidence') {
        await localDb.cachedEvidence.update(item.payload.id, { syncStatus: 'delivered' });
        clientEventBus.publish('evidence:synced', { id: item.payload.id });
      }

    } catch (error) {
      const nextRetry = item.retryCount + 1;
      console.error(`[PriorityEngine] Failed to sync item ${item.id}. Attempt: ${nextRetry}`, error);

      if (nextRetry >= 5) {
        // Max retries reached, flag as failed permanently (or user intervention)
        await localDb.outboundQueue.update(item.id, { status: 'failed', retryCount: nextRetry });
        
        if (item.type === 'message') {
          await localDb.cachedMessages.update(item.payload.id, { syncStatus: 'failed' });
        }
      } else {
        // Return to pending, increment retry count
        await localDb.outboundQueue.update(item.id, { status: 'pending', retryCount: nextRetry });
      }

      // Trigger exponential backoff on error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  startPeriodicSync(intervalMs: number = 15000) {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      this.triggerProcess();
    }, intervalMs);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const clientPriorityEngine = new PriorityEngine();
