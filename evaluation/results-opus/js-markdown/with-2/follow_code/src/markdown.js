const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const SAFE_URL = /^(https?:\/\/|mailto:)/;

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function trim(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '');
}

/**
 * Finds the first occurrence of `marker` at or after `from`, skipping code
 * spans (a backtick together with the next backtick after it).
 * Returns -1 when there is none.
 */
function findCloser(text, marker, from) {
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
    i++;
  }
  return -1;
}

/** Tries each inline rule at position i; returns [html, nextIndex] or null. */
function matchCode(text, i) {
  if (text[i] !== '`') return null;
  const end = text.indexOf('`', i + 1);
  if (end === -1) return null;
  return [`<code>${escapeHtml(text.slice(i + 1, end))}</code>`, end + 1];
}

function matchBold(text, i) {
  if (!text.startsWith('**', i)) return null;
  const end = findCloser(text, '**', i + 2);
  if (end === -1) return ['**', i + 2];
  const inner = renderInline(text.slice(i + 2, end), { bold: false, italic: true });
  return [`<strong>${inner}</strong>`, end + 2];
}

function matchItalic(text, i) {
  if (text[i] !== '*') return null;
  const end = findCloser(text, '*', i + 1);
  if (end === -1) return null;
  const inner = renderInline(text.slice(i + 1, end), { bold: false, italic: false });
  return [`<em>${inner}</em>`, end + 1];
}

function matchLink(text, i) {
  if (text[i] !== '[') return null;
  const close = text.indexOf(']', i + 1);
  if (close === -1 || text[close + 1] !== '(') return null;
  const paren = text.indexOf(')', close + 2);
  if (paren === -1) return null;
  const label = escapeHtml(text.slice(i + 1, close));
  const url = text.slice(close + 2, paren);
  const html = SAFE_URL.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
  return [html, paren + 1];
}

function renderInline(text, { bold = true, italic = true } = {}) {
  const rules = [matchCode];
  if (bold) rules.push(matchBold);
  if (italic) rules.push(matchItalic);
  rules.push(matchLink);

  let out = '';
  let i = 0;
  while (i < text.length) {
    let match = null;
    for (const rule of rules) {
      match = rule(text, i);
      if (match) break;
    }
    if (match) {
      out += match[0];
      i = match[1];
    } else {
      out += escapeHtml(text[i]);
      i++;
    }
  }
  return out;
}

function classify(line) {
  const heading = /^(#{1,3}) ([\s\S]*)$/.exec(line);
  if (heading) return { kind: 'heading', level: heading[1].length, text: trim(heading[2]) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  if (line.startsWith('> ')) return { kind: 'quote', text: trim(line.slice(2)) };
  const ordered = /^[0-9]+\. ([\s\S]*)$/.exec(line);
  if (ordered) return { kind: 'ol', text: trim(ordered[1]) };
  return { kind: 'text', text: trim(line) };
}

/** Returns the language word ('' when none) if `line` opens a fence, else null. */
function openingFence(line) {
  if (!line.startsWith('```')) return null;
  const rest = trim(line.slice(3));
  return rest === '' || /^[^ \t`]+$/.test(rest) ? rest : null;
}

function isClosingFence(line) {
  return line.replace(/[ \t]+$/, '') === '```';
}

function renderBlock(block) {
  if (block.kind === 'heading') {
    return `<h${block.level}>${renderInline(block.items[0])}</h${block.level}>`;
  }
  if (block.kind === 'text') {
    return `<p>${renderInline(block.items.join(' '))}</p>`;
  }
  if (block.kind === 'quote') {
    const text = block.items.filter((item) => item !== '').join(' ');
    return `<blockquote><p>${renderInline(text)}</p></blockquote>`;
  }
  if (block.kind === 'code') {
    const attr = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
    return `<pre><code${attr}>${escapeHtml(block.items.join('\n'))}</code></pre>`;
  }
  const items = block.items.map((item) => `<li>${renderInline(item)}</li>`);
  return [`<${block.kind}>`, ...items, `</${block.kind}>`].join('\n');
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const blocks = [];
  let current = null;
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = openingFence(line);
    if (fence !== null) {
      let end = lines.findIndex((l, j) => j > i && isClosingFence(l));
      let items;
      if (end === -1) {
        items = lines.slice(i + 1);
        while (items.length > 0 && trim(items[items.length - 1]) === '') items.pop();
        end = lines.length;
      } else {
        items = lines.slice(i + 1, end);
      }
      blocks.push({ kind: 'code', lang: fence, items });
      current = null;
      i = end;
      continue;
    }
    if (trim(line) === '') {
      current = null;
      continue;
    }
    const { kind, level, text } = classify(line);
    if (current && current.kind === kind && kind !== 'heading') {
      current.items.push(text);
    } else {
      current = { kind, level, items: [text] };
      blocks.push(current);
    }
  }
  return blocks.map(renderBlock).join('\n');
}
