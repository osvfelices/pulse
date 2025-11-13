# create-pulselang-app

Scaffold a new Pulse application with React 19 + Vite + Tailwind CSS 4.

## Usage

```bash
npx create-pulselang-app my-app
cd my-app
npm install
npm run dev
```

This creates a new project with:

- React 19 with Vite 5
- Tailwind CSS 4
- Pulse language support with vite-plugin-pulse
- @pulselang/react hooks for signals integration

## Project Structure

The generated project includes:

```
my-app/
├── src/
│   ├── App.jsx          - Main component with counter demo
│   ├── PulseCounter.jsx - Pulse signals example
│   ├── main.jsx         - React entry point
│   └── index.css        - Styles with Tailwind directives
├── public/              - Static assets (logo)
├── index.html           - HTML template
├── vite.config.js       - Vite + Pulse plugin config
└── package.json         - Dependencies
```

## Development

After scaffolding, run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## What's Included

The template demonstrates:

- Using Pulse signals with `useSignal` hook
- Fine-grained reactivity without full React re-renders
- Modern dark theme UI with Tailwind CSS 4
- Hot module replacement for fast development

## Learn More

- [Pulse Documentation](https://github.com/osvfelices/pulse)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
