# Runtime 2.0: HTTP + Scheduler Integration

## Problem Statement

Pulse 1.5.0 has a deterministic scheduler that works perfectly for CLI and batch programs using `spawn()`, `sleep()`, `channels()`, and `select()`. However, HTTP servers cannot use these primitives because of a fundamental architectural incompatibility:

**The Deterministic Scheduler** uses a synchronous run loop:
```javascript
run() {
  while (has_work_to_do) {
    this.step();      // Process one task
    this.flush();     // Handle microtasks
  }
}
```

**Node.js HTTP** requires the event loop to be free:
```javascript
server.on('request', async (req, res) => {
  // This callback can't fire while scheduler.run() is blocking
});
```

### What Doesn't Work

Attempted solutions that failed:
1. **`runTask()` with `setImmediate()` yields** - Still spins in tight loop, blocks event loop
2. **Wrapping handlers in scheduler** - Handlers hang waiting for spawned child tasks
3. **Checking for work before stepping** - Doesn't solve the fundamental blocking issue

### Root Cause

The scheduler's `run()` method is **synchronous and blocking by design**. It processes all tasks to completion before returning control. This is perfect for deterministic batch programs but incompatible with Node's event-driven I/O model.

## Target Solution (Runtime 2.0)

### Cooperative Scheduler Model

Replace the blocking `run()` loop with an **event-driven scheduler** that:

1. **Advances incrementally**: Process one step at a time, not all at once
2. **Integrates with event loop**: Use `setImmediate()` to schedule next step
3. **Pauses when idle**: Stop running when no tasks are ready, resume when work arrives

```javascript
// Pseudo-code for Runtime 2.0
class CooperativeScheduler {
  startEventLoop() {
    // Integrate with Node's event loop instead of blocking
    const scheduleNext = () => {
      if (this.hasWork()) {
        this.step();
        setImmediate(scheduleNext);  // Yield to Node
      }
    };
    scheduleNext();
  }

  async runHandler(fn) {
    // HTTP handler can spawn tasks without blocking
    const task = this.spawn(fn);

    // Return a promise that resolves when task completes
    // Event loop continues running other work meanwhile
    return new Promise((resolve, reject) => {
      task.onComplete(resolve);
      task.onError(reject);
    });
  }
}
```

### Key Changes Required

1. **Scheduler state machine**: Track running/paused/idle states
2. **Task completion callbacks**: Notify when individual tasks finish
3. **Event loop integration**: Use Node's microtask queue correctly
4. **Determinism preservation**: Maintain logical time and task ordering guarantees

### Expected Behavior

With Runtime 2.0, this will work:

```pulse
import { createServer } from 'std/http'
import { spawn, sleep, channel } from 'std/async'

async fn handler(req, res) {
  const ch = channel(1)

  // Spawn background work
  spawn(async () => {
    await sleep(100)
    await ch.send({ result: 42 })
  })

  // Wait for result
  const [data] = await ch.recv()

  res.end(JSON.stringify(data))
}

createServer(handler).listen(3000)
```

## Pulse 1.5.0 Limitation

For now, HTTP handlers in Pulse 1.5.0:
- ✅ Can use `async/await`
- ✅ Can use signals (reactive state)
- ❌ **Cannot use `sleep()`, `channels()`, or `select()`**
- ❌ **Cannot use `spawn()` for background tasks**

This limitation is clearly documented and examples avoid these patterns.

## Implementation Plan

Runtime 2.0 will be developed on a dedicated branch:

1. **Phase 1**: Refactor scheduler to support incremental stepping
2. **Phase 2**: Add task completion callbacks and promises
3. **Phase 3**: Integrate with Node's event loop via `setImmediate()`
4. **Phase 4**: Write comprehensive tests for HTTP + scheduler
5. **Phase 5**: Merge to main after proving stability

**Target**: Pulse 1.6.0 or 2.0.0 (TBD based on scope)

## References

- Original deterministic scheduler: [lib/runtime/scheduler-deterministic.js](lib/runtime/scheduler-deterministic.js)
- HTTP server implementation: [std/http/server.js](std/http/server.js)
- Channel implementation: [lib/runtime/channel-deterministic.js](lib/runtime/channel-deterministic.js)
