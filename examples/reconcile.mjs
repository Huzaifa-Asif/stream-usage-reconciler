import { reconcileUsage } from 'stream-usage-reconciler';
const result = reconcileUsage([
  { mode: 'snapshot', eventId: 'start', source: 'message_start', usage: { inputTokens: 18 } },
  { mode: 'snapshot', eventId: 'finish', source: 'message_delta', usage: { outputTokens: 7, totalTokens: 25 } },
]);
console.log(JSON.stringify(result, null, 2));
