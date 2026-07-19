import type { RelayEvent, RelayEventHandler } from "./types";

export class RelayNotifications {
  private handlers = new Map<RelayEvent, Set<RelayEventHandler>>();

  on<T = unknown>(event: RelayEvent, handler: RelayEventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as RelayEventHandler);

    return () => {
      this.off(event, handler);
    };
  }

  off<T = unknown>(event: RelayEvent, handler: RelayEventHandler<T>): void {
    this.handlers.get(event)?.delete(handler as RelayEventHandler);
  }

  emit<T = unknown>(event: RelayEvent, payload?: T): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // prevent one handler from breaking others
      }
    }
  }

  removeAll(event?: RelayEvent): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(event: RelayEvent): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
