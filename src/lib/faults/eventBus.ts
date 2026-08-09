/**
 * OmniMonitor Fault Event Bus & Output Interface
 * Decoupled event bus emitting typed FaultEventPayloads to downstream consumers.
 */

import { FaultEventPayload } from "@/types/faults";

export type FaultEventListener = (event: FaultEventPayload) => void;

export class FaultEventBus {
  private listeners: Set<FaultEventListener> = new Set();
  private eventHistory: FaultEventPayload[] = [];
  private activePendingMap: Map<string, FaultEventPayload> = new Map();
  private maxHistorySize: number = 200;

  /**
   * Subscribes a listener to live emitted fault events.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: FaultEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emits a newly detected fault event to all active subscribers.
   */
  public emit(event: FaultEventPayload): void {
    // Add to active pending map if not already present
    this.activePendingMap.set(event.id, event);

    // Record to historical ring buffer
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.pop();
    }

    // Notify subscribers asynchronously/safely
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[FAULT EVENT BUS ERROR] Subscriber threw error:", err);
      }
    }
  }

  /**
   * Emits a batch of fault events.
   */
  public emitBatch(events: FaultEventPayload[]): void {
    for (const evt of events) {
      this.emit(evt);
    }
  }

  /**
   * Retrieves active pending faults awaiting operator action.
   */
  public getActivePendingFaults(): FaultEventPayload[] {
    return Array.from(this.activePendingMap.values()).filter((f) => f.status === "pending");
  }

  /**
   * Marks a fault as resolved/handled.
   */
  public resolveFault(faultId: string): boolean {
    const fault = this.activePendingMap.get(faultId);
    if (fault) {
      fault.resolved_at = new Date().toISOString();
      this.activePendingMap.delete(faultId);
      return true;
    }
    return false;
  }

  /**
   * Retrieves recent historical fault events (up to limit).
   */
  public getRecentEvents(limit: number = 50): FaultEventPayload[] {
    return this.eventHistory.slice(0, limit);
  }

  /**
   * Clears in-memory active faults and history (e.g. on show reset).
   */
  public clearAll(): void {
    this.activePendingMap.clear();
    this.eventHistory = [];
  }

  public getSubscriberCount(): number {
    return this.listeners.size;
  }
}

const globalFaultBusKey = Symbol.for("omnimonitor.fault_event_bus");

export function getGlobalFaultEventBus(): FaultEventBus {
  const globalStore = globalThis as unknown as { [globalFaultBusKey]?: FaultEventBus };
  if (!globalStore[globalFaultBusKey]) {
    globalStore[globalFaultBusKey] = new FaultEventBus();
  }
  return globalStore[globalFaultBusKey]!;
}
