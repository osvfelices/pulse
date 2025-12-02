# Debugger Examples

Concrete end-to-end workflow examples for debugging Pulse applications.

## Example 1: Simple Debug Session with Tasks and Channels

This example demonstrates a basic debugging session with multiple tasks communicating through a channel.

### Scenario

Debug a producer-consumer application where a producer task sends values through a channel and a consumer task receives them.

### Application Code

```javascript
// app.js
import { getScheduler } from 'pulselang/runtime';
import { Channel } from 'pulselang/runtime';

const scheduler = getScheduler();
const channel = new Channel(5);

// Producer task
scheduler.spawn(async () => {
  for (let i = 0; i < 10; i++) {
    console.log(`Sending: ${i}`);
    await channel.send(i);
    await scheduler.sleep(100);
  }
  channel.close();
});

// Consumer task
scheduler.spawn(async () => {
  for await (const value of channel) {
    console.log(`Received: ${value}`);
    await scheduler.sleep(50);
  }
});

await scheduler.drain();
```

### Debug Session Walkthrough

#### Step 1: Enable Debugger and Inspector

```javascript
import { getDebugSession, getInspector } from 'pulselang/runtime';

const debug = getDebugSession();
const inspector = getInspector();

debug.enable();
inspector.enable();
```

#### Step 2: Set Breakpoints

Set breakpoints at key locations:

```javascript
// Break when producer sends value
debug.setBreakpoint('app.js', 8);  // await channel.send(i)

// Break when consumer receives value
debug.setBreakpoint('app.js', 16); // console.log(`Received: ${value}`)
```

#### Step 3: Run and Hit First Breakpoint

Start execution. When the first breakpoint hits (producer send), inspect state:

```javascript
// Check if paused
const state = debug.getState();
console.log('Paused:', state.paused); // true

// Get call stack
const frames = debug.getCurrentFrames();
console.log('Current function:', frames.frames[0].functionName);
console.log('Current line:', frames.frames[0].line);

// Get local variables
const locals = debug.getLocals(0);
console.log('Local i:', locals.locals.i); // 0 (first iteration)
```

#### Step 4: Inspect Runtime State

Use inspector to see all tasks and channels:

```javascript
// Get all tasks
const tasksResult = inspector.getTasks();
console.log('Total tasks:', tasksResult.tasks.length); // 2

tasksResult.tasks.forEach(task => {
  console.log(`Task ${task.id}: ${task.state}, priority ${task.priority}`);
});

// Get channel state
const channelsResult = inspector.getChannels();
const ch = channelsResult.channels[0];
console.log(`Channel ${ch.id}:`);
console.log(`  Capacity: ${ch.capacity}`);
console.log(`  Buffer size: ${ch.bufferSize}`);
console.log(`  Closed: ${ch.closed}`);
console.log(`  Senders waiting: ${ch.sendersWaiting}`);
console.log(`  Receivers waiting: ${ch.receiversWaiting}`);

// Get scheduler state
const schedulerState = inspector.getSchedulerState();
console.log('Logical time:', schedulerState.logicalTime);
console.log('Ready tasks:', schedulerState.readyCount);
console.log('Sleeping tasks:', schedulerState.sleepingCount);
```

#### Step 5: Step Through Execution

Step over to the next line in the current function:

```javascript
debug.stepOver();

// Execution pauses at next statement
const newFrames = debug.getCurrentFrames();
console.log('Now at line:', newFrames.frames[0].line); // 9 (sleep call)
```

#### Step 6: Resume to Next Breakpoint

Resume execution until the consumer breakpoint:

```javascript
debug.resume();

// Execution continues until consumer receives first value
// When paused again, check state
const consumerFrames = debug.getCurrentFrames();
console.log('Consumer at line:', consumerFrames.frames[0].line); // 16

const consumerLocals = debug.getLocals(0);
console.log('Received value:', consumerLocals.locals.value); // 0
```

#### Step 7: Capture Snapshot

Capture a point-in-time snapshot of all runtime state:

