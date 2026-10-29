import assert from 'node:assert/strict';
import test from 'node:test';
import api from '../dist/index.js';
const { reconcileUsage, UsageReconciler } = api;

test('retains usage split across snapshots', () => {
  const result = reconcileUsage([{ mode: 'snapshot', usage: { inputTokens: 10 } }, { mode: 'snapshot', usage: { outputTokens: 4, totalTokens: 14 } }]);
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  assert.equal(result.issues.length, 0);
});
test('adds deltas and deduplicates event ids', () => {
  const event = { mode: 'delta', eventId: 'u1', usage: { outputTokens: 3 } };
  const result = reconcileUsage([event, event, { mode: 'delta', eventId: 'u2', usage: { outputTokens: 2 } }]);
  assert.equal(result.usage.outputTokens, 5); assert.equal(result.duplicateEvents, 1);
});
test('keeps the higher snapshot and reports regression', () => {
  const result = reconcileUsage([{ mode: 'snapshot', usage: { inputTokens: 9 } }, { mode: 'snapshot', usage: { inputTokens: 7 } }]);
  assert.equal(result.usage.inputTokens, 9); assert.equal(result.issues[0].code, 'snapshot-regression');
});
test('rejects unsafe values without corrupting totals', () => {
  const result = reconcileUsage([{ mode: 'delta', usage: { inputTokens: -1, outputTokens: Number.NaN } }]);
  assert.deepEqual(result.usage, {}); assert.equal(result.issues.length, 2);
});
test('reports inconsistent explicit totals', () => {
  const result = reconcileUsage([{ mode: 'snapshot', source: 'provider', usage: { inputTokens: 8, outputTokens: 5, totalTokens: 10 } }]);
  assert.equal(result.issues.at(-1).code, 'inconsistent-total');
});
test('supports incremental use and immutable snapshots', () => {
  const r = new UsageReconciler().add({ mode: 'delta', usage: { cacheReadTokens: 2 } });
  const result = r.result(); assert(Object.isFrozen(result)); assert(Object.isFrozen(result.usage));
});
test('reports delta and consistency-sum overflow without unsafe counters', () => {
  const result = reconcileUsage([{ mode: 'delta', usage: { inputTokens: Number.MAX_SAFE_INTEGER } }, { mode: 'delta', usage: { inputTokens: 1, outputTokens: 1 } }]);
  assert.equal(result.usage.inputTokens, Number.MAX_SAFE_INTEGER); assert.equal(result.usage.outputTokens, 1);
  assert.equal(result.issues.filter(({ code }) => code === 'counter-overflow').length, 2);
});
test('rejects invalid runtime modes', () => {
  assert.throws(() => reconcileUsage([{ mode: 'guess', usage: { inputTokens: 1 } }]), TypeError);
});
test('bounds remembered event ids with FIFO eviction', () => {
  const reconciler = new UsageReconciler({ maxRememberedEventIds: 2 });
  reconciler.add({ mode: 'delta', eventId: 'a', usage: { inputTokens: 1 } }).add({ mode: 'delta', eventId: 'b', usage: { inputTokens: 1 } }).add({ mode: 'delta', eventId: 'c', usage: { inputTokens: 1 } }).add({ mode: 'delta', eventId: 'a', usage: { inputTokens: 1 } });
  assert.equal(reconciler.result().usage.inputTokens, 4);
});
