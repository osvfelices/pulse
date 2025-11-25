/**
 * P0-SEL-13: Select waiter cleanup incomplete - waiter stays in queue after losing
 */

import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';

async function test_select_waiter_leak() {
  console.log('\nP0-SEL-13: Select waiter not cleaned from queue when losing');

  const ch1 = new Channel(0);
  const ch2 = new Channel(0);

  // Start select that will block on both channels
  const selectPromise = select([
    new SelectCase({ channel: ch1, op: 'recv' }),
    new SelectCase({ channel: ch2, op: 'recv' })
  ]);

  // Give select time to register waiters
  await new Promise(r => setTimeout(r, 10));

  console.log(`  ch1 recvQueue before: ${ch1.getRecvQueueLength()}`);
  console.log(`  ch2 recvQueue before: ${ch2.getRecvQueueLength()}`);

  // Send to ch1 (wins), ch2 waiter should be cleaned
  await ch1.send('value1');

  const result = await selectPromise;
  console.log(`  Select result: case ${result.caseIndex}`);

  console.log(`  ch1 recvQueue after: ${ch1.getRecvQueueLength()}`);
  console.log(`  ch2 recvQueue after: ${ch2.getRecvQueueLength()}`);

  // Bug: ch2 still has waiter from lost select
  if (ch2.getRecvQueueLength() > 0) {
    console.log('  ERROR: Losing waiter not cleaned from ch2 queue!');

    // Try to send to ch2 - should not unblock anyone
    const ch2SendPromise = ch2.send('value2');
    const settled = await Promise.race([
      ch2SendPromise.then(() => 'sent'),
      new Promise(r => setTimeout(() => r('timeout'), 50))
    ]);

    if (settled === 'sent') {
      console.log('  ERROR: Stale waiter in ch2 queue consumed send!');
    }
  } else {
    console.log('  PASS: Losing waiter cleaned from queue');
  }

  ch1.close();
  ch2.close();
}

await test_select_waiter_leak();
