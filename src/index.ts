export type UsageField = 'inputTokens' | 'outputTokens' | 'totalTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'reasoningTokens';
export type Usage = Partial<Record<UsageField, number>>;
export interface UsageEvent { mode: 'snapshot' | 'delta'; usage: Usage; eventId?: string; source?: string; }
export interface UsageIssue { code: 'invalid-value' | 'counter-overflow' | 'snapshot-regression' | 'inconsistent-total'; field?: UsageField; eventIndex: number; source?: string; message: string; }
export interface ReconcileResult { usage: Readonly<Usage>; issues: readonly UsageIssue[]; acceptedEvents: number; duplicateEvents: number; }
export interface UsageReconcilerOptions { maxRememberedEventIds?: number; }

const fields: readonly UsageField[] = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];

function valid(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }

export class UsageReconciler {
  #usage: Usage = {};
  #issues: UsageIssue[] = [];
  #seen = new Set<string>();
  #accepted = 0;
  #duplicates = 0;
  #maxRememberedEventIds: number;

  constructor(options: UsageReconcilerOptions = {}) {
    const maximum = options.maxRememberedEventIds ?? 10_000;
    if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new RangeError('maxRememberedEventIds must be a positive safe integer');
    this.#maxRememberedEventIds = maximum;
  }

  add(event: UsageEvent): this {
    const eventIndex = this.#accepted + this.#duplicates;
    if (event.mode !== 'snapshot' && event.mode !== 'delta') throw new TypeError('event.mode must be "snapshot" or "delta"');
    if (event.eventId && this.#seen.has(event.eventId)) { this.#duplicates += 1; return this; }
    if (event.eventId) {
      if (this.#seen.size >= this.#maxRememberedEventIds) {
        const oldest = this.#seen.values().next().value as string | undefined;
        if (oldest !== undefined) this.#seen.delete(oldest);
      }
      this.#seen.add(event.eventId);
    }
    this.#accepted += 1;
    for (const field of fields) {
      const value = event.usage[field];
      if (value === undefined) continue;
      if (!valid(value)) {
        this.#issues.push({ code: 'invalid-value', field, eventIndex, source: event.source, message: `${field} must be a non-negative safe integer` });
        continue;
      }
      const previous = this.#usage[field] ?? 0;
      if (event.mode === 'delta') {
        const next = previous + value;
        if (!Number.isSafeInteger(next)) this.#issues.push({ code: 'counter-overflow', field, eventIndex, source: event.source, message: `${field} would exceed Number.MAX_SAFE_INTEGER; the previous value was retained` });
        else this.#usage[field] = next;
      }
      else if (value < previous) this.#issues.push({ code: 'snapshot-regression', field, eventIndex, source: event.source, message: `${field} regressed from ${previous} to ${value}; the higher value was retained` });
      else this.#usage[field] = value;
    }
    const minimumTotal = (this.#usage.inputTokens ?? 0) + (this.#usage.outputTokens ?? 0);
    if (!Number.isSafeInteger(minimumTotal)) {
      this.#issues.push({ code: 'counter-overflow', field: 'totalTokens', eventIndex, source: event.source, message: 'inputTokens + outputTokens exceeds Number.MAX_SAFE_INTEGER; total consistency was not compared' });
    } else if (this.#usage.totalTokens !== undefined && this.#usage.totalTokens < minimumTotal) {
      this.#issues.push({ code: 'inconsistent-total', field: 'totalTokens', eventIndex, source: event.source, message: `totalTokens ${this.#usage.totalTokens} is smaller than inputTokens + outputTokens (${minimumTotal})` });
    }
    return this;
  }

  result(): ReconcileResult {
    return Object.freeze({ usage: Object.freeze({ ...this.#usage }), issues: Object.freeze(this.#issues.map((issue) => Object.freeze({ ...issue }))), acceptedEvents: this.#accepted, duplicateEvents: this.#duplicates });
  }
}

export function reconcileUsage(events: Iterable<UsageEvent>): ReconcileResult {
  const reconciler = new UsageReconciler();
  for (const event of events) reconciler.add(event);
  return reconciler.result();
}
