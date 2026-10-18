const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function trim(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '');
}

// Inline levels: which rules apply to a piece of text.
const FULL = 3; // code, bold, italic, link
const BOLD_CONTENT = 2; // code, italic, link
const ITALIC_CONTENT = 1; // code, link

const SAFE_URL = /^(https?:\/\/|mailto:)/;

/**
 * Finds the first occurrence of `marker` at or after `from`, skipping code spans.
 * @returns {number} index of the marker, or -1
 */
function findCloser(text, from, marker) {
  let j = from;
  while (j < text.length) {
    if (text[j] === '`') {
      const end = text.indexOf('`', j + 1);
      if (end !== -1) {
        j = end + 1;
        continue;
      }
    }
    if (text.startsWith(marker, j)) return j;
    j++;
  }
  return -1;
}

/** Tries to parse a link at `i`; returns { html, end } or null. */
function parseLink(text, i) {
  const close = text.indexOf(']', i + 1);
  if (close === -1 || text[close + 1] !== '(') return null;
  const paren = text.indexOf(')', close + 2);
  if (paren === -1) return null;
  const label = escapeHtml(text.slice(i + 1, close));
  const url = text.slice(close + 2, paren);
  const html = SAFE_URL.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
  return { html, end: paren + 1 };
}

/** Tries to parse an emphasis span (`**` or `*`) at `i`; returns { html, end } or null. */
function parseEmphasis(text, i, marker, tag, innerLevel) {
  const closer = findCloser(text, i + marker.length, marker);
  if (closer === -1) return null;
  const content = renderInline(text.slice(i + marker.length, closer), innerLevel);
  return { html: `<${tag}>${content}</${tag}>`, end: closer + marker.length };
}

function parseAt(text, i, level) {
  const ch = text[i];
  if (ch === '`') {
    const end = text.indexOf('`', i + 1);
    if (end === -1) return null;
    return { html: `<code>${escapeHtml(text.slice(i + 1, end))}</code>`, end: end + 1 };
  }
  if (ch === '*' && text[i + 1] === '*' && level >= FULL) {
    // Unclosed `**` is literal as a pair.
    return parseEmphasis(text, i, '**', 'strong', BOLD_CONTENT) ?? { html: '**', end: i + 2 };
  }
  if (ch === '*' && level >= BOLD_CONTENT) {
    return parseEmphasis(text, i, '*', 'em', ITALIC_CONTENT);
  }
  if (ch === '[') return parseLink(text, i);
  return null;
}

function renderInline(text, level = FULL) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const parsed = parseAt(text, i, level);
    if (parsed) {
      out += parsed.html;
      i = parsed.end;
    } else {
      out += escapeHtml(text[i]);
      i++;
    }
  }
  return out;
}

function classify(line) {
  if (/^[ \t]*$/.test(line)) return { kind: 'blank' };
  let m = /^(#{1,3}) (.*)$/.exec(line);
  if (m) return { kind: `h${m[1].length}`, text: trim(m[2]) };
  m = /^> (.*)$/.exec(line);
  if (m) return { kind: 'blockquote', text: trim(m[1]) };
  m = /^- (.*)$/.exec(line);
  if (m) return { kind: 'ul', text: trim(m[1]) };
  m = /^[0-9]+\. (.*)$/.exec(line);
  if (m) return { kind: 'ol', text: trim(m[1]) };
  return { kind: 'p', text: trim(line) };
}

/** Returns the language word ('' if none) when `line` is an opening fence, else null. */
function openingFence(line) {
  if (!line.startsWith('```')) return null;
  const info = trim(line.slice(3));
  return /^[^ \t`]*$/.test(info) ? info : null;
}

function isClosingFence(line) {
  return line.replace(/[ \t]+$/, '') === '```';
}

function renderBlock({ kind, items, lang }) {
  if (kind === 'code') {
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return `<pre><code${cls}>${escapeHtml(items.join('\n'))}</code></pre>`;
  }
  if (kind === 'blockquote') {
    return `<blockquote><p>${renderInline(items.filter((item) => item !== '').join(' '))}</p></blockquote>`;
  }
  if (kind === 'p') return `<p>${renderInline(items.join(' '))}</p>`;
  if (kind === 'ul' || kind === 'ol') {
    const lis = items.map((item) => `<li>${renderInline(item)}</li>`);
    return [`<${kind}>`, ...lis, `</${kind}>`].join('\n');
  }
  return `<${kind}>${renderInline(items[0])}</${kind}>`;
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const blocks = [];
  let current = null;
  const lines = markdown.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  for (let i = 0; i < lines.length; i++) {
    const lang = openingFence(lines[i]);
    if (lang !== null) {
      const items = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (isClosingFence(lines[i])) {
          closed = true;
          break;
        }
        items.push(lines[i]);
      }
      // An unclosed block runs to the end of input, minus trailing blank lines.
      if (!closed) {
        while (items.length && /^[ \t]*$/.test(items[items.length - 1])) items.pop();
      }
      blocks.push({ kind: 'code', items, lang });
      current = null;
      continue;
    }
    const { kind, text } = classify(lines[i]);
    const continues =
      current && current.kind === kind && (kind === 'p' || kind === 'ul' || kind === 'ol' || kind === 'blockquote');
    if (continues) {
      current.items.push(text);
    } else if (kind === 'blank') {
      current = null;
    } else {
      current = { kind, items: [text] };
      blocks.push(current);
    }
  }
  return blocks.map(renderBlock).join('\n');
}
