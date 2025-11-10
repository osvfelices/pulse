#!/usr/bin/env node

import { getHighlighter } from 'shiki'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isLight = process.argv.includes('--light')
const themeName = isLight ? 'pulse-light' : 'pulse-dark'

// Load custom theme
const themeFile = join(__dirname, 'theme', `${themeName}.json`)
const theme = JSON.parse(readFileSync(themeFile, 'utf8'))

// Load grammar
const grammarFile = join(__dirname, 'grammar', 'pulse.tmLanguage.json')
const grammar = JSON.parse(readFileSync(grammarFile, 'utf8'))

// Code snippets
const snippets = {
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

function generateSvg(tokens, theme) {
  const lines = tokens.tokens
  const bg = theme.colors['editor.background']
  const fg = theme.colors['editor.foreground']
  const lineHeight = 20
  const padding = 16
  const height = lines.length * lineHeight + padding * 2
  const width = 600

  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
<rect width="${width}" height="${height}" fill="${bg}" rx="8"/>
<g font-family="JetBrains Mono, monospace" font-size="14">
`

  lines.forEach((line, i) => {
    let x = padding
    const y = padding + (i + 1) * lineHeight - 4

    line.forEach(token => {
      const color = token.color || fg
      const text = token.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      if (text) {
        svgContent += `<text x="${x}" y="${y}" fill="${color}">${text}</text>`
        x += text.length * 8.4 // approximate char width
      }
    })
  })

  svgContent += '</g>\n</svg>'
  return svgContent
}

async function main() {
  console.log(`Generating snippets with ${themeName}...`)

  const highlighter = await getHighlighter({
    themes: [],
    langs: ['javascript']
  })

  // Load custom theme
  await highlighter.loadTheme(theme)

  // Ensure output directory exists
  const outputDir = join(__dirname, '..', '..', 'assets', 'snippets')
  mkdirSync(outputDir, { recursive: true })

  for (const [name, code] of Object.entries(snippets)) {
    // Use javascript lang as it's similar to Pulse
    const tokens = highlighter.codeToTokens(code, {
      lang: 'javascript',
      theme: theme.name
    })

    const svg = generateSvg(tokens, theme)

    const outputPath = join(outputDir, `${name}${isLight ? '-light' : ''}.svg`)
    writeFileSync(outputPath, svg, 'utf8')
    console.log(`  Generated ${name}${isLight ? '-light' : ''}.svg`)
  }

  console.log('Done!')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
