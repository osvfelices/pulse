import fs from '../../std/fs.mjs'
import path from '../../std/path.mjs'

function escapeHtml(text) {
  return text.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
}

function processCodeBlocks(text) {
  let result = ''
  let i = 0

  while (i < text.length) {
    const start = text.indexOf('```', i)
    if (start == -1) {
      result = result + text.substring(i)
      break
    }

    result = result + text.substring(i, start)
    const codeStart = text.indexOf('\n', start) + 1
    const codeEnd = text.indexOf('```', codeStart)

    if (codeEnd == -1) {
      result = result + text.substring(start)
      break
    }

    const code = text.substring(codeStart, codeEnd)
    const escaped = escapeHtml(code)
    result = result + '<pre><code>' + escaped + '</code></pre>'
    i = codeEnd + 3
  }

  return result
}

function processInlineCode(text) {
  let result = ''
  let i = 0

  while (i < text.length) {
    const start = text.indexOf('`', i)
    if (start == -1) {
      result = result + text.substring(i)
      break
    }

    result = result + text.substring(i, start)
    const codeEnd = text.indexOf('`', start + 1)

    if (codeEnd == -1) {
      result = result + text.substring(start)
      break
    }

    const code = text.substring(start + 1, codeEnd)
    result = result + '<code>' + code + '</code>'
    i = codeEnd + 1
  }

  return result
}

function processBold(text) {
  let result = ''
  let i = 0

  while (i < text.length) {
    const start = text.indexOf('**', i)
    if (start == -1) {
      result = result + text.substring(i)
      break
    }

    result = result + text.substring(i, start)
    const end = text.indexOf('**', start + 2)

    if (end == -1) {
      result = result + text.substring(start)
      break
    }

    const content = text.substring(start + 2, end)
    result = result + '<strong>' + content + '</strong>'
    i = end + 2
  }

  return result
}

function processLinks(text) {
  let result = ''
  let i = 0

  while (i < text.length) {
    const start = text.indexOf('[', i)
    if (start == -1) {
      result = result + text.substring(i)
      break
    }

    const textEnd = text.indexOf(']', start + 1)
    if (textEnd == -1) {
      result = result + text.substring(start)
      break
    }

    const nextChar = text.charAt(textEnd + 1)
    if (nextChar != '(') {
      result = result + text.substring(i, textEnd + 1)
      i = textEnd + 1
      continue
    }

    const urlEnd = text.indexOf(')', textEnd + 2)
    if (urlEnd == -1) {
      result = result + text.substring(i, textEnd + 1)
      i = textEnd + 1
      continue
    }

    result = result + text.substring(i, start)
    const linkText = text.substring(start + 1, textEnd)
    const url = text.substring(textEnd + 2, urlEnd)
    result = result + '<a href="' + url + '">' + linkText + '</a>'
    i = urlEnd + 1
  }

  return result
}

function parseMarkdown(markdown) {
  let html = processCodeBlocks(markdown)
  html = processInlineCode(html)
  html = processBold(html)
  html = processLinks(html)

  const lines = html.split('\n')
  let processed = []
  let inList = false
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('<pre><code>')) {
      inCodeBlock = true
      processed.push(line)
      continue
    }

    if (trimmed == '</code></pre>') {
      inCodeBlock = false
      processed.push(line)
      continue
    }

    if (inCodeBlock) {
      processed.push(line)
      continue
    }

    if (line.startsWith('### ')) {
      processed.push('<h3>' + line.substring(4) + '</h3>')
      continue
    }

    if (line.startsWith('## ')) {
      processed.push('<h2>' + line.substring(3) + '</h2>')
      continue
    }

    if (line.startsWith('# ')) {
      processed.push('<h1>' + line.substring(2) + '</h1>')
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        processed.push('<ul>')
        inList = true
      }
      const content = line.substring(2)
      processed.push('<li>' + content + '</li>')
      continue
    } else {
      if (inList) {
        processed.push('</ul>')
        inList = false
      }
    }

    if (trimmed.startsWith('>')) {
      const content = line.substring(line.indexOf('>') + 1).trim()
      processed.push('<blockquote>' + content + '</blockquote>')
      continue
    }

    if (trimmed == '---') {
      processed.push('<hr>')
      continue
    }

    if (trimmed == '') {
      processed.push('')
      continue
    }

    if (!trimmed.startsWith('<')) {
      processed.push('<p>' + line + '</p>')
    } else {
      processed.push(line)
    }
  }

  if (inList) {
    processed.push('</ul>')
  }

  return processed.join('\n')
}

function getTitle(markdown) {
  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) {
      return lines[i].substring(2).trim()
    }
  }
  return 'Documentation'
}

function replaceAll(text, search, replacement) {
  return text.split(search).join(replacement)
}

async function buildDocs() {
  console.log('Building Pulse documentation...')

  const docsRoot = path.resolve('docs')
  const pagesDir = path.join(docsRoot, 'pages')
  const templatesDir = path.join(docsRoot, 'templates')
  const buildDir = path.join(docsRoot, 'build')

  const templatePath = path.join(templatesDir, 'base.html')
  const templateExists = await fs.exists(templatePath)
  if (!templateExists) {
    console.log('Error: Template file not found at', templatePath)
    return
  }

  console.log('Reading template...')
  const template = await fs.readText(templatePath)

  const buildExists = await fs.exists(buildDir)
  if (!buildExists) {
    console.log('Creating build directory...')
    await fs.createDir(buildDir)
  }

  console.log('Reading pages directory...')
  const files = await fs.readDir(pagesDir)

  let processedCount = 0

  for (const file of files) {
    if (!file.endsWith('.md')) {
      continue
    }

    console.log('Processing ' + file + '...')

    const filePath = path.join(pagesDir, file)
    const markdown = await fs.readText(filePath)

    const title = getTitle(markdown)
    const htmlContent = parseMarkdown(markdown)

    let html = template
    html = replaceAll(html, '{{TITLE}}', title)
    html = replaceAll(html, '{{CONTENT}}', htmlContent)

    const outputFile = file.split('.md').join('.html')
    const outputPath = path.join(buildDir, outputFile)

    await fs.writeText(outputPath, html)
    console.log('  Generated ' + outputFile)

    processedCount = processedCount + 1
  }

  console.log('Copying static assets...')

  const stylePath = path.join(docsRoot, 'style.css')
  const styleExists = await fs.exists(stylePath)
  if (styleExists) {
    await fs.copyFile(stylePath, path.join(buildDir, 'style.css'))
    console.log('  Copied style.css')
  }

  const logoPath = path.join(docsRoot, 'logo.svg')
  const logoExists = await fs.exists(logoPath)
  if (logoExists) {
    await fs.copyFile(logoPath, path.join(buildDir, 'logo.svg'))
    console.log('  Copied logo.svg')
  }

  console.log('')
  console.log('Build complete! Processed ' + processedCount + ' pages.')
  console.log('Output directory: ' + buildDir)
  console.log('')
  console.log('To view the documentation, open:')
  console.log('  file://' + path.join(buildDir, 'index.html'))
}

await buildDocs()
