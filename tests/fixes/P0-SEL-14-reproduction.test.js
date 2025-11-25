/**
 * P0-SEL-14: Select handler throws after channel op, incomplete cleanup
 */

import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';

async function test_select_handler_throw_cleanup() {
  console.log('\nP0-SEL-14: Select handler throws, other waiters not cleaned');

  const ch1 = new Channel(0);
  const ch2 = new Channel(0);
  let ch2WaitersCleaned = false;

  // Start select with handler that will throw
  const selectPromise = select([
    new SelectCase({
      channel: ch1,
      op: 'recv',
      handler: (val) => {
        throw new Error('Handler error after recv');
      }
    }),
    new SelectCase({ channel: ch2, op: 'recv' })
  ]);

  await new Promise(r => setTimeout(r, 10));

  console.log(`  ch2 recvQueue before send: ${ch2.getRecvQueueLength()}`);

  // Send to ch1, handler will throw
  await ch1.send('value1');

  try {
    await selectPromise;
    console.log('  ERROR: Select did not reject!');
  } catch (err) {
    console.log(`  Select rejected: ${err.message}`);
  }

  console.log(`  ch2 recvQueue after handler throw: ${ch2.getRecvQueueLength()}`);

  // Bug: If ch2 still has waiter, it's leaked
  if (ch2.getRecvQueueLength() > 0) {
    console.log('  ERROR: ch2 waiter not cleaned after handler throw!');
  } else {
    console.log('  PASS: All waiters cleaned on handler throw');
  }

  ch1.close();
  ch2.close();
}

await test_select_handler_throw_cleanup();
