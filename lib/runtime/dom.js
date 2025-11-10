/**
 * Pulse Fine-Grained DOM Bindings
 *
 * Updates individual DOM nodes without virtual DOM or reconciliation
 * Each binding creates a precise subscription to specific signals
 */

import { effect } from './reactivity.js';

/**
 * bindText(element, fn) - Binds a text node to a reactive expression
 *
 * Only updates this specific text node when dependencies change
 */
export function bindText(element, fn) {
  return effect(() => {
    element.textContent = fn();
  });
}

/**
 * bindAttr(element, attr, fn) - Binds an attribute to a reactive expression
 */
export function bindAttr(element, attr, fn) {
  return effect(() => {
    const value = fn();
    if (value === null || value === undefined || value === false) {
      element.removeAttribute(attr);
    } else if (value === true) {
      element.setAttribute(attr, '');
    } else {
      element.setAttribute(attr, String(value));
    }
  });
}

/**
 * bindProp(element, prop, fn) - Binds a property to a reactive expression
 */
export function bindProp(element, prop, fn) {
  return effect(() => {
    element[prop] = fn();
  });
}

/**
 * bindClass(element, className, fn) - Conditionally toggles a class
 */
export function bindClass(element, className, fn) {
  return effect(() => {
    const shouldAdd = fn();
    if (shouldAdd) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  });
}

/**
 * bindStyle(element, styleProp, fn) - Binds a style property
 */
export function bindStyle(element, styleProp, fn) {
  return effect(() => {
    element.style[styleProp] = fn();
  });
}

/**
 * bindShow(element, fn) - Conditionally shows/hides element
 */
export function bindShow(element, fn) {
  let originalDisplay = null;

  return effect(() => {
    const shouldShow = fn();
    if (shouldShow) {
      if (originalDisplay === null) {
        element.style.display = '';
      } else {
        element.style.display = originalDisplay;
      }
    } else {
      if (originalDisplay === null) {
        originalDisplay = element.style.display || '';
      }
      element.style.display = 'none';
    }
  });
}

/**
 * bindIf(parent, fn, templateFn) - Conditionally renders content
 *
 * Inserts/removes DOM nodes based on condition
 * More efficient than bindShow for large subtrees
 */
export function bindIf(parent, fn, templateFn) {
  let currentNodes = [];
  const marker = document.createComment('if');
  parent.appendChild(marker);

  return effect(() => {
    const shouldRender = fn();

    if (shouldRender && currentNodes.length === 0) {
      // Render
      const nodes = templateFn();
      currentNodes = Array.isArray(nodes) ? nodes : [nodes];
      currentNodes.forEach(node => {
        parent.insertBefore(node, marker);
      });
    } else if (!shouldRender && currentNodes.length > 0) {
      // Remove
      currentNodes.forEach(node => node.remove());
      currentNodes = [];
    }
  });
}

/**
 * bindFor(parent, items, keyFn, templateFn) - Renders a list reactively
 *
 * Uses keyed reconciliation for efficient updates
 * Only adds/removes/moves nodes that changed
 */
export function bindFor(parent, itemsFn, keyFn, templateFn) {
  const marker = document.createComment('for');
  parent.appendChild(marker);

  const nodeMap = new Map(); // key -> {node, dispose}
  let currentKeys = [];

  return effect(() => {
    const items = itemsFn();
    const newKeys = items.map(keyFn);
    const newKeySet = new Set(newKeys);

    // Remove nodes that are no longer in the list
    for (const [key, {node, dispose}] of nodeMap) {
      if (!newKeySet.has(key)) {
        node.remove();
        if (dispose) dispose();
        nodeMap.delete(key);
      }
    }

    // Add or move nodes
    let previousNode = marker;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = newKeys[i];

      if (nodeMap.has(key)) {
        // Existing node - move if needed
        const {node} = nodeMap.get(key);
        if (node.previousSibling !== previousNode) {
          parent.insertBefore(node, previousNode.nextSibling);
        }
        previousNode = node;
      } else {
        // New node - create and insert
        const {node, dispose} = templateFn(item, i);
        parent.insertBefore(node, previousNode.nextSibling);
        nodeMap.set(key, {node, dispose});
        previousNode = node;
      }
    }

    currentKeys = newKeys;
  });
}

/**
 * bindEvent(element, event, handler) - Attaches event listener
 *
 * Not reactive, just a convenience method
 */
export function bindEvent(element, event, handler) {
  element.addEventListener(event, handler);
  return () => element.removeEventListener(event, handler);
}

/**
 * createTemplate(html) - Creates a template from HTML string
 *
 * Uses <template> for efficient cloning
 */
export function createTemplate(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return () => template.content.cloneNode(true);
}

/**
 * insert(parent, fn, marker = null) - Inserts reactive content
 *
 * Handles text, nodes, arrays, and reactive expressions
 */
export function insert(parent, fn, marker = null) {
  if (typeof fn !== 'function') {
    // Static content
    const node = typeof fn === 'string' ? document.createTextNode(fn) : fn;
    if (marker) {
      parent.insertBefore(node, marker);
    } else {
      parent.appendChild(node);
    }
    return;
  }

  // Reactive content
  let current = null;

  return effect(() => {
    const value = fn();

    // Remove old content
    if (current) {
      if (Array.isArray(current)) {
        current.forEach(node => node.remove());
      } else {
        current.remove();
      }
    }

    // Insert new content
    if (value === null || value === undefined) {
      current = null;
    } else if (Array.isArray(value)) {
      current = value;
      value.forEach(node => {
        if (marker) {
          parent.insertBefore(node, marker);
        } else {
          parent.appendChild(node);
        }
      });
    } else if (typeof value === 'string' || typeof value === 'number') {
      const textNode = document.createTextNode(String(value));
      if (marker) {
        parent.insertBefore(textNode, marker);
      } else {
        parent.appendChild(textNode);
      }
      current = textNode;
    } else {
      // Assume it's a Node
      if (marker) {
        parent.insertBefore(value, marker);
      } else {
        parent.appendChild(value);
      }
      current = value;
    }
  });
}

/**
 * delegateEvent(root, event, selector, handler) - Event delegation
 *
 * Attaches a single listener to root and delegates to matching elements
 * More efficient for large lists
 */
export function delegateEvent(root, event, selector, handler) {
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) {
      handler.call(target, e);
    }
  };

  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

/**
 * Portal - Renders content to a different part of the DOM
 */
export function createPortal(content, target) {
  if (typeof target === 'string') {
    target = document.querySelector(target);
  }

  if (!target) {
    throw new Error('Portal target not found');
  }

  return effect(() => {
    const node = typeof content === 'function' ? content() : content;
    target.appendChild(node);
    return () => node.remove();
  });
}

/**
 * Ref - Creates a reference to a DOM element
 */
export function createRef() {
  let current = null;

  return {
    get current() { return current; },
    set current(value) { current = value; }
  };
}

/**
 * useRef(element) - Helper to set a ref
 */
export function useRef(ref) {
  return (element) => {
    ref.current = element;
  };
}
