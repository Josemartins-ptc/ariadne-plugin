const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Finds the first `marker` at or after `from`, skipping over code spans.
function findCloser(text, marker, from) {
  let j = from;
  while (j < text.length) {
    if (text[j] === '`') {
      const k = text.indexOf('`', j + 1);
      j = k === -1 ? j + 1 : k + 1;
    } else if (text.startsWith(marker, j)) {
      return j;
    } else {
      j++;
    }
  }
  return -1;
}

// Each rule returns [html, nextIndex], or null when it does not apply at i.
function codeRule(text, i) {
  const k = text.indexOf('`', i + 1);
  if (k === -1) return null;
  return [`<code>${escapeHtml(text.slice(i + 1, k))}</code>`, k + 1];
}

function boldRule(text, i) {
  const k = findCloser(text, '**', i + 2);
  if (k === -1) return ['**', i + 2];
  return [`<strong>${inline(text.slice(i + 2, k), false, true)}</strong>`, k + 2];
}

function italicRule(text, i) {
  const k = findCloser(text, '*', i + 1);
  if (k === -1) return null;
  return [`<em>${inline(text.slice(i + 1, k), false, false)}</em>`, k + 1];
}

function linkRule(text, i) {
  const close = text.indexOf(']', i + 1);
  if (close === -1 || text[close + 1] !== '(') return null;
  const end = text.indexOf(')', close + 2);
  if (end === -1) return null;
  const label = escapeHtml(text.slice(i + 1, close));
  const url = text.slice(close + 2, end);
  const allowed = /^(https?:\/\/|mailto:)/.test(url);
  return [allowed ? `<a href="${escapeHtml(url)}">${label}</a>` : label, end + 1];
}

function applyRule(text, i, bold, italic) {
  const c = text[i];
  if (c === '`') return codeRule(text, i);
  if (c === '[') return linkRule(text, i);
  if (c !== '*') return null;
  if (bold && text.startsWith('**', i)) return boldRule(text, i);
  return italic ? italicRule(text, i) : null;
}

function inline(text, bold = true, italic = true) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const hit = applyRule(text, i, bold, italic);
    if (hit) {
      out += hit[0];
      i = hit[1];
    } else {
      out += escapeHtml(text[i]);
      i++;
    }
  }
  return out;
}

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

function classify(line) {
  let m;
  if ((m = /^(#{1,3}) (.*)$/.exec(line))) return { kind: 'h' + m[1].length, text: trim(m[2]) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  if ((m = /^\d+\. (.*)$/.exec(line))) return { kind: 'ol', text: trim(m[1]) };
  return { kind: 'p', text: trim(line) };
}

function renderBlock(block) {
  if (block.kind === 'p') return `<p>${inline(block.items.join(' '))}</p>`;
  const li = block.items.map((t) => `<li>${inline(t)}</li>`);
  return [`<${block.kind}>`, ...li, `</${block.kind}>`].join('\n');
}

export function render(markdown) {
  const lines = markdown.split('\n').map((l) => l.replace(/\r$/, ''));
  const blocks = [];
  let cur = null; // { kind, items }
  const flush = () => {
    if (cur) blocks.push(renderBlock(cur));
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
