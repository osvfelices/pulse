# Pulse Full-Stack Application

Full-stack application template with React 19, Vite, Tailwind CSS 4, and Pulse 1.5.0 backend.

## Project Structure

```
.
├── server/
│   └── main.pulse          # Backend API server
├── src/
│   ├── App.jsx             # React application
│   └── main.jsx            # Frontend entry point
├── .vscode/
│   └── launch.json         # VS Code debug configuration
├── pulse.json              # Pulse project configuration
├── package.json            # npm dependencies and scripts
└── vite.config.js          # Vite configuration
```

## Installation

```bash
npm install
```

## Development

**Frontend (Vite dev server):**
```bash
npm run dev
```
Runs at `http://localhost:5173`

**Backend (Pulse server):**
```bash
npm run backend
```
API runs at `http://localhost:3001`

**Backend with hot reload (PRS):**
```bash
npm run backend:dev
```
PRS runs at `http://localhost:3000` with automatic reload on file changes.

## Production Build

```bash
npm run build
npm run preview
```

## Debugging in VS Code

The template includes two launch configurations:

**1. Debug Pulse Backend**
- Launches `server/main.pulse` with debugger attached
- Set breakpoints in `.pulse` files
- Step through execution, inspect variables

**2. Attach to PRS**
- Attaches debugger to running PRS instance (port 3000)
- Use with `npm run backend:dev`
- Enables hot reload with debugging

**Usage:**
1. Install Pulse VS Code extension
2. Open project in VS Code
3. Press F5 or select configuration from Run and Debug panel

## API Endpoints

The backend server (`server/main.pulse`) exposes:

- `GET /api/health` - Health check endpoint
- `GET /api/data` - Sample data endpoint

Extend `server/main.pulse` to add additional endpoints using `std/http` APIs.

## Pulse Configuration

**pulse.json:**
- `entry`: Backend entry point (`server/main.pulse`)
- `dependencies`: Pulse package dependencies

Refer to [Package Manager documentation](https://osvfelices.github.io/pulse/docs/package-manager) for dependency management.

## Frontend Integration

The Vite configuration includes `vite-plugin-pulse` for `.pulse` file compilation.

Import Pulse files directly in React components:
```jsx
import { myFunction } from './logic.pulse'
```

The plugin handles compilation automatically during development and build.

## Technical Stack

- **Frontend:** React 19, Vite 5, Tailwind CSS 4
- **Backend:** Pulse 1.5.0 (deterministic runtime, CSP concurrency)
- **Dev Tools:** PRS (Pulse Runtime Server), VS Code debugger integration
- **Build:** Vite with Pulse plugin for `.pulse` file compilation

## Documentation

- [Pulse Documentation](https://osvfelices.github.io/pulse/)
- [HTTP API Reference](https://osvfelices.github.io/pulse/docs/http-guide)
- [Concurrency Guide](https://osvfelices.github.io/pulse/docs/concurrency)
- [Debugging Guide](https://osvfelices.github.io/pulse/docs/debugging)
