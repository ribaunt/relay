import type { StoredEntry } from "@relay/types"

type PendingOperation = {
  id: string
  type: "put" | "delete"
  entry?: StoredEntry
  previousEntry?: StoredEntry | null
  resolve: () => void
  reject: (error: Error) => void
}

type RollbackCallback = (operation: PendingOperation) => void

export class OptimisticQueue {
  private pending = new Map<string, PendingOperation>()
  private onRollback: RollbackCallback | null = null

  setRollbackHandler(handler: RollbackCallback): void {
    this.onRollback = handler
  }

  async enqueuePut(
    id: string,
    entry: StoredEntry,
    previousEntry: StoredEntry | null,
    executor: () => Promise<void>,
  ): Promise<void> {
    return this.enqueue({
      id,
      type: "put",
      entry,
      previousEntry,
      executor,
    })
  }

  async enqueueDelete(
    id: string,
    previousEntry: StoredEntry | null,
    executor: () => Promise<void>,
  ): Promise<void> {
    return this.enqueue({
      id,
      type: "delete",
      previousEntry,
      executor,
    })
  }

  private enqueue(op: Omit<PendingOperation, "resolve" | "reject"> & { executor: () => Promise<void> }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const pending: PendingOperation = {
        id: op.id,
        type: op.type,
        entry: op.entry,
        previousEntry: op.previousEntry,
        resolve,
        reject,
      }

      this.pending.set(op.id, pending)

      op.executor()
        .then(() => {
          this.pending.delete(op.id)
          resolve()
        })
        .catch((error) => {
          this.pending.delete(op.id)
          if (this.onRollback) {
            this.onRollback(pending)
          }
          reject(error)
        })
    })
  }

  getPending(): PendingOperation[] {
    return Array.from(this.pending.values())
  }

  clear(): void {
    for (const op of this.pending.values()) {
      op.reject(new Error("Queue cleared"))
    }
    this.pending.clear()
  }
}
