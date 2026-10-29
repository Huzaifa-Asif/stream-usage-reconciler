# stream-usage-reconciler

Provider-neutral, dependency-free reconciliation for token usage that arrives across multiple AI streaming events. It merges cumulative snapshots, adds explicit deltas, ignores duplicate event IDs, and reports counter regressions or inconsistent totals instead of silently hiding them.

## Why

Streaming adapters do not always put prompt, completion, cache, reasoning, and total counters in one final chunk. A naïve “last chunk wins” reducer loses earlier metadata; naïvely summing cumulative snapshots double-counts it. This package makes the caller declare whether each event is a snapshot or delta and returns evidence when counters disagree.

```js
import { reconcileUsage } from 'stream-usage-reconciler';

const result = reconcileUsage([
  { mode: 'snapshot', eventId: 'start', usage: { inputTokens: 18 } },
  { mode: 'snapshot', eventId: 'finish', usage: { outputTokens: 7, totalTokens: 25 } },
]);
```

CommonJS uses `const { reconcileUsage } = require('stream-usage-reconciler')`.

## API

`reconcileUsage(events)` consumes an iterable of `{ mode, usage, eventId?, source? }`. Supported counters are `inputTokens`, `outputTokens`, `totalTokens`, `cacheReadTokens`, `cacheWriteTokens`, and `reasoningTokens`. Snapshot counters retain the highest observed value and report regressions. Delta counters are added. Repeated non-empty `eventId` values are ignored.

`new UsageReconciler({ maxRememberedEventIds: 10_000 }).add(event).result()` provides the same logic incrementally. Event-ID deduplication uses a bounded FIFO window (10,000 IDs by default); an evicted old ID can be accepted again. Choose a bound for the maximum replay window of one finite stream. Results and their public collections are frozen snapshots.

## Runtime and examples

- Node.js 20 or newer; ESM and CommonJS entry points; bundled TypeScript declarations.
- No runtime dependencies, network access, telemetry, environment variables, or lifecycle scripts.
- Run `node examples/reconcile.mjs` after installation.

## Alternatives

- A hand-written provider-specific reducer is appropriate when one SDK has stable, documented usage semantics.
- Provider SDK final-response helpers may already return authoritative usage; use those when they are complete.
- OpenTelemetry records measurements but does not decide whether mixed streaming counters are snapshots or deltas.
- `ai-stream-auditor` checks lifecycle completeness and malformed endings; it does not reconcile usage counter snapshots and deltas.

This package deliberately does not parse raw SSE, estimate missing tokens, price usage, validate billing, or infer provider semantics. Callers must label snapshots versus deltas correctly. Invalid modes throw. JavaScript numbers cannot exactly represent counters above `Number.MAX_SAFE_INTEGER`, so inputs and derived additions that would exceed it are rejected or reported without updating the counter.

## Troubleshooting

- `snapshot-regression`: events arrived out of order or a provider reset a cumulative counter; the higher value is retained.
- `inconsistent-total`: the explicit total is below input plus output; retain the issue for diagnostics rather than silently rewriting provider data.
- Unexpected double counting: a cumulative provider event was labeled `delta`.

## Development and security

Run `npm ci --ignore-scripts && npm run check`. The committed lockfile pins development tooling; runtime dependencies are absent. See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Licensed under MIT.
