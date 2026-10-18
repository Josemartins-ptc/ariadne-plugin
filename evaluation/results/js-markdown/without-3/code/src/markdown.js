const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

// Find first occurrence of `marker` at or after `from`, skipping code spans.
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
    i++;
  }
  return -1;
}

// mode: 0 = full, 1 = no bold, 2 = only code and links
function inline(text, mode = 0) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        out += `<code>${esc(text.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    } else if (c === '*') {
      if (mode === 0 && text[i + 1] === '*') {
        const end = findCloser(text, i + 2, '**');
        if (end !== -1) {
          out += `<strong>${inline(text.slice(i + 2, end), 1)}</strong>`;
          i = end + 2;
        } else {
          out += '**';
          i += 2;
        }
        continue;
      }
      if (mode < 2 && !(mode === 0 && text[i + 1] === '*')) {
        const end = findCloser(text, i + 1, '*');
        if (end !== -1) {
          out += `<em>${inline(text.slice(i + 1, end), 2)}</em>`;
          i = end + 1;
          continue;
        }
      }
    } else if (c === '[') {
      const close = text.indexOf(']', i + 1);
      if (close !== -1 && text[close + 1] === '(') {
        const paren = text.indexOf(')', close + 2);
        if (paren !== -1) {
          const label = esc(text.slice(i + 1, close));
          const url = text.slice(close + 2, paren);
          out += /^(https?:\/\/|mailto:)/.test(url)
            ? `<a href="${esc(url)}">${label}</a>`
            : label;
          i = paren + 1;
          continue;
        }
      }
    }
    out += esc(c);
    i++;
  }
  return out;
}

function classify(line) {
  let m = /^(#{1,3}) (.*)$/.exec(line);
  if (m) return { kind: 'h' + m[1].length, text: trim(m[2]) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  m = /^[0-9]+\. (.*)$/.exec(line);
  if (m) return { kind: 'ol', text: trim(m[1]) };
  return { kind: 'p', text: trim(line) };
}

export function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let cur = null; // { kind, items }
  const flush = () => {
    if (!cur) return;
    if (cur.kind === 'p') {
      blocks.push(`<p>${inline(cur.items.join(' '))}</p>`);
    } else {
      const lis = cur.items.map((t) => `<li>${inline(t)}</li>`);
      blocks.push([`<${cur.kind}>`, ...lis, `</${cur.kind}>`].join('\n'));
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
    } else {
      if (!cur || cur.kind !== kind) {
        flush();
        cur = { kind, items: [] };
      }
      cur.items.push(text);
    }
  }
  flush();
  return blocks.join('\n');
}
