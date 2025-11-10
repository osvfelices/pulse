// Monaco Editor setup with Pulse theme
import * as monaco from 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/+esm'

const examples = {
  hello: `fn main() {
  print('Hello, Pulse!')
}`,
  reactivity: `import { signal, effect } from 'std/reactive'

const [count, setCount] = signal(0)

effect(() => {
  print('Count:', count())
})

setCount(5)`,
  channels: `import { channel } from 'std/async'

const ch = channel()

async fn worker() {
  for (const msg of ch) {
    print('Received:', msg)
  }
}

worker()
ch.send('Hello')
ch.send('World')`,
  classes: `class Counter {
  constructor() {
    this.value = 0
  }

  increment() {
    this.value++
  }
}

const c = new Counter()
c.increment()
print(c.value)`
}

// Theme definitions
const pulseDarkTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'string', foreground: 'ecc48d' },
    { token: 'number', foreground: 'f78c6c' },
    { token: 'identifier.function', foreground: '82aaff' },
    { token: 'identifier', foreground: 'c3e88d' },
    { token: 'delimiter', foreground: 'b0b8c2' },
    { token: 'operator', foreground: 'c792ea' }
  ],
  colors: {
    'editor.background': '#101317',
    'editor.foreground': '#e6e9ef',
    'editorLineNumber.foreground': '#b0b8c2',
    'editorCursor.foreground': '#4a6bff',
    'editor.selectionBackground': '#242830',
    'editor.lineHighlightBackground': '#1a1d23',
    'editorWidget.background': '#1a1d23',
    'editorWidget.border': '#2e3440'
  }
}

const pulseLightTheme = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '90a4ae', fontStyle: 'italic' },
    { token: 'keyword', foreground: '9c27b0' },
    { token: 'string', foreground: 'f57c00' },
    { token: 'number', foreground: 'd84315' },
    { token: 'identifier.function', foreground: '1976d2' },
    { token: 'identifier', foreground: '558b2f' },
    { token: 'delimiter', foreground: '546e7a' },
    { token: 'operator', foreground: '9c27b0' }
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1d23',
    'editorLineNumber.foreground': '#546e7a',
    'editorCursor.foreground': '#4a6bff',
    'editor.selectionBackground': '#e6e9ef',
    'editor.lineHighlightBackground': '#f5f5f5',
    'editorWidget.background': '#f5f5f5',
    'editorWidget.border': '#d0d7de'
  }
}

// Register themes
monaco.editor.defineTheme('pulse-dark', pulseDarkTheme)
monaco.editor.defineTheme('pulse-light', pulseLightTheme)

// Register language (simplified - using JavaScript syntax as base)
monaco.languages.register({ id: 'pulse' })
monaco.languages.setMonarchTokensProvider('pulse', {
  keywords: [
    'fn', 'let', 'const', 'if', 'else', 'for', 'while', 'return',
    'break', 'continue', 'import', 'from', 'as', 'export',
    'class', 'extends', 'new', 'async', 'await', 'contract', 'view',
    'true', 'false', 'null', 'undefined'
  ],
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
    '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
    '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
    '%=', '<<=', '>>=', '>>>='
  ],
  tokenizer: {
    root: [
      [/[a-z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@default': 'identifier'
        }
      }],
      [/[A-Z][\w\$]*/, 'type.identifier'],
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],
      [/`/, 'string', '@string_backtick'],
      [/\d+/, 'number'],
      [/[{}()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],
      [/\/\/.*$/, 'comment']
    ],
    string_double: [
      [/[^\\"]+/, 'string'],
      [/"/, 'string', '@pop']
    ],
    string_single: [
      [/[^\\']+/, 'string'],
      [/'/, 'string', '@pop']
    ],
    string_backtick: [
      [/[^\\`]+/, 'string'],
      [/`/, 'string', '@pop']
    ]
  }
})

// Get saved theme or default to dark
const savedTheme = localStorage.getItem('pulse-playground-theme') || 'pulse-dark'
document.documentElement.dataset.theme = savedTheme === 'pulse-light' ? 'light' : 'dark'

// Create editor
const editor = monaco.editor.create(document.getElementById('editor'), {
  value: examples.hello,
  language: 'pulse',
  theme: savedTheme,
  fontSize: 14,
  fontFamily: 'JetBrains Mono, monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2
})

// Theme toggle
const themeToggle = document.getElementById('theme-toggle')
themeToggle.addEventListener('click', () => {
  const currentTheme = editor.getRawOptions().theme
  const newTheme = currentTheme === 'pulse-dark' ? 'pulse-light' : 'pulse-dark'
  editor.updateOptions({ theme: newTheme })
  document.documentElement.dataset.theme = newTheme === 'pulse-light' ? 'light' : 'dark'
  localStorage.setItem('pulse-playground-theme', newTheme)
})

// Copy button
const copyBtn = document.getElementById('copy-btn')
copyBtn.addEventListener('click', async () => {
  const code = editor.getValue()
  await navigator.clipboard.writeText(code)

  const originalText = copyBtn.innerHTML
  copyBtn.innerHTML = '<svg width="16" height="16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>Copied!'

  setTimeout(() => {
    copyBtn.innerHTML = originalText
  }, 2000)
})

// Download button
const downloadBtn = document.getElementById('download-btn')
downloadBtn.addEventListener('click', () => {
  const code = editor.getValue()
  const blob = new Blob([code], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'example.pulse'
  a.click()
  URL.revokeObjectURL(url)
})

// Example buttons
const exampleBtns = document.querySelectorAll('.example-btn')
exampleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const example = btn.dataset.example
    editor.setValue(examples[example])

    exampleBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})
