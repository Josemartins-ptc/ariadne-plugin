const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

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

function inline(text, mode = 'full') {
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
    } else if (c === '*' && mode === 'full' && text[i + 1] === '*') {
      const end = findCloser(text, i + 2, '**');
      if (end !== -1) {
        out += `<strong>${inline(text.slice(i + 2, end), 'full')}</strong>`;
        i = end + 2;
        continue;
      }
      out += '**';
      i += 2;
      continue;
    } else if (c === '*' && (mode === 'full' || mode === 'bold')) {
      const end = findCloser(text, i + 1, '*');
      if (end !== -1) {
        out += `<em>${inline(text.slice(i + 1, end), 'em')}</em>`;
        i = end + 1;
        continue;
      }
    } else if (c === '[') {
      const rb = text.indexOf(']', i + 1);
      if (rb !== -1 && text[rb + 1] === '(') {
        const rp = text.indexOf(')', rb + 2);
        if (rp !== -1) {
          const label = esc(text.slice(i + 1, rb));
          const url = text.slice(rb + 2, rp);
          if (/^(https?:\/\/|mailto:)/.test(url)) {
            out += `<a href="${esc(url)}">${label}</a>`;
          } else {
            out += label;
          }
          i = rp + 1;
          continue;
        }
      }
    }
    out += esc(c);
    i++;
  }
  return out;
}

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');

export function render(markdown) {
  const lines = markdown.split('\n').map((l) => l.replace(/\r$/, ''));
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
      const tag = cur.kind;
      blocks.push(
        [`<${tag}>`, ...cur.items.map((t) => `<li>${inline(t)}</li>`), `</${tag}>`].join('\n'),
      );
    }
    cur = null;
  };
  const add = (kind, item) => {
    if (!cur || cur.kind !== kind) {
      flush();
      cur = { kind, items: [] };
    }
    cur.items.push(item);
  };

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    let f;
    if (line.startsWith('```') && (f = /^[^ \t`]*$/.exec(trim(line.slice(3))))) {
      flush();
      const content = [];
      let closed = false;
      for (n++; n < lines.length; n++) {
        if (lines[n].replace(/[ \t]+$/, '') === '```') {
          closed = true;
          break;
        }
        content.push(lines[n]);
      }
      if (!closed) {
        while (content.length && /^[ \t]*$/.test(content[content.length - 1])) content.pop();
      }
      const cls = f[0] ? ` class="language-${esc(f[0])}"` : '';
      blocks.push(`<pre><code${cls}>${esc(content.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^[ \t]*$/.test(line)) {
      flush();
      continue;
    }
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(line))) {
      flush();
      blocks.push(`<h${m[1].length}>${inline(trim(m[2]))}</h${m[1].length}>`);
    } else if (line.startsWith('> ')) {
      add('q', trim(line.slice(2)));
    } else if (line.startsWith('- ')) {
      add('ul', trim(line.slice(2)));
    } else if ((m = /^[0-9]+\. (.*)$/.exec(line))) {
      add('ol', trim(m[1]));
    } else {
      add('p', trim(line));
    }
  }
  flush();
  return blocks.join('\n');
}