```javascript
const snapshot = inspector.getSnapshot();

console.log('Snapshot at logical time:', snapshot.snapshot.logicalTime);
console.log('Tasks in snapshot:', snapshot.snapshot.tasks.length);
console.log('Channels in snapshot:', snapshot.snapshot.channels.length);

// Serialize for offline analysis
const json = snapshot.snapshot.serialize();
// Save to file or send to analysis tool
```

#### Step 8: Clean Up

Resume and disable debugger:

```javascript
debug.resume();
debug.disable();
inspector.disable();
```

### Expected Output

```
Sending: 0
Paused: true
Current function: <anonymous>
Current line: 8
Local i: 0
Total tasks: 2
Task 1: ready, priority 0
Task 2: blocked, priority 0
Channel 1:
  Capacity: 5
  Buffer size: 0
  Closed: false
  Senders waiting: 0
  Receivers waiting: 1
Logical time: 100
Ready tasks: 1
Sleeping tasks: 0
Now at line: 9
Received: 0
Consumer at line: 16
Received value: 0
Snapshot at logical time: 150
Tasks in snapshot: 2
Channels in snapshot: 1
```

## Example 2: Inspecting Concurrency Bugs

This example shows how to use the debugger and inspector to diagnose a concurrency bug where tasks are not coordinating correctly.

### Scenario

Debug a scenario where multiple worker tasks are supposed to process jobs from a shared channel, but jobs are being dropped or processed out of order.

### Buggy Application Code

```javascript
// buggy-workers.js
import { getScheduler } from 'pulselang/runtime';
import { Channel } from 'pulselang/runtime';

const scheduler = getScheduler();
const jobQueue = new Channel(10);
const results = [];

// Job producer
scheduler.spawn(async () => {
  for (let i = 0; i < 20; i++) {
    await jobQueue.send({ id: i, value: i * 2 });
  }
  jobQueue.close();
});

// Worker 1 (has a bug - doesn't always process jobs)
scheduler.spawn(async () => {
  while (true) {
    try {
      const job = await jobQueue.receive();
      if (job.id % 2 === 0) { // BUG: only processes even jobs
        results.push(job);
      }
    } catch (e) {
      break; // Channel closed
    }
  }
});

// Worker 2 (correct)
scheduler.spawn(async () => {
  for await (const job of jobQueue) {
    results.push(job);
  }
});

await scheduler.drain();
console.log('Processed jobs:', results.length); // Expected 20, got fewer
```

### Debug Session to Find the Bug

#### Step 1: Enable Debugging

```javascript
import { getDebugSession, getInspector } from 'pulselang/runtime';

const debug = getDebugSession();
const inspector = getInspector();

debug.enable();
inspector.enable();
```

#### Step 2: Set Breakpoints at Worker Logic

```javascript
// Break when Worker 1 receives job
debug.setBreakpoint('buggy-workers.js', 21); // const job = await jobQueue.receive()

// Break when Worker 1 processes job
debug.setBreakpoint('buggy-workers.js', 23); // results.push(job)

// Break when Worker 2 receives job
debug.setBreakpoint('buggy-workers.js', 32); // for await (const job of jobQueue)
```

#### Step 3: Run and Observe First Few Iterations

When Worker 1 breakpoint hits:

```javascript
const frames = debug.getCurrentFrames();
const locals = debug.getLocals(0);

console.log('Worker 1 received job:', locals.locals.job);
// { id: 0, value: 0 }

debug.stepOver(); // Move to if condition
debug.stepOver(); // Enter if block (job.id % 2 === 0)
debug.stepOver(); // Execute results.push(job)

// Continue to next receive
debug.resume();
```

When Worker 1 receives job id: 1:

```javascript
const locals2 = debug.getLocals(0);
console.log('Worker 1 received job:', locals2.locals.job);
// { id: 1, value: 2 }

debug.stepOver(); // Move to if condition
debug.stepOver(); // Skip if block (job.id % 2 !== 0) - BUG DETECTED!

// Worker 1 does NOT push job id: 1 to results
console.log('Worker 1 skipped job id: 1'); // This is the bug
```

