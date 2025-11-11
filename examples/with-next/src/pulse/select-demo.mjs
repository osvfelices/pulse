import { DeterministicScheduler, channel, select, selectCase } from '../../../../lib/runtime/index.js';
import { createHash } from 'crypto';
const print = console.log;
async function runOnce() {
  const scheduler = new DeterministicScheduler();
  const results = [];
  const ch1 = channel(1);
  const ch2 = channel(1);
  const ch3 = channel(1);
  scheduler.spawn(async () => {
  (await scheduler.sleep(5));
  (await ch1.send("from-ch1"));
});
  scheduler.spawn(async () => {
  (await scheduler.sleep(10));
  (await ch2.send("from-ch2"));
});
  scheduler.spawn(async () => {
  (await scheduler.sleep(15));
  (await ch3.send("from-ch3"));
});
  scheduler.spawn(async () => {
  const result1 = (await select([selectCase({ channel: ch1, op: 'recv' }), selectCase({ channel: ch2, op: 'recv' }), selectCase({ channel: ch3, op: 'recv' })]));
  results.push(((("select1-case" + result1.caseIndex) + "-") + result1.value));
  const result2 = (await select([selectCase({ channel: ch1, op: 'recv' }), selectCase({ channel: ch2, op: 'recv' }), selectCase({ channel: ch3, op: 'recv' })]));
  results.push(((("select2-case" + result2.caseIndex) + "-") + result2.value));
  const result3 = (await select([selectCase({ channel: ch1, op: 'recv' }), selectCase({ channel: ch2, op: 'recv' }), selectCase({ channel: ch3, op: 'recv' })]));
  results.push(((("select3-case" + result3.caseIndex) + "-") + result3.value));
});
  (await scheduler.run());
  return results.join(",");
}
async function runMany(n) {
  const runs = [];
  let mismatchCount = 0;
  const firstRun = (await runOnce());
  for (let i = 0; (i < n); (i = (i + 1))) {
  const result = (await runOnce());
  runs.push(result);
  if ((result != firstRun)) {
  (mismatchCount = (mismatchCount + 1));
}
}
  const hashInput = runs.join("\n");
  const hash = createHash("sha256").update(hashInput).digest("hex");
  return {runs: n, sample: firstRun, mismatchCount: mismatchCount, hash: hash};
}
export { runOnce, runMany };
