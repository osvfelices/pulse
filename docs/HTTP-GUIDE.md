# HTTP Reference (v1.5.0)

Pulse provides HTTP server APIs through the `std/http` module.

## v1.5.0 Limitation

**HTTP handlers in v1.5.0 run on Node's event loop and cannot use `spawn()`, `sleep()`, or `channels()`.**

This is an architectural limitation where the synchronous deterministic scheduler cannot coexist with Node's async event loop. Handlers can use `async/await` and signals.

Full scheduler integration is planned for Runtime 2.0. See [RUNTIME-2.0.md](../RUNTIME-2.0.md) for technical details.

## HTTP Server API

### createServer(requestHandler)

Creates an HTTP server instance.

**Parameters:**
- `requestHandler` - Function called on each incoming request. Receives `(request, response)` arguments.

**Returns:** Server object with `listen()` method.

**Example:**

```pulse
import { createServer } from 'std/http'

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Hello from Pulse')
})

server.listen(3000, () => {
  print('Server running on port 3000')
})
```

### Request Object

The request object provides:
- `url` - Request URL path
- `method` - HTTP method (GET, POST, etc.)
- `headers` - Request headers object
- `on(event, callback)` - Event listener for 'data' and 'end' events

### Response Object

The response object provides:
- `writeHead(status, headers)` - Set response status and headers
- `end(body)` - Send response body and close connection
- `setHeader(name, value)` - Set individual header

### Routing Example

```pulse
import { createServer } from 'std/http'

const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Home')
  } else if (req.url === '/api/users') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ users: [] }))
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
})

server.listen(3000)
```

### Reading Request Body

POST and PUT request bodies are read via event stream:

```pulse
import { createServer } from 'std/http'

const server = createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''

    req.on('data', (chunk) => {
      body = body + chunk
    })

    req.on('end', () => {
      const data = JSON.parse(body)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ received: data }))
    })
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' })
    res.end('Method Not Allowed')
  }
})

server.listen(3000)
```

### Using Signals in HTTP Handlers

Signals work in HTTP handlers in v1.5.0:

```pulse
import { createServer } from 'std/http'
import { signal } from 'pulselang/runtime'

const [requestCount, setRequestCount] = signal(0)

const server = createServer((req, res) => {
  setRequestCount(c => c + 1)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    count: requestCount(),
    message: 'Request received'
  }))
})

server.listen(3000, () => {
  print('Server running on port 3000')
})
```

### What Does NOT Work in v1.5.0

This will hang because HTTP handlers cannot use spawn/sleep/channels:

```pulse
import { createServer } from 'std/http'
import { spawn, channel } from 'std/async'

// DON'T DO THIS IN v1.5.0 - WILL HANG
const server = createServer(async (req, res) => {
  const ch = channel(1)

  spawn(async () => {  // This won't work
    await ch.send('data')
  })

  const [data] = await ch.recv()  // This will hang forever
  res.end(data)
})
```

Use regular async/await for HTTP handlers in v1.5.0:

```pulse
import { createServer } from 'std/http'

const server = createServer(async (req, res) => {
  // Regular async/await works fine
  const data = await fetch('https://api.example.com/data')
  const json = await data.json()

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(json))
})

server.listen(3000)
```

## HTTP Client

v1.5.0 does not include an HTTP client in std/http. Use the global `fetch()` API for HTTP requests:

```pulse
async fn fetchData() {
  const response = await fetch('https://api.example.com/data')
  const json = await response.json()
  print('Data:', json)
}
```

## Helper Functions

### json(data)

Creates a JSON response helper.

**Parameters:**
- `data` - Object to serialize as JSON

**Returns:** Function that sends JSON response

**Example:**

```pulse
import { createServer, json } from 'std/http'

const server = createServer((req, res) => {
  const response = json({ message: 'Hello', status: 'ok' })
  response(req, res)
})

server.listen(3000)
```

### text(content)

Creates a plain text response helper.

**Parameters:**
- `content` - String content

**Returns:** Function that sends text response

**Example:**

```pulse
import { createServer, text } from 'std/http'

const server = createServer((req, res) => {
  const response = text('Hello, World!')
  response(req, res)
})

server.listen(3000)
```

### redirect(url, statusCode)

Creates a redirect response helper.

**Parameters:**
- `url` - Target URL
- `statusCode` - HTTP status code (default: 302)

**Returns:** Function that sends redirect response

**Example:**

```pulse
import { createServer, redirect } from 'std/http'

const server = createServer((req, res) => {
  if (req.url === '/old-path') {
    const response = redirect('/new-path', 301)
    response(req, res)
  }
})

server.listen(3000)
```

## Error Handling

Handle errors in HTTP handlers with try-catch:

```pulse
import { createServer } from 'std/http'

const server = createServer(async (req, res) => {
  try {
    const response = await fetch('https://api.example.com/data')
    const json = await response.json()

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(json))
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal Server Error')
  }
})

server.listen(3000)
```

## Additional Documentation

- [Concurrency patterns](./CONCURRENCY.md) - For CLI/batch programs using spawn/channels
- [Getting started guide](./GETTING-STARTED.md)
- [HTTP example code](../examples/http-api.pulse)
- [RUNTIME-2.0.md](../RUNTIME-2.0.md) - Technical details on HTTP + scheduler limitation