#### Step 4: Use Inspector to Confirm Job Loss

```javascript
// Check channel state
const channels = inspector.getChannels();
const jobQueueState = channels.channels.find(ch => ch.id === jobQueue.id);

console.log('Jobs still in queue:', jobQueueState.bufferSize);
console.log('Workers waiting:', jobQueueState.receiversWaiting);

// Check all tasks
const tasks = inspector.getTasks();
console.log('Total tasks:', tasks.tasks.length);

tasks.tasks.forEach(task => {
  console.log(`Task ${task.id}: ${task.state}`);
});
```

#### Step 5: Capture Snapshot for Analysis

```javascript
const snapshot = inspector.getSnapshot();

// Count jobs processed so far
console.log('Results array length:', results.length);

// Analyze snapshot offline
const snapshotJSON = snapshot.snapshot.serialize();
// Export to debugging tool or bug report
```

#### Step 6: Fix the Bug

The bug is identified: Worker 1 only processes even job IDs, causing odd jobs to be lost.

**Fix**:

```javascript
// Fixed Worker 1
scheduler.spawn(async () => {
  for await (const job of jobQueue) { // Use for-await instead
    results.push(job);
  }
});
```

### Debugging Insights

Using the debugger revealed:
1. Worker 1 was receiving jobs but not always processing them
2. The conditional `if (job.id % 2 === 0)` was causing jobs to be dropped
3. Inspector showed jobs were being received but results array wasn't growing as expected

Without the debugger, this bug would be difficult to diagnose because:
- The application doesn't crash
- Some jobs are processed successfully
- The bug is in control flow logic, not API usage

## Example 3: Using Snapshots for Offline Analysis

This example demonstrates capturing snapshots at different points in execution for comparison and offline analysis.

### Scenario

Analyze task scheduling behavior across multiple execution phases of a complex workflow.

### Application Code

```javascript
// workflow.js
import { getScheduler } from 'pulselang/runtime';
import { Channel } from 'pulselang/runtime';

const scheduler = getScheduler();

// Simulate multi-stage workflow
async function runWorkflow() {
  const stage1Channel = new Channel(5);
  const stage2Channel = new Channel(5);

  // Stage 1: Data ingestion (5 tasks)
  for (let i = 0; i < 5; i++) {
    scheduler.spawn(async () => {
      await scheduler.sleep(10 * i);
      await stage1Channel.send(`data-${i}`);
    });
  }

  // Stage 2: Processing (3 tasks)
  for (let i = 0; i < 3; i++) {
    scheduler.spawn(async () => {
      for await (const data of stage1Channel) {
        await scheduler.sleep(20);
        await stage2Channel.send(`processed-${data}`);
      }
    });
  }

  // Stage 3: Output (1 task)
  scheduler.spawn(async () => {
    const results = [];
    for await (const data of stage2Channel) {
      results.push(data);
      await scheduler.sleep(5);
    }
    return results;
  });

  // Coordinator
  scheduler.spawn(async () => {
    await scheduler.sleep(100);
    stage1Channel.close();
    await scheduler.sleep(200);
    stage2Channel.close();
  });

  await scheduler.drain();
}
```

### Snapshot Analysis Workflow

#### Step 1: Enable Inspector

```javascript
import { getInspector } from 'pulselang/runtime';

const inspector = getInspector();
inspector.enable();
```

#### Step 2: Capture Snapshots at Key Phases

Run the workflow and capture snapshots at different logical times:

```javascript
const snapshots = [];

// Start workflow
const workflowPromise = runWorkflow();

// Capture snapshot after stage 1 tasks spawn
await scheduler.sleep(50); // Let stage 1 tasks start
const snapshot1 = inspector.getSnapshot();
snapshots.push({
  phase: 'stage1-active',
  time: snapshot1.snapshot.logicalTime,
  data: snapshot1.snapshot
});

// Capture snapshot during processing
await scheduler.sleep(150); // Stage 2 processing
const snapshot2 = inspector.getSnapshot();
snapshots.push({
  phase: 'stage2-processing',
  time: snapshot2.snapshot.logicalTime,
  data: snapshot2.snapshot
});

// Capture snapshot near completion
await scheduler.sleep(250); // Near end
const snapshot3 = inspector.getSnapshot();
snapshots.push({
  phase: 'completion',
  time: snapshot3.snapshot.logicalTime,
  data: snapshot3.snapshot
});

await workflowPromise;
```

