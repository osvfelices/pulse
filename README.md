<p align="center">
  <img src="pulse.svg" alt="Pulse" width="200"/>
</p>

# Pulse 3.1

A programming language with CSP-style concurrency, structured concurrency, and cooperative scheduling.

## What is Pulse?

Pulse is a programming language built for concurrent systems programming with:

- **Native CSP primitives** - `spawn`, channels, and `select` statements built into the language
- **Structured concurrency** - Parent tasks automatically manage child task lifecycles
- **Cooperative scheduler** - Deterministic task execution with predictable behavior
- **Optional type system** - Gradual typing with `--strict-types` flag
- **JavaScript interop** - Compiles to JavaScript, imports from npm seamlessly
- **Advanced compiler** - Multi-stage IR-based backend with optimization passes

Pulse 3.1 includes a new compiler architecture with intermediate representation (IR), semantic analysis, and optional static type checking.

## When to Use This

Use Pulse Runtime when you need:

**Structured Concurrency**
- Parent tasks automatically cancel children when cancelled or when they complete
- No orphaned tasks or background work that outlives its context
- Clear task lifecycles with completion promises

**Backpressure and Flow Control**
- Channels with bounded buffers to prevent unbounded queuing
- Admission control to reject requests when overloaded
- Load shedding based on queue depth or memory pressure

**Deterministic Execution**
- Tasks execute in predictable order based on logical time, not wall-clock time
- Same inputs produce same execution order (useful for testing and debugging)
- Batch-then-yield scheduling model

**Resource Management**
- Per-request resource limits (task count, duration, memory)
- Configurable concurrency pools for HTTP servers
- Memory monitoring with state change events

**Production Observability**
- Prometheus metrics for tasks, channels, HTTP requests
- Graceful shutdown with timeout support
- Health check endpoints for load balancers

## Installation

```bash
npm install pulselang
```

Requires Node.js 18 or higher.

## New in Pulse 3.1

### M14 Runtime Upgrades

**Channel System (M14.1)**:
- RingBuffer-backed channels with O(1) push/shift operations
- Power-of-two sizing for fast modulo via bitmask

**Supervisor Trees (M14.2)**:
- Restart strategies: one_for_one, one_for_all, rest_for_one
- Automatic child restart with configurable intensity/period

**Structured Concurrency v2 (M14.3)**:
- AsyncGroup with waitWithTimeout using logical time
- Two-phase cancellation marking

**Select Engine v2 (M14.5)**:
- First-winner determinism (lowest ready index wins)
- Cancel-safe semantics with eager cleanup of losing waiters
- No Promise.race, no timers, pure logical-time operation

### Compiler Architecture

**Multi-Stage Compilation Pipeline**:
- Lexer → Parser → AST → Semantic Analysis → Type Checking → IR → Optimization → Backend

**Intermediate Representation (IR)**:
- IR-based backend (default in 3.1.0)
- SSA-form register-based IR with control flow graph
- Dead code elimination and constant folding optimizations
- Full validation pass for IR correctness
- ECMAScript-style completion records for exception handling

**Semantic Analysis**:
- Variable resolution with scope tracking
- Temporal dead zone (TDZ) detection
- const/let enforcement
- Control flow validation (return/break/continue)

**Optional Type System**:
- Gradual typing with `--strict-types` flag
- Type annotations: `const x: number = 42`
- Function signatures: `fn add(a: number, b: number): number`
- Type checking for annotated code only (unannotated code is never checked)

### Compiler Flags

Run Pulse files with the `pulse` or `pulselang` CLI:

```bash
pulse script.pls                   # Default: IR backend
pulse script.pls --legacy-backend  # Use legacy codegen (fallback)
pulse script.pls --strict-types    # Enable type checking
pulse script.pls --strict-semantic # Treat semantic warnings as errors
pulse script.pls --sourcemap       # Generate source maps
```

**Available Flags**:
- `--legacy-backend`: Use legacy codegen instead of IR (fallback for compatibility)
- `--strict-types`: Enable optional static type checking
- `--strict-semantic`: Fail on semantic errors (default: warnings)
- `--strict-ast`: Enable strict AST validation
- `--sourcemap`: Generate inline source maps for debugging

### Language Features

**Type Annotations** (optional, requires `--strict-types`):
```pulse
// Variable type annotations
const x: number = 42;
let name: string = "Alice";

// Function signatures
fn add(a: number, b: number): number {
  return a + b;
}

// Type checking only applies to annotated code
const untyped = "hello"; // No type checking
```

**Compiler Modes**:
- **Default**: IR-based backend with optimization passes
- **Legacy Backend** (`--legacy-backend`): Original codegen, available as fallback
- **Type Checked** (`--strict-types`): Static type checking for annotated code

## Quick Start

### Basic Task Spawning

```javascript
import { spawn, sleep } from 'pulselang/runtime';

// Spawn a concurrent task
const task = spawn(async () => {
  await sleep(100);
  return 'done';
});

// Wait for completion
const result = await task.completionPromise;
console.log(result); // 'done'
```

