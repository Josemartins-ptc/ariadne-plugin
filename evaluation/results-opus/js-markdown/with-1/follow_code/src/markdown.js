const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function trim(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '');
}

const SAFE_URL = /^(https?:\/\/|mailto:)/;

// Inline rule levels: TOP allows bold, BOLD allows italic, ITALIC allows only code and links.
const TOP = 0;
const BOLD = 1;
const ITALIC = 2;

/** Index of the first `marker` at or after `from`, skipping code spans; -1 if none. */
function findCloser(text, from, marker) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith(marker, i)) return i;
    i += 1;
  }
  return -1;
}

function tryCode(text, i) {
  const end = text.indexOf('`', i + 1);
  if (end === -1) return null;
  return { html: `<code>${escapeHtml(text.slice(i + 1, end))}</code>`, next: end + 1 };
}

function tryWrapped(text, i, marker, tag, innerLevel) {
  const start = i + marker.length;
  const end = findCloser(text, start, marker);
  if (end === -1) return null;
  const inner = renderInline(text.slice(start, end), innerLevel);
  return { html: `<${tag}>${inner}</${tag}>`, next: end + marker.length };
}

function tryLink(text, i) {
  const close = text.indexOf(']', i + 1);
  if (close === -1 || text[close + 1] !== '(') return null;
  const paren = text.indexOf(')', close + 2);
  if (paren === -1) return null;
  const label = escapeHtml(text.slice(i + 1, close));
  const url = text.slice(close + 2, paren);
  const html = SAFE_URL.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
  return { html, next: paren + 1 };
}

function matchAt(text, i, level) {
  const ch = text[i];
  if (ch === '`') return tryCode(text, i);
  if (ch === '[') return tryLink(text, i);
  if (ch !== '*' || level === ITALIC) return null;
  if (text[i + 1] === '*' && level === TOP) {
    return tryWrapped(text, i, '**', 'strong', BOLD) ?? { html: '**', next: i + 2 };
  }
  return tryWrapped(text, i, '*', 'em', ITALIC);
}

function renderInline(text, level = TOP) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const match = matchAt(text, i, level);
    if (match) {
      out += match.html;
      i = match.next;
    } else {
      out += escapeHtml(text[i]);
      i += 1;
    }
  }
  return out;
}

function isBlank(line) {
  return /^[ \t]*$/.test(line);
}

/** Language word of an opening fence ('' for none), or null if `line` is not one. */
function openingFence(line) {
  if (!line.startsWith('```')) return null;
  const rest = trim(line.slice(3));
  return /^[^ \t`]*$/.test(rest) ? rest : null;
}

function isClosingFence(line) {
  return line.replace(/[ \t]+$/, '') === '```';
}

function classify(line) {
  if (isBlank(line)) return { kind: 'blank' };
  const heading = /^(#{1,3}) ([\s\S]*)$/.exec(line);
  if (heading) return { kind: 'heading', level: heading[1].length, text: trim(heading[2]) };
  if (line.startsWith('> ')) return { kind: 'quote', text: trim(line.slice(2)) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  const ordered = /^[0-9]+\. ([\s\S]*)$/.exec(line);
  if (ordered) return { kind: 'ol', text: trim(ordered[1]) };
  return { kind: 'text', text: trim(line) };
}

function renderBlock(block) {
  if (block.kind === 'heading') {
    return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`;
  }
  if (block.kind === 'code') {
    const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
    return `<pre><code${cls}>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
  }
  if (block.kind === 'quote') {
    const text = block.lines.filter((line) => line !== '').join(' ');
    return `<blockquote><p>${renderInline(text)}</p></blockquote>`;
  }
  if (block.kind === 'text') {
    return `<p>${renderInline(block.lines.join(' '))}</p>`;
  }
  const items = block.lines.map((item) => `<li>${renderInline(item)}</li>`);
  return [`<${block.kind}>`, ...items, `</${block.kind}>`].join('\n');
}

/** Pushes a code block whose content starts at `start`; returns the index of its closing fence. */
function collectCode(lines, start, lang, blocks) {
  let end = start;
  while (end < lines.length && !isClosingFence(lines[end])) end += 1;
  let content = lines.slice(start, end);
  if (end === lines.length) {
    let keep = content.length;
    while (keep > 0 && isBlank(content[keep - 1])) keep -= 1;
    content = content.slice(0, keep);
  }
  blocks.push({ kind: 'code', lang, lines: content });
  return end;
}

function groupBlocks(lines) {
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lang = openingFence(line);
    if (lang !== null) {
      i = collectCode(lines, i + 1, lang, blocks);
      current = null;
      continue;
    }
    const info = classify(line);
    if (info.kind === 'blank') {
      current = null;
    } else if (info.kind === 'heading') {
      blocks.push(info);
      current = null;
    } else if (current && current.kind === info.kind) {
      current.lines.push(info.text);
    } else {
      current = { kind: info.kind, lines: [info.text] };
      blocks.push(current);
    }
  }
  return blocks;
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  return groupBlocks(lines).map(renderBlock).join('\n');
}
