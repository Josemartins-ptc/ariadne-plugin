const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escape(text) {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Index of the first `marker` at or after `from`, skipping over code spans.
function findCloser(text, marker, from) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    } else if (text.startsWith(marker, i)) {
      return i;
    }
    i++;
  }
  return -1;
}

function inline(text, allowEmphasis = true) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const m = matchAt(text, i, allowEmphasis);
    out += m ? m.html : escape(text[i]);
    i = m ? m.next : i + 1;
  }
  return out;
}

// Each rule returns { html, next } when it matches at position i, else null.
function codeRule(text, i) {
  const end = text.indexOf('`', i + 1);
  if (end === -1) return null;
  return { html: `<code>${escape(text.slice(i + 1, end))}</code>`, next: end + 1 };
}

function boldRule(text, i) {
  const end = findCloser(text, '**', i + 2);
  if (end === -1) return { html: '**', next: i + 2 };
  return { html: `<strong>${inline(text.slice(i + 2, end))}</strong>`, next: end + 2 };
}

function italicRule(text, i) {
  const end = findCloser(text, '*', i + 1);
  if (end === -1) return null;
  return { html: `<em>${inline(text.slice(i + 1, end), false)}</em>`, next: end + 1 };
}

function linkRule(text, i) {
  const close = text.indexOf(']', i + 1);
  if (close === -1 || text[close + 1] !== '(') return null;
  const urlEnd = text.indexOf(')', close + 2);
  if (urlEnd === -1) return null;
  const label = escape(text.slice(i + 1, close));
  const url = text.slice(close + 2, urlEnd);
  const allowed = /^(https?:\/\/|mailto:)/.test(url);
  const html = allowed ? `<a href="${escape(url)}">${label}</a>` : label;
  return { html, next: urlEnd + 1 };
}

function matchAt(text, i, allowEmphasis) {
  const ch = text[i];
  if (ch === '`') return codeRule(text, i);
  if (ch === '[') return linkRule(text, i);
  if (ch !== '*' || !allowEmphasis) return null;
  return text.startsWith('**', i) ? boldRule(text, i) : italicRule(text, i);
}

function classify(line) {
  let m = /^(#{1,3}) (.*)$/.exec(line);
  if (m) return { kind: `h${m[1].length}`, text: m[2].trim() };
  if (line.startsWith('- ')) return { kind: 'ul', text: line.slice(2).trim() };
  m = /^\d+\. (.*)$/.exec(line);
  if (m) return { kind: 'ol', text: m[1].trim() };
  return { kind: 'p', text: line.trim() };
}

export function render(markdown) {
  const lines = markdown.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const blocks = [];
  let cur = null; // { kind, items }
  const flush = () => {
    if (!cur) return;
    if (cur.kind === 'p') {
      blocks.push(`<p>${inline(cur.items.join(' '))}</p>`);
    } else {
      const items = cur.items.map((t) => `<li>${inline(t)}</li>`);
      blocks.push([`<${cur.kind}>`, ...items, `</${cur.kind}>`].join('\n'));
    }
    cur = null;
  };
  for (const line of lines) {
    if (/^[ \t]*$/.test(line)) {
      flush();
      continue;
    }
    const { kind, text } = classify(line);
    if (kind[0] === 'h') {
      flush();
      blocks.push(`<${kind}>${inline(text)}</${kind}>`);
      continue;
    }
    if (!cur || cur.kind !== kind) {
      flush();
      cur = { kind, items: [] };
    }
    cur.items.push(text);
  }
  flush();
  return blocks.join('\n');
}
