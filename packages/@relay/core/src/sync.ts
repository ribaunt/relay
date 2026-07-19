import type {
  SyncOperation,
  SyncOperationStatus,
  SyncOperationType,
  SyncConflict,
} from "./types";
import type { RelayNotifications } from "./notifications";

let nextId = 0;

function generateId(): string {
  return `sync_${Date.now()}_${++nextId}`;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;

export class SyncManager {
  private queue: SyncOperation[] = [];
  private active = false;
  private conflicts: SyncConflict[] = [];

  constructor(
    private notifications: RelayNotifications,
    private maxRetries: number = DEFAULT_MAX_RETRIES,
    private baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
  ) {}

  get pending(): SyncOperation[] {
    return this.queue.filter((op) => op.status === "pending" || op.status === "failed");
  }

  get inProgress(): SyncOperation[] {
    return this.queue.filter((op) => op.status === "in_progress");
  }

  get all(): SyncOperation[] {
    return [...this.queue];
  }

  get pendingConflicts(): SyncConflict[] {
    return this.conflicts.filter((c) => c.resolvedBy === null);
  }

  enqueue(
    type: SyncOperationType,
    path: string,
    totalSize: number,
    executor: (op: SyncOperation, updateProgress: (bytes: number) => void) => Promise<void>,
  ): SyncOperation {
    const op: SyncOperation = {
      id: generateId(),
      type,
      path,
      status: "pending",
      progress: 0,
      totalSize,
      uploadedSize: 0,
      attempts: 0,
      maxRetries: this.maxRetries,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.queue.push(op);

    this.process(op, executor);

    return op;
  }

  cancel(id: string): boolean {
    const op = this.queue.find((o) => o.id === id);
    if (!op || (op.status !== "pending" && op.status !== "failed")) {
      return false;
    }
    op.status = "cancelled";
    op.updatedAt = Date.now();
    return true;
  }

  retry(id: string, executor: (op: SyncOperation, updateProgress: (bytes: number) => void) => Promise<void>): boolean {
    const op = this.queue.find((o) => o.id === id);
    if (!op || op.status !== "failed") return false;

    op.status = "pending";
    op.attempts = 0;
    op.error = undefined;
    op.updatedAt = Date.now();

    this.process(op, executor);
    return true;
  }

  retryAll(executor: (op: SyncOperation, updateProgress: (bytes: number) => void) => Promise<void>): void {
    for (const op of this.queue) {
      if (op.status === "failed") {
        op.status = "pending";
        op.attempts = 0;
        op.error = undefined;
        op.updatedAt = Date.now();
        this.process(op, executor);
      }
    }
  }

  registerConflict(conflict: SyncConflict): void {
    const existing = this.conflicts.find((c) => c.path === conflict.path);
    if (existing) {
      existing.localVersion = conflict.localVersion;
      existing.remoteVersion = conflict.remoteVersion;
      existing.resolvedBy = conflict.resolvedBy;
    } else {
      this.conflicts.push(conflict);
    }
  }

  resolveConflict(path: string, resolvedBy: "local" | "remote" | "manual"): boolean {
    const conflict = this.conflicts.find((c) => c.path === path && c.resolvedBy === null);
    if (!conflict) return false;
    conflict.resolvedBy = resolvedBy;
    return true;
  }

  clearCompleted(): void {
    this.queue = this.queue.filter(
      (op) => op.status !== "completed" && op.status !== "cancelled",
    );
  }

  private process(
    op: SyncOperation,
    executor: (op: SyncOperation, updateProgress: (bytes: number) => void) => Promise<void>,
  ): void {
    const run = async () => {
      op.status = "in_progress";
      op.updatedAt = Date.now();

      const updateProgress = (bytes: number) => {
        op.uploadedSize = bytes;
        op.progress = op.totalSize > 0 ? Math.min(1, bytes / op.totalSize) : 0;
        op.updatedAt = Date.now();
        this.notifications.emit("sync:progress", op);
      };

      while (op.attempts < op.maxRetries) {
        try {
          op.attempts++;
          op.updatedAt = Date.now();
          await executor(op, updateProgress);
          op.status = "completed";
          op.updatedAt = Date.now();
          this.notifications.emit("sync:finished", op);
          return;
        } catch (err) {
          op.error = err instanceof Error ? err.message : String(err);
          op.updatedAt = Date.now();

          if (op.attempts >= op.maxRetries) {
            op.status = "failed";
            op.updatedAt = Date.now();
            this.notifications.emit("sync:error", op);
            return;
          }

          const delay = this.baseDelayMs * Math.pow(2, op.attempts - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    run();
  }
}
