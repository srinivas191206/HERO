type EventCallback = (data: any) => void;

class EventBus {
  private listeners: Record<string, EventCallback[]> = {};

  publish(event: string, data?: any): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`Error executing listener for event: ${event}`, err);
      }
    });
  }

  subscribe(event: string, cb: EventCallback): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(cb);

    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(x => x !== cb);
    };
  }

  clearAll(): void {
    this.listeners = {};
  }
}

export const clientEventBus = new EventBus();
