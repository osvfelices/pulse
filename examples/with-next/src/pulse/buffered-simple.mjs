import { DeterministicScheduler, channel } from '../../../../lib/runtime/index.js';
import { createHash } from 'crypto';
const print = console.log;
async function runOnce() {
  const scheduler = new DeterministicScheduler();
  const results = [];
  const ch = channel(5);
  async function producer() {
  for (let i = 1; (i <= 5); (i = (i + 1))) {
  (await ch.send(i));
  results.push(("sent-" + i));
}
  ch.close();
}
  async function consumer() {
  for await (const val of ch) {
  results.push(("recv-" + val));
}
}
  scheduler.spawn(producer);
  scheduler.spawn(consumer);
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
