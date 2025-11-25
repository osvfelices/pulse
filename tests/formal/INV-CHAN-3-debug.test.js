/**
 * INV-CHAN-3: Debug waiter integrity
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

async function test() {
  const scheduler = new SchedulerCore({ maxTasks: 10 });

  const ch = new Channel(0); // Unbuffered
  scheduler.registerChannel(ch);
  ch._registeredWithScheduler = scheduler; // Manually set since we're not using async context

  console.log('Spawning task...');
  const task = scheduler.spawn(async () => {
    console.log(`  In task, currentTask=${scheduler.currentTask?.debugId}`);
    console.log(`  ch._registeredWithScheduler: ${ch._registeredWithScheduler ? 'set' : 'null'}`);
    console.log(`  ch._registeredWithScheduler.currentTask: ${ch._registeredWithScheduler?.currentTask?.debugId}`);
    console.log(`  Calling ch.send()...`);
    await ch.send('msg');
    console.log(`  send() completed`);
  });

  console.log(`Task spawned: debugId=${task.debugId}, id=${task.id.toString()}`);

  console.log('\nStep 1...');
  scheduler.step();
  await scheduler.flush();

  console.log('\nStep 2...');
  scheduler.step();
  await scheduler.flush();

  console.log(`\nsendQueue length: ${ch.sendQueue.length}`);
  if (ch.sendQueue.length > 0) {
    const waiter = ch.sendQueue[0];
    console.log(`Waiter.task: ${waiter.task?.debugId}`);
    console.log(`Expected task: ${task.debugId}`);
    console.log(`waiter.task === task: ${waiter.task === task}`);
    console.log(`waiter.task.id: ${waiter.task?.id?.toString()}`);
    console.log(`task.id: ${task.id.toString()}`);
  }

  ch.close();
}

await test();
