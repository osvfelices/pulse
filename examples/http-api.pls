// HTTP API Server in Pulse
// Demonstrates HTTP server with routing

import { createServer } from 'std/http';
import { log } from 'std/console';

// Create HTTP server
let server = createServer((req, res) => {
  log(`${req.method} ${req.url}`);

  // Simple routing
  if (req.url == '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pulse HTTP API');
  } else if (req.url == '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    let status = {
      "status": "ok",
      "version": "1.5.0",
      "timestamp": Date.now()
    };
    res.end(JSON.stringify(status));
  } else if (req.url == '/api/echo' && req.method == 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body = body + chunk;
    });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ "echoed": body }));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Start server
server.listen(3000, () => {
  log('HTTP API server listening on port 3000');
  log('   curl http://localhost:3000/');
  log('   curl http://localhost:3000/api/status');
  log('   curl -X POST -d "test" http://localhost:3000/api/echo');
});