### HTTP Server with Scheduler Pool

```javascript
import { createServerWithScheduler, spawn, sleep } from 'pulselang/runtime';

const server = createServerWithScheduler(async (req, res) => {
  // All Pulse primitives work inside handlers
  const task = spawn(async () => {
    await sleep(100);
    return `Processed ${req.url}`;
  });

  const result = await task.completionPromise;

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(result);
}, {
  maxPoolSize: 100,      // Max 100 concurrent requests
  maxQueueSize: 50,      // Max 50 queued when pool full
  timeout: 30000         // 30 second request timeout
});

server.listen(3000);
console.log('Server running on port 3000');
```

### Channels and Pipelines

```javascript
import { spawn, Channel } from 'pulselang/runtime';

const ch = new Channel(10); // Buffered channel with capacity 10

// Producer
spawn(async () => {
  for (let i = 0; i < 5; i++) {
    await ch.send(i);
  }
  ch.close();
});

// Consumer
spawn(async () => {
  for await (const value of ch) {
    console.log('Received:', value);
  }
});
```

### Select Statement

```javascript
import { spawn, Channel, select, selectCase, sleep } from 'pulselang/runtime';

const dataCh = new Channel(1);
const timeoutCh = new Channel(1);

// Slow data source
spawn(async () => {
  await sleep(2000);
  await dataCh.send('data');
});

// Timeout after 1 second
spawn(async () => {
  await sleep(1000);
  await timeoutCh.send('timeout');
});

// Wait for first ready channel
const result = await select([
  selectCase({
    channel: dataCh,
    op: 'recv',
    handler: (data) => ({ ok: true, data })
  }),
  selectCase({
    channel: timeoutCh,
    op: 'recv',
    handler: () => ({ ok: false, error: 'Timeout' })
  })
]);

console.log(result); // { ok: false, error: 'Timeout' }
```

## Core Features

### Structured Concurrency

Tasks form a tree structure with automatic cleanup:

```javascript
import { spawn, sleep, CancelledError } from 'pulselang/runtime';

const parent = spawn(async () => {
  const child = spawn(async () => {
    try {
      await sleep(5000);
    } catch (error) {
      if (error instanceof CancelledError) {
        console.log('Child was cancelled');
      }
    }
  });

  await sleep(100);
  return 'parent done';
});

// When parent completes, child is automatically cancelled
await parent.completionPromise;
```

### Graceful Shutdown

```javascript
import { createServerWithScheduler, setupGracefulShutdown } from 'pulselang/runtime';

const server = createServerWithScheduler(handler, options);

setupGracefulShutdown(server, {
  timeout: 30000,
  onShutdown: (signal) => {
    console.log(`Received ${signal}, shutting down...`);
  },
  onComplete: (result) => {
    console.log(`Shutdown complete: ${result.activeWaitedFor} requests finished`);
  }
});

server.listen(3000);

// On SIGTERM or SIGINT:
// 1. Stop accepting new requests
// 2. Wait for active requests (up to timeout)
// 3. Close server
// 4. Exit process
```

### Observability

```javascript
import { createServerWithScheduler } from 'pulselang/runtime';
import {
  enableMetrics,
  getMetricsRegistry,
  exportPrometheus
} from 'pulselang/runtime/observability';

// Enable metrics collection
enableMetrics();

const server = createServerWithScheduler(async (req, res) => {
  if (req.url === '/metrics') {
    const metrics = exportPrometheus(getMetricsRegistry());
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(metrics);
    return;
  }

  // Your handler...
  res.writeHead(200);
  res.end('OK');
});

server.listen(3000);

// GET /metrics returns Prometheus-format metrics:
// pulse_task_spawn_total 42
// pulse_http_request_duration_ms_bucket{le="100"} 35
// pulse_http_request_duration_ms_bucket{le="500"} 40
// ...
```

### Resource Management

```javascript
import { withResourceManagement } from 'pulselang/runtime/http-integration.js';
import {
  AdmissionController,
  LoadShedder
} from 'pulselang/runtime/resources';

// Setup resource management
const admissionController = new AdmissionController({
  maxConcurrent: 1000,
  maxQueued: 5000
});

const loadShedder = new LoadShedder({
  enabled: true,
  queueDepth: 1000,        // Shed load if queue > 1000
  memoryThreshold: 0.85    // Shed load if heap > 85%
});

// Wrap handler with resource management
const handler = withResourceManagement(async (req, res) => {
  // Your handler code
  res.writeHead(200);
  res.end('OK');
}, {
  admissionController,
  loadShedder
});

const server = http.createServer(handler);
server.listen(3000);

// Requests are automatically:
// - Queued when pool is full
// - Rejected with 503 when queue is full
// - Rejected with 503 when memory/queue thresholds exceeded
```

## API Reference

Complete API documentation with TypeScript examples: [docs/api-reference.md](docs/api-reference.md)

### Core Primitives

- `spawn(fn, options)` - Spawn a new task
- `sleep(ms)` - Sleep for milliseconds
- `getRequestContext()` - Get current request context (trace ID, request ID, custom metadata)

