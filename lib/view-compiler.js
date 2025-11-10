/**
 * View compiler for Pulse
 * Compiles view declarations to Web Components (Custom Elements)
 */

import { emitExpr, emitStmt, emitBlock } from './codegen.js';

export function compileView(viewNode) {
  const { name, params, body } = viewNode;
  const componentName = kebabCase(name);

  // Extract state variables and template from body
  const { stateVars, eventHandlers, templateString } = analyzeViewBody(body);

  // Generate Web Component class
  const code = `
class ${name}Component extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Initialize state
    this._state = ${generateInitialState(stateVars)};

    // Bind methods
    ${eventHandlers.map(h => `this.${h} = this.${h}.bind(this);`).join('\n    ')}
  }

  connectedCallback() {
    this.render();
  }

  // State update helper
  _setState(updates) {
    this._state = { ...this._state, ...updates };
    this.render();
  }

  // Event handlers
  ${generateEventHandlers(body)}

  render() {
    const state = this._state;
    const props = this._props || {};

    this.shadowRoot.innerHTML = \`
      <style>
        :host {
          display: block;
        }
      </style>
      \${${generateTemplateExpression(templateString, stateVars)}}
    \`;

    // Attach event listeners
    ${generateEventAttachments(eventHandlers)}
  }
}

customElements.define('${componentName}', ${name}Component);
`;

  return code;
}

function analyzeViewBody(body) {
  const stateVars = [];
  const eventHandlers = [];
  let templateString = '';

  for (const stmt of body.statements) {
    if (stmt.kind === 'VarDecl') {
      // Track state variables
      stateVars.push({
        name: stmt.name,
        init: stmt.init,
        constant: stmt.constant
      });
    } else if (stmt.kind === 'FnDecl') {
      // Track event handlers
      eventHandlers.push(stmt.name);
    } else if (stmt.kind === 'ReturnStmt') {
      // Extract template
      if (stmt.expr.kind === 'StringLiteral') {
        templateString = stmt.expr.value;
      } else if (stmt.expr.kind === 'TemplateLiteral') {
        // Template string - strip backticks
        templateString = stmt.expr.value.slice(1, -1);
      }
    }
  }

  return { stateVars, eventHandlers, templateString };
}

function generateInitialState(stateVars) {
  const props = stateVars.map(v => {
    let initValue = 'undefined';
    if (v.init) {
      initValue = emitExpr(v.init);
    }
    return `${v.name}: ${initValue}`;
  });
  return `{ ${props.join(', ')} }`;
}

function generateEventHandlers(body) {
  const handlers = [];

  // Get list of state variable names
  const stateVarNames = new Set();
  for (const stmt of body.statements) {
    if (stmt.kind === 'VarDecl') {
      stateVarNames.add(stmt.name);
    }
  }

  for (const stmt of body.statements) {
    if (stmt.kind === 'FnDecl' && stmt.name) {
      // Generate method code using proper codegen
      const params = stmt.params.map(p => p.name).join(', ');

      // Process body to replace state var assignments
      const processedBody = processHandlerBody(stmt.body, stateVarNames);

      handlers.push(`${stmt.name}(${params}) ${processedBody}`);
    }
  }

  return handlers.join('\n\n  ');
}

function processHandlerBody(block, stateVars) {
  // Transform the entire block to rewrite state variable references
  const transformedBlock = transformBlock(block, stateVars);

  const lines = transformedBlock.statements.map(stmt => {
    return processStatement(stmt, stateVars);
  }).filter(Boolean);

  return `{\n    ${lines.join('\n    ')}\n  }`;
}

// Recursively transform AST nodes to rewrite state variable references
function transformNode(node, stateVars) {
  if (!node || typeof node !== 'object') return node;

  // Clone the node
  const transformed = { ...node };

  // Transform based on node type
  if (node.kind === 'Identifier' && stateVars.has(node.name)) {
    // Rewrite state variable to this._state.xxx
    return {
      kind: 'MemberExpr',
      object: {
        kind: 'MemberExpr',
        object: { kind: 'Identifier', name: 'this' },
        property: '_state'
      },
      property: node.name
    };
  }

  // Transform assignment to state variables into _setState calls
  if (node.kind === 'BinaryExpr' && node.op === '=') {
    // First transform the children
    const left = transformNode(node.left, stateVars);
    const right = transformNode(node.right, stateVars);

    // Check if this is an assignment to this._state.xxx
    if (left.kind === 'MemberExpr' &&
        left.object && left.object.kind === 'MemberExpr' &&
        left.object.object && left.object.object.kind === 'Identifier' &&
        left.object.object.name === 'this' &&
        left.object.property === '_state') {
      // Transform into this._setState({ varName: value })
      const varName = left.property;
      return {
        kind: 'CallExpr',
        callee: {
          kind: 'MemberExpr',
          object: { kind: 'Identifier', name: 'this' },
          property: '_setState'
        },
        args: [{
          kind: 'ObjectExpr',
          properties: [{
            key: varName,
            value: right
          }]
        }]
      };
    }

    return { ...transformed, left, right };
  }

  // Recursively transform child nodes
  for (const key in transformed) {
    if (key === 'kind') continue;
    const value = transformed[key];

    if (Array.isArray(value)) {
      transformed[key] = value.map(item => transformNode(item, stateVars));
    } else if (value && typeof value === 'object') {
      transformed[key] = transformNode(value, stateVars);
    }
  }

  return transformed;
}

function transformBlock(block, stateVars) {
  return transformNode(block, stateVars);
}

function processStatement(stmt, stateVars) {
  // Check if this is an assignment to a state variable
  if (stmt.kind === 'ExprStmt') {
    const expr = stmt.expr;
    if (expr.kind === 'BinaryExpr' && expr.op === '=') {
      // Check if left side is this._state.xxx (after transformation)
      if (expr.left.kind === 'MemberExpr' &&
          expr.left.object && expr.left.object.kind === 'MemberExpr' &&
          expr.left.object.object && expr.left.object.object.name === 'this' &&
          expr.left.object.property === '_state') {
        // State variable assignment - convert to _setState
        const varName = expr.left.property;
        const valueCode = emitExpr(expr.right);
        return `this._setState({ ${varName}: ${valueCode} });`;
      }
      if (expr.left.kind === 'IndexExpr') {
        // Array/object index assignment - emit as-is but add render call
        const code = emitStmt(stmt);
        return code + '\n    this.render();';
      }
    }
  }

  // For all other statements, emit as-is using codegen
  return emitStmt(stmt);
}

function generateTemplateExpression(template, stateVars) {
  // Replace {{expr}} with ${state.expr}
  let result = template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const trimmed = expr.trim();
    return `\${state.${trimmed}}`;
  });

  return `\`${result}\``;
}

function generateEventAttachments(eventHandlers) {
  return eventHandlers.map(handler => {
    return `const btn_${handler} = this.shadowRoot.querySelector('[data-handler="${handler}"]');
    if (btn_${handler}) btn_${handler}.onclick = this.${handler};`;
  }).join('\n    ');
}

function kebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
