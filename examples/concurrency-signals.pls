// Concurrency with Channels and Signals in Pulse
// Demonstrates async tasks, channels, and select operations

import { spawn, sleep } from 'std/async';
import { createChannel, select } from 'std/channels';
import { log } from 'std/console';

// Example 1: Basic channel communication
async function basicChannelExample() {
  log('\n Example 1: Basic Channels');

  let ch = createChannel(5);  // Buffered channel with capacity 5

  // Sender task
  spawn(async () => {
    for (let i = 1; i <= 3; i++) {
      await ch.send(i);
      log('  Sent:', i);
      await sleep(100);
    }
    ch.close();
  });

  // Receiver task
  spawn(async () => {
    while (true) {
      let value = await ch.receive();
      if (value == null) {
        log('  Channel closed');
        break;
      }
      log('  Received:', value);
    }
  });

  await sleep(500);
}

// Example 2: Select with multiple channels
async function selectExample() {
  log('\n Example 2: Select with Multiple Channels');

  let ch1 = createChannel(1);
  let ch2 = createChannel(1);

  // Sender for ch1
  spawn(async () => {
    await sleep(100);
    await ch1.send('from channel 1');
  });

  // Sender for ch2
  spawn(async () => {
    await sleep(150);
    await ch2.send('from channel 2');
  });

  // Receiver using select
  spawn(async () => {
    for (let i = 0; i < 2; i++) {
      let result = await select([
        { channel: ch1, type: 'receive' },
        { channel: ch2, type: 'receive' }
      ]);

      log('  Selected from channel', result.index + 1, ':', result.value);
    }
  });

  await sleep(300);
}

// Example 3: Worker pool with channels
async function workerPoolExample() {
  log('\n Example 3: Worker Pool');

  let jobs = createChannel(10);
  let results = createChannel(10);

  // Create 3 worker tasks
  for (let workerId = 1; workerId <= 3; workerId++) {
    spawn(async () => {
      while (true) {
        let job = await jobs.receive();
        if (job == null) {
          break;
        }

        log(`  Worker ${workerId} processing job ${job}`);
        await sleep(50);  // Simulate work

        let result = job * 2;
        await results.send(result);
      }
    });
  }

  // Send jobs
  spawn(async () => {
    for (let i = 1; i <= 9; i++) {
      await jobs.send(i);
    }
    jobs.close();
  });

  // Collect results
  spawn(async () => {
    let count = 0;
    while (count < 9) {
      let result = await results.receive();
      if (result != null) {
        log('  Result:', result);
        count = count + 1;
      }
    }
  });

  await sleep(600);
}

// Example 4: Timeout pattern with select
async function timeoutExample() {
  log('\n  Example 4: Timeout Pattern');

  let ch = createChannel(1);

  // Slow sender (won't send in time)
  spawn(async () => {
    await sleep(300);
    await ch.send('late message');
  });

  // Receiver with timeout
  spawn(async () => {
    let timeout = createChannel(1);

    spawn(async () => {
      await sleep(100);
      await timeout.send('timeout');
    });

    let result = await select([
      { channel: ch, type: 'receive' },
      { channel: timeout, type: 'receive' }
    ]);

    if (result.index == 0) {
      log('  Received message:', result.value);
    } else {
      log('  Operation timed out!');
    }
  });

  await sleep(400);
}

// Main
async function main() {
  log(' Pulse Concurrency Examples\n');

  await basicChannelExample();
  await selectExample();
  await workerPoolExample();
  await timeoutExample();

  log('\n All concurrency examples complete');
}

main();