#### Step 3: Analyze Snapshots Offline

```javascript
// Compare task counts across phases
snapshots.forEach(snapshot => {
  const { phase, time, data } = snapshot;

  const taskStates = {};
  data.tasks.forEach(task => {
    taskStates[task.state] = (taskStates[task.state] || 0) + 1;
  });

  console.log(`\n${phase} (t=${time}):`);
  console.log(`  Total tasks: ${data.tasks.length}`);
  console.log(`  Task states:`, taskStates);
  console.log(`  Channels: ${data.channels.length}`);

  data.channels.forEach(ch => {
    console.log(`    Channel ${ch.id}: buffer=${ch.bufferSize}/${ch.capacity}, ` +
                `closed=${ch.closed}, ` +
                `senders=${ch.sendersWaiting}, receivers=${ch.receiversWaiting}`);
  });

  console.log(`  Scheduler: ready=${data.scheduler.readyCount}, ` +
              `sleeping=${data.scheduler.sleepingCount}`);
});
```

#### Step 4: Export Snapshots for Analysis

```javascript
// Serialize all snapshots to JSON
const snapshotsJSON = snapshots.map(s => ({
  phase: s.phase,
  time: s.time,
  snapshot: s.data.toJSON()
}));

// Save to file
import fs from 'fs';
fs.writeFileSync('workflow-snapshots.json', JSON.stringify(snapshotsJSON, null, 2));
```

#### Step 5: Analyze Snapshot Data

```javascript
// Load and analyze snapshots
const loadedSnapshots = JSON.parse(fs.readFileSync('workflow-snapshots.json', 'utf-8'));

// Identify bottlenecks
loadedSnapshots.forEach(s => {
  const channelBottlenecks = s.snapshot.channels.filter(ch =>
    ch.sendersWaiting > 0 || ch.receiversWaiting > 0
  );

  if (channelBottlenecks.length > 0) {
    console.log(`\n${s.phase}: Detected bottlenecks`);
    channelBottlenecks.forEach(ch => {
      console.log(`  Channel ${ch.id}: ${ch.sendersWaiting} senders waiting, ` +
                  `${ch.receiversWaiting} receivers waiting`);
    });
  }
});

// Track task lifecycle
const taskCreationTimes = new Map();
loadedSnapshots[0].snapshot.tasks.forEach(task => {
  taskCreationTimes.set(task.id, task.createdAt);
});

// Compare task completion across snapshots
loadedSnapshots.forEach((s, i) => {
  const completedTasks = s.snapshot.tasks.filter(t => t.state === 'completed').length;
  console.log(`Snapshot ${i} (${s.phase}): ${completedTasks} tasks completed`);
});
```

### Expected Analysis Output

```
stage1-active (t=50):
  Total tasks: 9
  Task states: { ready: 4, sleeping: 3, blocked: 2 }
  Channels: 2
    Channel 1: buffer=2/5, closed=false, senders=0, receivers=1
    Channel 2: buffer=0/5, closed=false, senders=0, receivers=3
  Scheduler: ready=4, sleeping=3

stage2-processing (t=200):
  Total tasks: 9
  Task states: { ready: 2, sleeping: 1, blocked: 4, completed: 2 }
  Channels: 2
    Channel 1: buffer=0/5, closed=true, senders=0, receivers=0
    Channel 2: buffer=3/5, closed=false, senders=0, receivers=1
  Scheduler: ready=2, sleeping=1

completion (t=450):
  Total tasks: 9
  Task states: { completed: 8, ready: 1 }
  Channels: 2
    Channel 1: buffer=0/5, closed=true, senders=0, receivers=0
    Channel 2: buffer=0/5, closed=true, senders=0, receivers=0
  Scheduler: ready=1, sleeping=0

stage2-processing: Detected bottlenecks
  Channel 2: 0 senders waiting, 1 receivers waiting

Snapshot 0 (stage1-active): 0 tasks completed
Snapshot 1 (stage2-processing): 2 tasks completed
Snapshot 2 (completion): 8 tasks completed
```

