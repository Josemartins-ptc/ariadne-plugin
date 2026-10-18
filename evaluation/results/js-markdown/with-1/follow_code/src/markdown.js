const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Finds the first `delim` at or after `from`, skipping over code spans. */
function findCloser(text, delim, from) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith(delim, i)) return i;
    i++;
  }
  return -1;
}

function tryLink(text, i) {
  const close = text.indexOf(']', i + 1);
  if (close === -1 || text[close + 1] !== '(') return null;
  const end = text.indexOf(')', close + 2);
  if (end === -1) return null;
  const label = escapeHtml(text.slice(i + 1, close));
  const url = text.slice(close + 2, end);
  const ok = /^(https?:\/\/|mailto:)/.test(url);
  return { html: ok ? `<a href="${escapeHtml(url)}">${label}</a>` : label, next: end + 1 };
}

function tryCode(text, i) {
  const end = text.indexOf('`', i + 1);
  if (end === -1) return null;
  return { html: `<code>${escapeHtml(text.slice(i + 1, end))}</code>`, next: end + 1 };
}

function tryBold(text, i) {
  const end = findCloser(text, '**', i + 2);
  if (end === -1) return { html: '**', next: i + 2 };
  return { html: `<strong>${inline(text.slice(i + 2, end), true, false)}</strong>`, next: end + 2 };
}

function tryItalic(text, i) {
  const end = findCloser(text, '*', i + 1);
  if (end === -1) return { html: '*', next: i + 1 };
  return { html: `<em>${inline(text.slice(i + 1, end), false, false)}</em>`, next: end + 1 };
}

function matchAt(text, i, allowEmphasis, allowBold) {
  const c = text[i];
  if (c === '`') return tryCode(text, i);
  if (c === '[') return tryLink(text, i);
  if (c !== '*') return null;
  if (allowBold && text[i + 1] === '*') return tryBold(text, i);
  return allowEmphasis ? tryItalic(text, i) : null;
}

function inline(text, allowEmphasis = true, allowBold = true) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const m = matchAt(text, i, allowEmphasis, allowBold);
    if (m) {
      out += m.html;
      i = m.next;
    } else {
      out += escapeHtml(text[i]);
      i++;
    }
  }
  return out;
}

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function classify(line) {
  let m = /^(#{1,3}) (.*)$/.exec(line);
  if (m) return { kind: 'h' + m[1].length, text: trim(m[2]) };
  if (line.startsWith('> ')) return { kind: 'q', text: trim(line.slice(2)) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  m = /^[0-9]+\. (.*)$/.exec(line);
  if (m) return { kind: 'ol', text: trim(m[1]) };
  return { kind: 'p', text: trim(line) };
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const blocks = [];
  let cur = null; // { kind, items }
  const flush = () => {
    if (!cur) return;
    if (cur.kind === 'p') {
      blocks.push(`<p>${inline(cur.items.join(' '))}</p>`);
    } else if (cur.kind === 'q') {
      const text = cur.items.filter((t) => t !== '').join(' ');
      blocks.push(`<blockquote><p>${inline(text)}</p></blockquote>`);
    } else {
      const items = cur.items.map((t) => `<li>${inline(t)}</li>`);
      blocks.push([`<${cur.kind}>`, ...items, `</${cur.kind}>`].join('\n'));
    }
    cur = null;
  };

  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.startsWith('```') ? /^[^ \t`]*$/.exec(trim(line.slice(3))) : null;
    if (fence) {
      flush();
      let j = i + 1;
      while (j < lines.length && lines[j].replace(/[ \t]+$/, '') !== '```') j++;
      let end = j;
      if (j >= lines.length) {
        while (end > i + 1 && trim(lines[end - 1]) === '') end--;
      }
      const code = escapeHtml(lines.slice(i + 1, end).join('\n'));
      const attr = fence[0] ? ` class="language-${escapeHtml(fence[0])}"` : '';
      blocks.push(`<pre><code${attr}>${code}</code></pre>`);
      i = j;
      continue;
    }
    if (trim(line) === '') {
      flush();
      continue;
    }
    const { kind, text } = classify(line);
    if (kind[0] === 'h') {
      flush();
      blocks.push(`<${kind}>${inline(text)}</${kind}>`);
    } else if (cur && cur.kind === kind) {
      cur.items.push(text);
    } else {
      flush();
      cur = { kind, items: [text] };
    }
  }
  flush();
  return blocks.join('\n');
}
