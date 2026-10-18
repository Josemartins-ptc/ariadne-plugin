const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function trimSpaces(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '');
}

function isBlank(line) {
  return /^[ \t]*$/.test(line);
}

function classify(line) {
  if (isBlank(line)) return { kind: 'blank' };
  let m = /^(#{1,3}) (.*)$/.exec(line);
  if (m) return { kind: 'heading', level: m[1].length, text: trimSpaces(m[2]) };
  m = /^```(.*)$/.exec(line);
  if (m && /^[^ \t`]*$/.test(trimSpaces(m[1]))) return { kind: 'fence', lang: trimSpaces(m[1]) };
  m = /^> (.*)$/.exec(line);
  if (m) return { kind: 'quote', text: trimSpaces(m[1]) };
  m = /^- (.*)$/.exec(line);
  if (m) return { kind: 'ul', text: trimSpaces(m[1]) };
  m = /^[0-9]+\. (.*)$/.exec(line);
  if (m) return { kind: 'ol', text: trimSpaces(m[1]) };
  return { kind: 'text', text: trimSpaces(line) };
}

// Index just past the code span starting at `i`, or -1 if the backtick is unmatched.
function codeSpanEnd(s, i) {
  const j = s.indexOf('`', i + 1);
  return j === -1 ? -1 : j + 1;
}

function findCloser(s, from, marker) {
  let k = from;
  while (k < s.length) {
    if (s[k] === '`') {
      const end = codeSpanEnd(s, k);
      if (end !== -1) {
        k = end;
        continue;
      }
    }
    if (s.startsWith(marker, k)) return k;
    k++;
  }
  return -1;
}

const ALLOWED_SCHEMES = ['http://', 'https://', 'mailto:'];

function tryLink(s, i) {
  const close = s.indexOf(']', i + 1);
  if (close === -1 || s[close + 1] !== '(') return null;
  const end = s.indexOf(')', close + 2);
  if (end === -1) return null;
  const text = escapeHtml(s.slice(i + 1, close));
  const url = s.slice(close + 2, end);
  const html = ALLOWED_SCHEMES.some((p) => url.startsWith(p))
    ? `<a href="${escapeHtml(url)}">${text}</a>`
    : text;
  return { html, next: end + 1 };
}

function renderInline(s, allowBold = true, allowItalic = true) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '`') {
      const end = codeSpanEnd(s, i);
      if (end !== -1) {
        out += `<code>${escapeHtml(s.slice(i + 1, end - 1))}</code>`;
        i = end;
        continue;
      }
    } else if (c === '*' && s[i + 1] === '*' && allowBold) {
      const k = findCloser(s, i + 2, '**');
      if (k !== -1) {
        out += `<strong>${renderInline(s.slice(i + 2, k), false, true)}</strong>`;
        i = k + 2;
      } else {
        out += '**';
        i += 2;
      }
      continue;
    } else if (c === '*' && allowItalic) {
      const k = findCloser(s, i + 1, '*');
      if (k !== -1) {
        out += `<em>${renderInline(s.slice(i + 1, k), false, false)}</em>`;
        i = k + 1;
        continue;
      }
    } else if (c === '[') {
      const link = tryLink(s, i);
      if (link) {
        out += link.html;
        i = link.next;
        continue;
      }
    }
    out += escapeHtml(c);
    i++;
  }
  return out;
}

function renderList(tag, items) {
  return [`<${tag}>`, ...items.map((t) => `<li>${renderInline(t)}</li>`), `</${tag}>`].join('\n');
}

function isClosingFence(raw) {
  return raw.replace(/[ \t]+$/, '') === '```';
}

// Returns the rendered code block and the index of the first line after it.
function renderFence(rawLines, start, lang) {
  let end = start + 1;
  while (end < rawLines.length && !isClosingFence(rawLines[end])) end++;
  const closed = end < rawLines.length;
  let content = rawLines.slice(start + 1, end);
  if (!closed) {
    while (content.length > 0 && isBlank(content[content.length - 1])) content.pop();
  }
  const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
  const html = `<pre><code${cls}>${escapeHtml(content.join('\n'))}</code></pre>`;
  return { html, next: closed ? end + 1 : end };
}

function renderRun(kind, texts) {
  if (kind === 'text') return `<p>${renderInline(texts.join(' '))}</p>`;
  if (kind === 'quote') {
    return `<blockquote><p>${renderInline(texts.filter((t) => t !== '').join(' '))}</p></blockquote>`;
  }
  return renderList(kind, texts);
}

export function render(markdown) {
  const rawLines = markdown.split(/\r?\n/);
  const lines = rawLines.map(classify);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === 'blank') {
      i++;
    } else if (line.kind === 'heading') {
      blocks.push(`<h${line.level}>${renderInline(line.text)}</h${line.level}>`);
      i++;
    } else if (line.kind === 'fence') {
      const fence = renderFence(rawLines, i, line.lang);
      blocks.push(fence.html);
      i = fence.next;
    } else {
      const run = [];
      while (i < lines.length && lines[i].kind === line.kind) {
        run.push(lines[i].text);
        i++;
      }
      blocks.push(renderRun(line.kind, run));
    }
  }
  return blocks.join('\n');
}
