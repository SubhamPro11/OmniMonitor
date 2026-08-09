/**
 * OmniMonitor Metric Debouncer & Rolling Filter
 * Tracks consecutive metric breaches per drone and metric to eliminate false positives.
 */

export class MetricDebouncer {
  // Map of "droneId:metricKey" -> consecutive breach count
  private breachCounts: Map<string, number> = new Map();
  // Map of "droneId:metricKey" -> timestamp of first breach in current streak
  private streakStartTimes: Map<string, number> = new Map();

  private makeKey(droneId: string, metricKey: string): string {
    return `${droneId}:${metricKey}`;
  }

  /**
   * Records a breach for a specific metric on a drone.
   * Increments the consecutive breach counter and returns the updated count.
   */
  public recordBreach(droneId: string, metricKey: string, nowMs: number = Date.now()): number {
    const key = this.makeKey(droneId, metricKey);
    const current = this.breachCounts.get(key) || 0;
    const next = current + 1;
    this.breachCounts.set(key, next);

    if (current === 0) {
      this.streakStartTimes.set(key, nowMs);
    }

    return next;
  }

  /**
   * Records a nominal reading for a metric on a drone.
   * Resets the breach counter to zero to clear transient spikes.
   */
  public recordNominal(droneId: string, metricKey: string): void {
    const key = this.makeKey(droneId, metricKey);
    this.breachCounts.delete(key);
    this.streakStartTimes.delete(key);
  }

  /**
   * Retrieves the current consecutive breach count.
   */
  public getBreachCount(droneId: string, metricKey: string): number {
    const key = this.makeKey(droneId, metricKey);
    return this.breachCounts.get(key) || 0;
  }

  /**
   * Retrieves duration in milliseconds of the current ongoing breach streak.
   */
  public getStreakDurationMs(droneId: string, metricKey: string, nowMs: number = Date.now()): number {
    const key = this.makeKey(droneId, metricKey);
    const start = this.streakStartTimes.get(key);
    if (!start) return 0;
    return Math.max(0, nowMs - start);
  }

  /**
   * Clears state for a single drone (e.g. on landing or simulator reset).
   */
  public resetDrone(droneId: string): void {
    const prefix = `${droneId}:`;
    for (const key of Array.from(this.breachCounts.keys())) {
      if (key.startsWith(prefix)) {
        this.breachCounts.delete(key);
        this.streakStartTimes.delete(key);
      }
    }
  }

  /**
   * Clears all debouncer state across all drones.
   */
  public clearAll(): void {
    this.breachCounts.clear();
    this.streakStartTimes.clear();
  }
}