### Insights from Snapshot Analysis

The snapshot analysis reveals:

1. **Stage 1 (t=50)**: All ingestion tasks are active, some sleeping, some ready, channels buffering data
2. **Stage 2 (t=200)**: Processing tasks are working, stage 1 channel closed, stage 2 channel has data, receiver waiting
3. **Completion (t=450)**: Almost all tasks completed, channels closed, workflow nearly done

This offline analysis approach is useful for:
- Understanding workflow progression without pausing execution
- Comparing runtime state at different phases
- Identifying bottlenecks (tasks waiting on channels)
- Debugging race conditions by comparing snapshot sequences
- Exporting state for bug reports or performance analysis

## Best Practices

### When to Use Breakpoints

**Good use cases**:
- Stepping through unfamiliar code to understand control flow
- Inspecting local variables at specific points
- Pausing at critical sections (channel send/receive, state transitions)
- Investigating specific code paths that produce bugs

**Avoid**:
- Setting breakpoints in hot loops (use inspector queries instead)
- Breaking on every statement in long-running tasks (use step-over/step-out)
- Relying on breakpoints for performance analysis (use snapshots)

### When to Use Inspector Queries

**Good use cases**:
- Monitoring task states during execution
- Checking channel buffer sizes and waiting tasks
- Understanding scheduler state (logical time, ready/sleeping counts)
- Identifying blocking or deadlock conditions
- Real-time monitoring without pausing execution

**Avoid**:
- Polling inspector queries in tight loops (performance overhead)
- Using inspector as a replacement for logging (use structured logging)
- Querying state that changes rapidly (use snapshots for point-in-time views)

### When to Use Snapshots

**Good use cases**:
- Capturing state at specific logical times for comparison
- Exporting runtime state for offline analysis
- Debugging non-deterministic issues by comparing snapshots across runs
- Performance profiling (task counts, channel utilization)
- Creating bug reports with full runtime context

**Avoid**:
- Capturing snapshots in tight loops (memory and CPU overhead)
- Using snapshots for real-time monitoring (use inspector queries)
- Capturing snapshots of very large workloads (>10k tasks, check limits)

### Performance Tips

1. **Enable debugger only during active debugging**:
   ```javascript
   debug.enable();
   // ... debugging session ...
   debug.disable();
   ```

2. **Use step commands wisely**:
   - Use `stepOver()` to skip function calls
   - Use `stepOut()` to exit deep call stacks quickly
   - Use `resume()` to run to next breakpoint instead of stepping through loops

3. **Minimize inspector query frequency**:
   ```javascript
   // Bad: polling in tight loop
   while (true) {
     inspector.getTasks(); // Every iteration
   }

   // Good: query at specific intervals
   await scheduler.sleep(100);
   inspector.getTasks();
   ```

4. **Batch snapshot captures**:
   ```javascript
   // Capture snapshots at key phases, not continuously
   const snapshots = [];
   snapshots.push(inspector.getSnapshot()); // Phase 1
   await scheduler.sleep(1000);
   snapshots.push(inspector.getSnapshot()); // Phase 2
   await scheduler.sleep(1000);
   snapshots.push(inspector.getSnapshot()); // Phase 3
   ```

### Security Considerations

1. **Validate breakpoint file paths**:
   - The debugger automatically validates file paths to prevent path traversal
   - Paths like `../../../etc/passwd` are rejected
   - Always use normalized absolute paths when setting breakpoints programmatically

2. **Handle pause timeout**:
   - The debugger auto-resumes after 30 seconds to prevent deadlock
   - Always call `resume()` after inspecting paused state
   - Use the timeout as a safety mechanism, not a feature

3. **Protect sensitive data in snapshots**:
   - Snapshots capture all runtime state, including local variables
   - Avoid serializing snapshots that contain credentials or secrets
   - Filter sensitive data before exporting snapshots