### Channel Communication

- `Channel` - CSP-style channel with buffered/unbuffered modes
- `channel.send(value)` - Send to channel
- `channel.recv()` - Receive from channel
- `channel.close()` - Close channel
- `for await...of` - Iterate over channel

### Select Statement

- `select(cases)` - Wait for first ready channel operation
- `selectCase(config)` - Define a select case (send or recv)

### HTTP Integration

- `createServerWithScheduler(handler, options)` - Create HTTP server with scheduler pool
- `setupGracefulShutdown(server, options)` - Setup graceful shutdown
- `createHealthCheckHandler(server)` - Create health check endpoint
- `getPoolStats(server)` - Get pool statistics
- `getHealth(server)` - Get health status

### Advanced

- `SchedulerPool` - Manual pool management (most users don't need this)

### Errors

- `CancelledError` - Thrown when task is cancelled
- `PoolExhaustedError` - Thrown when pool is exhausted

## TypeScript Support

Full TypeScript definitions with type inference:

```typescript
import { spawn, Channel, Task } from 'pulselang/runtime';

// Type inference works
const task: Task<number> = spawn(async () => {
  return 42;
});

const result: number = await task.completionPromise;

// Generic channel types
const ch = new Channel<string>(5);
await ch.send('hello');      // OK
await ch.send(42);           // Type error!

const [value, ok] = await ch.recv(); // value: string, ok: boolean
```

## Production Patterns

Pulse Runtime includes production-ready patterns built on core primitives:

- **Rate Limiter** - Token bucket with burst capacity
- **Circuit Breaker** - Fault isolation with CLOSED/OPEN/HALF_OPEN states
- **Worker Pool** - Bounded concurrency control
- **Request Deduplication** - Singleflight pattern to prevent duplicate work
- **Retry Logic** - Exponential backoff with jitter

See pattern documentation for usage examples.

## Examples

The `examples/` directory contains runnable programs:

- `production-server/` - Complete production server with graceful shutdown and health checks
- `observability-demo.js` - Metrics endpoint and monitoring
- `resource-management-demo.js` - Admission control and load shedding
- Pattern examples in `lib/runtime/patterns/`

Run examples:

```bash
node examples/production-server/server.js
node examples/observability-demo.js
node examples/resource-management-demo.js
```

## Performance

Pulse Runtime 2.0 includes a comprehensive benchmark suite:

- Primitive benchmarks (spawn, sleep, channels, select)
- HTTP server load tests at various concurrency levels
- Memory leak detection (validated with 50k+ operations)
- Automated regression detection

Run benchmarks:

```bash
node benchmarks/primitives/spawn-bench.js
node benchmarks/http/http-bench.js
node benchmarks/memory/leak-detection.js
```

Performance characteristics:

- Zero overhead when observability/resource management disabled
- <5% overhead when metrics enabled with sampling
- Deterministic batch-then-yield scheduling model
- No memory leaks in sustained high-load scenarios

## Testing

Run the full test suite:

```bash
npm test
```

All tests (42/42) pass:

- Deterministic scheduler tests
- Channel tests (buffered, unbuffered, iteration)
- Select tests (multiple channels, timeouts)
- HTTP integration tests (pool, timeout, abort)
- Error path tests (cleanup, cancellation)
- Graceful shutdown tests

## Documentation

- [API Reference](docs/api-reference.md) - Complete API documentation with TypeScript examples
- [Getting Started](docs/GETTING-STARTED.md) - Detailed getting started guide
- [HTTP Guide](docs/HTTP-GUIDE.md) - HTTP server integration guide
- Phase completion docs in `docs/` for implementation details

## Design Principles

Pulse Runtime 2.0 follows these principles:

- **Determinism** - Tasks execute in predictable order based on logical time
- **Structured concurrency** - Parent-child relationships with automatic cleanup
- **Opt-in features** - Observability and resource management are separate imports
- **Zero overhead when disabled** - Fast-path inline checks for optional features
- **Production-first** - Graceful shutdown, health checks, metrics, admission control
- **API stability** - Public API is frozen, semantic versioning guarantees

## Known Limitations

- HTTP handlers are the only supported entry point (no standalone CLI/batch support)
- Distributed tracing not yet implemented (metrics only, no span propagation)
- Debug inspectors deferred (no runtime introspection endpoints)
- Worker pools don't support dynamic scaling

## Contributing

Contributions welcome. The codebase is organized as:

- `lib/runtime/` - Core scheduler, channels, select, HTTP integration
- `lib/runtime/observability/` - Metrics collection and exporters
- `lib/runtime/resources/` - Resource management (admission control, load shedding)
- `lib/runtime/patterns/` - Production patterns
- `benchmarks/` - Performance benchmarks
- `tests/` - Test suite
- `examples/` - Example programs
- `docs/` - Documentation

## License

MIT

## Links

- Repository: https://github.com/osvfelices/pulse
- Documentation: https://osvfelices.github.io/pulse/
- Issues: https://github.com/osvfelices/pulse/issues
- npm: https://www.npmjs.com/package/pulselang
