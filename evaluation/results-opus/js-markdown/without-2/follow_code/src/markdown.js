const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function trim(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '');
}

const ALLOWED_URL = /^(https?:\/\/|mailto:)/;

// Inline levels: what may appear inside a given piece of text.
const FULL = 0; // code, bold, italic, links
const NO_BOLD = 1; // code, italic, links (inside bold)
const CODE_LINKS = 2; // code, links (inside italic)

/**
 * Finds the first occurrence of `marker` at or after `from`, skipping over
 * code spans (a backtick together with the next backtick after it).
 * Returns -1 if not found.
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

function renderInline(text, level = FULL) {
  let out = '';
  let literal = '';
  const flush = () => {
    out += escapeHtml(literal);
    literal = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '*' && level === FULL && text[i + 1] === '*') {
      const close = findCloser(text, i + 2, '**');
      if (close !== -1) {
        flush();
        out += `<strong>${renderInline(text.slice(i + 2, close), NO_BOLD)}</strong>`;
        i = close + 2;
      } else {
        literal += '**';
        i += 2;
      }
      continue;
    }

    if (ch === '*' && level !== CODE_LINKS) {
      const close = findCloser(text, i + 1, '*');
      if (close !== -1) {
        flush();
        out += `<em>${renderInline(text.slice(i + 1, close), CODE_LINKS)}</em>`;
        i = close + 1;
        continue;
      }
    }

    if (ch === '[') {
      const bracket = text.indexOf(']', i + 1);
      if (bracket !== -1 && text[bracket + 1] === '(') {
        const paren = text.indexOf(')', bracket + 2);
        if (paren !== -1) {
          flush();
          const label = escapeHtml(text.slice(i + 1, bracket));
          const url = text.slice(bracket + 2, paren);
          out += ALLOWED_URL.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
          i = paren + 1;
          continue;
        }
      }
    }

    literal += ch;
    i++;
  }
  flush();
  return out;
}

function classify(line) {
  if (/^[ \t]*$/.test(line)) return { kind: 'blank' };
  if (line.startsWith('```')) {
    const lang = trim(line.slice(3));
    if (lang === '' || /^[^ \t`]+$/.test(lang)) return { kind: 'fence', lang };
  }
  if (line.startsWith('> ')) return { kind: 'blockquote', text: trim(line.slice(2)) };
  let m = /^(#{1,3}) (.*)$/s.exec(line);
  if (m) return { kind: 'heading', level: m[1].length, text: trim(m[2]) };
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  m = /^[0-9]+\. (.*)$/s.exec(line);
  if (m) return { kind: 'ol', text: trim(m[1]) };
  return { kind: 'text', text: trim(line) };
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = null; // { kind, items: string[] }

  const finish = () => {
    if (!current) return;
    if (current.kind === 'text') {
      blocks.push(`<p>${renderInline(current.items.join(' '))}</p>`);
    } else if (current.kind === 'blockquote') {
      const text = current.items.filter((item) => item !== '').join(' ');
      blocks.push(`<blockquote><p>${renderInline(text)}</p></blockquote>`);
    } else {
      const items = current.items.map((item) => `<li>${renderInline(item)}</li>`);
      blocks.push([`<${current.kind}>`, ...items, `</${current.kind}>`].join('\n'));
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const info = classify(lines[i]);
    if (info.kind === 'fence') {
      finish();
      let end = i + 1;
      while (end < lines.length && lines[end].replace(/[ \t]+$/, '') !== '```') end++;
      const content = lines.slice(i + 1, end);
      if (end === lines.length) {
        // Unclosed fence: trailing blank lines at the end of input are not content.
        while (content.length && classify(content[content.length - 1]).kind === 'blank') content.pop();
      }
      const cls = info.lang ? ` class="language-${escapeHtml(info.lang)}"` : '';
      blocks.push(`<pre><code${cls}>${escapeHtml(content.join('\n'))}</code></pre>`);
      i = end;
    } else if (info.kind === 'blank') {
      finish();
    } else if (info.kind === 'heading') {
      finish();
      blocks.push(`<h${info.level}>${renderInline(info.text)}</h${info.level}>`);
    } else {
      if (current && current.kind !== info.kind) finish();
      if (!current) current = { kind: info.kind, items: [] };
      current.items.push(info.text);
    }
  }
  finish();

  return blocks.join('\n');
}