4. **Disable debugger in production**:
   - Debugger overhead is minimal (<5%) but should be disabled in production
   - Only enable debugger in development, testing, or controlled debugging sessions
   - Use environment variables or feature flags to control debugger enablement

### Debugging Workflows

#### Workflow 1: Investigate Unexpected Behavior

1. Enable debugger and inspector
2. Set breakpoint at location where behavior occurs
3. Run application until breakpoint hits
4. Inspect local variables and call stack
5. Use inspector to check task and channel state
6. Step through code to understand execution path
7. Capture snapshot if needed for offline analysis

#### Workflow 2: Diagnose Concurrency Bug

1. Enable inspector (debugger optional)
2. Run application to completion
3. Query tasks and channels at various points
4. Capture snapshots at different logical times
5. Compare snapshots to identify state inconsistencies
6. Set breakpoints at suspected bug locations
7. Step through with debugger to confirm hypothesis

#### Workflow 3: Performance Analysis

1. Enable inspector only (debugger adds overhead)
2. Capture snapshots at regular intervals (e.g., every 1000ms logical time)
3. Run application to completion
4. Analyze snapshots offline:
   - Track task creation/completion rates
   - Identify channel bottlenecks (high buffer usage, waiting tasks)
   - Measure scheduler efficiency (ready vs sleeping task ratio)
5. Use insights to optimize task priorities or channel capacities

## Common Patterns

### Pattern 1: Conditional Breakpoints (Manual Implementation)

Pulse does not support native conditional breakpoints, but you can implement them manually:

```javascript
// Set breakpoint at this line
if (someCondition) {
  debugger; // JavaScript debugger statement
}
```

Or use inspector queries:

```javascript
const state = inspector.getSchedulerState();
if (state.readyCount > 100) {
  debug.pause(); // Pause when condition met
}
```

### Pattern 2: Breakpoint Hit Counting

Track how many times a breakpoint is hit:

```javascript
debug.enable();
debug.setBreakpoint('app.js', 42);

let hitCount = 0;

// Poll debugger state in separate task
scheduler.spawn(async () => {
  while (true) {
    await scheduler.sleep(10);
    const state = debug.getState();
    if (state.paused) {
      hitCount++;
      console.log(`Breakpoint hit ${hitCount} times`);
      debug.resume();
    }
  }
});
```

### Pattern 3: State Diffing

Compare snapshots to detect state changes:

```javascript
const snapshot1 = inspector.getSnapshot();
await scheduler.sleep(1000);
const snapshot2 = inspector.getSnapshot();

// Compare task counts
const tasks1 = snapshot1.snapshot.tasks.length;
const tasks2 = snapshot2.snapshot.tasks.length;
console.log(`Tasks created: ${tasks2 - tasks1}`);

// Compare channel buffer sizes
snapshot1.snapshot.channels.forEach((ch1, i) => {
  const ch2 = snapshot2.snapshot.channels[i];
  const bufferDelta = ch2.bufferSize - ch1.bufferSize;
  console.log(`Channel ${ch1.id} buffer delta: ${bufferDelta}`);
});
```

### Pattern 4: Call Stack Navigation

Navigate call stack to understand execution context:

```javascript
// When paused at breakpoint
const frames = debug.getCurrentFrames();

// Print full call stack
console.log('Call stack:');
frames.frames.forEach((frame, i) => {
  console.log(`  ${i}: ${frame.functionName} at ${frame.file}:${frame.line}`);
});

// Get locals for each frame
frames.frames.forEach((frame, i) => {
  const locals = debug.getLocals(i);
  console.log(`  Frame ${i} locals:`, locals.locals);
});
```

## Next Steps

- See [docs/api/debugger.md](api/debugger.md) for complete API reference
- See [docs/debugger-integration.md](debugger-integration.md) for integration guide and LSP/JSON-RPC details
- See [docs/debug-protocol.md](debug-protocol.md) for detailed protocol specification
- See validation tests in [tests/validation/](../tests/validation/) for additional examples
