// Todo REST API Example
// Demonstrates Week 5 HTTP Router features:
// - Routing (GET, POST, PUT, DELETE)
// - Middleware (CORS, body parser, logger)
// - Request helpers (json(), param())
// - Response helpers (json(), status())

import { createServer } from '../lib/http/server.js';
import { Router, cors, bodyParser, logger } from '../lib/http/router.js';

// In-memory todo storage
const todos = [];
let nextId = 1;

async fn main() {
  print('Starting Todo REST API...');

  // Create router
  const app = new Router();

  // Add middleware
  app.use(logger());           // Log all requests
  app.use(cors());             // Enable CORS
  app.use(bodyParser());       // Parse JSON bodies

  // Routes
  app.get('/health', async fn(req, res) {
    res.json({ status: 'ok', todos: todos.length });
  });
  app.get('/todos', getTodos);
  app.post('/todos', createTodo);
  app.get('/todos/:id', getTodoById);
  app.put('/todos/:id', updateTodo);
  app.delete('/todos/:id', deleteTodo);

  // Create and start server
  const server = createServer({
    host: '127.0.0.1',
    port: 3000
  });

  server.listen();
  print('Server listening on http://127.0.0.1:3000');
  print('Try:');
  print('  curl http://127.0.0.1:3000/health');
  print('  curl http://127.0.0.1:3000/todos');
  print('  curl -X POST http://127.0.0.1:3000/todos -H "Content-Type: application/json" -d \'{"title":"Test"}\'');

  // Start serving (processes requests from channel)
  await app.serve(server);
}

// GET /todos - List all todos
async fn getTodos(req, res) {
  res.json({ todos: todos });
}

// POST /todos - Create new todo
async fn createTodo(req, res) {
  const body = req.json();

  if (!body.title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const todo = {
    id: nextId,
    title: body.title,
    completed: false,
    createdAt: Date.now()
  };

  nextId = nextId + 1;
  todos.push(todo);

  res.status(201).json({ todo: todo });
}

// GET /todos/:id - Get todo by ID
async fn getTodoById(req, res) {
  const id = parseInt(req.param('id'));

  const todo = todos.find(fn(t) { return t.id == id; });

  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }

  res.json({ todo: todo });
}

// PUT /todos/:id - Update todo
async fn updateTodo(req, res) {
  const id = parseInt(req.param('id'));
  const body = req.json();

  const todo = todos.find(fn(t) { return t.id == id; });

  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }

  // Update fields
  if (body.title != undefined) {
    todo.title = body.title;
  }
  if (body.completed != undefined) {
    todo.completed = body.completed;
  }

  todo.updatedAt = Date.now();

  res.json({ todo: todo });
}

// DELETE /todos/:id - Delete todo
async fn deleteTodo(req, res) {
  const id = parseInt(req.param('id'));

  const index = todos.findIndex(fn(t) { return t.id == id; });

  if (index == -1) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }

  const deleted = todos.splice(index, 1)[0];

  res.json({ deleted: deleted });
}

main();
