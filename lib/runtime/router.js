/**
 * Pulse Router with Declarative Loaders and Streaming SSR
 *
 * Features:
 * - Declarative route loaders
 * - Streaming SSR with island hydration
 * - Automatic code splitting
 * - Preloading on hover
 * - No client-server hydration mismatches
 */

import { signal, batch } from './reactivity.js';

// Global router state
const [currentRoute, setCurrentRoute] = signal(null);
const [currentParams, setCurrentParams] = signal({});
const [currentQuery, setCurrentQuery] = signal({});
const [isNavigating, setIsNavigating] = signal(false);

// Route cache
const routeCache = new Map();
const loaderCache = new Map();

/**
 * createRouter(routes) - Creates a router instance
 *
 * routes: [
 *   { path: '/', component: Home, loader: async () => {...} },
 *   { path: '/user/:id', component: UserProfile, loader: async ({params}) => {...} }
 * ]
 */
export function createRouter(routes) {
  const compiledRoutes = routes.map(compileRoute);

  // Match current URL
  const match = (pathname) => {
    for (const route of compiledRoutes) {
      const match = route.pattern.exec(pathname);
      if (match) {
        const params = {};
        route.keys.forEach((key, i) => {
          params[key] = match[i + 1];
        });
        return { route, params };
      }
    }
    return null;
  };

  // Navigate to a path
  const navigate = async (path, options = {}) => {
    const { replace = false, state = null } = options;

    setIsNavigating(true);

    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams);

    const matched = match(pathname);

    if (!matched) {
      console.error('No route matched:', pathname);
      setIsNavigating(false);
      return;
    }

    const { route, params } = matched;

    // Run loader if present
    let loaderData = null;
    if (route.loader) {
      const cacheKey = pathname + url.search;

      // Check cache
      if (loaderCache.has(cacheKey)) {
        loaderData = loaderCache.get(cacheKey);
      } else {
        try {
          loaderData = await route.loader({ params, query, signal: new AbortController().signal });
          loaderCache.set(cacheKey, loaderData);
        } catch (error) {
          console.error('Loader error:', error);
          setIsNavigating(false);
          return;
        }
      }
    }

    // Update browser history
    if (replace) {
      window.history.replaceState(state, '', path);
    } else {
      window.history.pushState(state, '', path);
    }

    // Update route state
    batch(() => {
      setCurrentRoute({ ...route, data: loaderData });
      setCurrentParams(params);
      setCurrentQuery(query);
      setIsNavigating(false);
    });
  };

  // Handle back/forward
  const handlePopState = () => {
    navigate(window.location.pathname + window.location.search, { replace: true });
  };

  // Initialize
  const start = () => {
    window.addEventListener('popstate', handlePopState);
    navigate(window.location.pathname + window.location.search, { replace: true });
  };

  // Cleanup
  const stop = () => {
    window.removeEventListener('popstate', handlePopState);
  };

  // Preload a route
  const preload = async (path) => {
    const url = new URL(path, window.location.origin);
    const matched = match(url.pathname);

    if (matched && matched.route.loader) {
      const cacheKey = url.pathname + url.search;
      if (!loaderCache.has(cacheKey)) {
        const query = Object.fromEntries(url.searchParams);
        try {
          const data = await matched.route.loader({
            params: matched.params,
            query,
            signal: new AbortController().signal
          });
          loaderCache.set(cacheKey, data);
        } catch (error) {
          console.error('Preload error:', error);
        }
      }
    }
  };

  // Invalidate loader cache
  const invalidate = (path) => {
    if (path) {
      loaderCache.delete(path);
    } else {
      loaderCache.clear();
    }
  };

  return {
    navigate,
    preload,
    invalidate,
    start,
    stop,
    get route() { return currentRoute(); },
    get params() { return currentParams(); },
    get query() { return currentQuery(); },
    get isNavigating() { return isNavigating(); }
  };
}

/**
 * compileRoute(route) - Compiles a route path to a regex pattern
 */
function compileRoute(route) {
  const keys = [];
  const pattern = route.path
    .replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    })
    .replace(/\*/g, '.*');

  return {
    ...route,
    pattern: new RegExp(`^${pattern}$`),
    keys
  };
}

/**
 * Link component helper
 */
export function createLink(href, options = {}) {
  const { preload = true, replace = false } = options;

  return {
    href,
    onclick: (e) => {
      e.preventDefault();
      if (window.router) {
        window.router.navigate(href, { replace });
      }
    },
    onmouseenter: preload ? () => {
      if (window.router) {
        window.router.preload(href);
      }
    } : undefined
  };
}

/**
 * useRouter() - Hook to access router in components
 */
export function useRouter() {
  return {
    navigate: (path, options) => window.router?.navigate(path, options),
    preload: (path) => window.router?.preload(path),
    invalidate: (path) => window.router?.invalidate(path),
    get route() { return currentRoute(); },
    get params() { return currentParams(); },
    get query() { return currentQuery(); },
    get isNavigating() { return isNavigating(); }
  };
}

/**
 * useParams() - Hook to access route params
 */
export function useParams() {
  return currentParams();
}

/**
 * useQuery() - Hook to access query params
 */
export function useQuery() {
  return currentQuery();
}

/**
 * useLoaderData() - Hook to access loader data
 */
export function useLoaderData() {
  const route = currentRoute();
  return route?.data;
}

/**
 * Streaming SSR support
 */

export class StreamingSSR {
  constructor() {
    this.chunks = [];
    this.islands = [];
  }

  // Render shell (non-interactive HTML)
  renderShell(html) {
    this.chunks.push(html);
  }

  // Mark an island (interactive component)
  addIsland(id, componentName, props) {
    this.islands.push({ id, componentName, props });
    this.chunks.push(`<div id="${id}" data-island="${componentName}" data-props='${JSON.stringify(props)}'></div>`);
  }

  // Stream the response
  async *stream() {
    // Yield HTML chunks
    for (const chunk of this.chunks) {
      yield chunk;
    }

    // Yield hydration script
    yield `
      <script type="module">
        // Hydrate islands
        const islands = ${JSON.stringify(this.islands)};
        for (const island of islands) {
          const el = document.getElementById(island.id);
          const Component = await import('./' + island.componentName + '.js');
          Component.hydrate(el, island.props);
        }
      </script>
    `;
  }
}

/**
 * Island hydration
 */
export function createIsland(Component) {
  return {
    // Server-side render
    render(props) {
      return Component.renderStatic(props);
    },

    // Client-side hydrate
    hydrate(element, props) {
      const instance = new Component(props);
      instance.mount(element);
    }
  };
}

/**
 * Prefetch utilities
 */

// Prefetch on viewport intersection
export function prefetchOnView(links) {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const href = entry.target.getAttribute('href');
        if (href && window.router) {
          window.router.preload(href);
        }
        observer.unobserve(entry.target);
      }
    });
  });

  links.forEach(link => observer.observe(link));
}

// Prefetch on idle
export function prefetchOnIdle(paths) {
  if (!('requestIdleCallback' in window)) {
    // Fallback to setTimeout
    setTimeout(() => {
      paths.forEach(path => window.router?.preload(path));
    }, 1000);
    return;
  }

  requestIdleCallback(() => {
    paths.forEach(path => window.router?.preload(path));
  });
}

// Prefetch on connection type
export function prefetchOnConnection(paths) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (!connection) {
    // No connection API, prefetch anyway
    paths.forEach(path => window.router?.preload(path));
    return;
  }

  // Only prefetch on fast connections
  if (connection.effectiveType === '4g' || connection.effectiveType === '3g') {
    paths.forEach(path => window.router?.preload(path));
  }
}
