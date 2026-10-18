const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

// Finds the first `closer` at or after `from`, skipping code spans.
function findCloser(text, from, closer) {
  let i = from;
  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith(closer, i)) return i;
    i++;
  }
  return -1;
}

function inline(text, allowBold = true, allowItalic = true) {
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
    } else if (c === '*' && text[i + 1] === '*' && allowBold) {
      const end = findCloser(text, i + 2, '**');
      if (end !== -1) {
        out += `<strong>${inline(text.slice(i + 2, end), true, true)}</strong>`;
        i = end + 2;
        continue;
      }
      out += '**';
      i += 2;
      continue;
    } else if (c === '*' && allowItalic) {
      const end = findCloser(text, i + 1, '*');
      if (end !== -1) {
        out += `<em>${inline(text.slice(i + 1, end), false, false)}</em>`;
        i = end + 1;
        continue;
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
  let m;
  if ((m = /^(#{1,3}) (.*)$/.exec(line))) return { kind: 'h' + m[1].length, text: trim(m[2]) };
  if (line.startsWith('> ')) return { kind: 'q', text: trim(line.slice(2)) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  if ((m = /^[0-9]+\. (.*)$/.exec(line))) return { kind: 'ol', text: trim(m[1]) };
  return { kind: 'p', text: trim(line) };
}

export function render(markdown) {
  const lines = markdown.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const blocks = [];
  let cur = null; // { kind, items }
  const flush = () => {
    if (!cur) return;
    if (cur.kind === 'p') blocks.push(`<p>${inline(cur.items.join(' '))}</p>`);
    else if (cur.kind === 'q') {
      const text = cur.items.filter((t) => t !== '').join(' ');
      blocks.push(`<blockquote><p>${inline(text)}</p></blockquote>`);
    } else {
      const lis = cur.items.map((t) => `<li>${inline(t)}</li>`).join('\n');
      blocks.push(`<${cur.kind}>\n${lis}\n</${cur.kind}>`);
    }
    cur = null;
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const fence = line.startsWith('```') ? trim(line.slice(3)) : null;
    if (fence !== null && /^[^ \t`]*$/.test(fence)) {
      flush();
      let end = n + 1;
      while (end < lines.length && lines[end].replace(/[ \t]+$/, '') !== '```') end++;
      const content = lines.slice(n + 1, end);
      if (end >= lines.length) {
        while (content.length && /^[ \t]*$/.test(content[content.length - 1])) content.pop();
      }
      const cls = fence ? ` class="language-${esc(fence)}"` : '';
      blocks.push(`<pre><code${cls}>${esc(content.join('\n'))}</code></pre>`);
      n = end;
      continue;
    }
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
