const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function trim(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '');
}

function isBlank(line) {
  return /^[ \t]*$/.test(line);
}

/**
 * Finds the first occurrence of `marker` at or after `from`, skipping code spans.
 * Returns -1 if there is none.
 */
function findCloser(text, marker, from) {
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

const SAFE_URL = /^(https?:\/\/|mailto:)/;

/**
 * Renders inline formatting. `level` controls which rules apply:
 * 'all' (code, bold, italic, link), 'strong' (code, italic, link), 'em' (code, link).
 */
function renderInline(text, level = 'all') {
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

    if (level === 'all' && text.startsWith('**', i)) {
      const end = findCloser(text, '**', i + 2);
      flush();
      if (end !== -1) {
        out += `<strong>${renderInline(text.slice(i + 2, end), 'strong')}</strong>`;
        i = end + 2;
      } else {
        out += escapeHtml('**');
        i += 2;
      }
      continue;
    }

    if (level !== 'em' && ch === '*') {
      const end = findCloser(text, '*', i + 1);
      if (end !== -1) {
        flush();
        out += `<em>${renderInline(text.slice(i + 1, end), 'em')}</em>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '[') {
      const close = text.indexOf(']', i + 1);
      if (close !== -1 && text[close + 1] === '(') {
        const paren = text.indexOf(')', close + 2);
        if (paren !== -1) {
          flush();
          const label = escapeHtml(text.slice(i + 1, close));
          const url = text.slice(close + 2, paren);
          out += SAFE_URL.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
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
  let m;
  if ((m = /^(#{1,3}) ([\s\S]*)$/.exec(line))) {
    return { kind: 'heading', level: m[1].length, text: trim(m[2]) };
  }
  if (line.startsWith('- ')) return { kind: 'ul', text: trim(line.slice(2)) };
  if ((m = /^[0-9]+\. ([\s\S]*)$/.exec(line))) return { kind: 'ol', text: trim(m[1]) };
  if (line.startsWith('> ')) return { kind: 'quote', text: trim(line.slice(2)) };
  return { kind: 'text', text: trim(line) };
}

/**
 * Returns the language word of an opening code fence ('' when there is none),
 * or null if the line is not an opening fence.
 */
function openingFence(line) {
  if (!line.startsWith('```')) return null;
  const info = trim(line.slice(3));
  return /^[^ \t`]*$/.test(info) ? info : null;
}

function isClosingFence(line) {
  return line.replace(/[ \t]+$/, '') === '```';
}

function renderBlock(block) {
  switch (block.kind) {
    case 'heading':
      return `<h${block.level}>${renderInline(block.lines[0])}</h${block.level}>`;
    case 'ul':
    case 'ol':
      return [
        `<${block.kind}>`,
        ...block.lines.map((item) => `<li>${renderInline(item)}</li>`),
        `</${block.kind}>`,
      ].join('\n');
    case 'quote':
      return `<blockquote><p>${renderInline(block.lines.filter((l) => l !== '').join(' '))}</p></blockquote>`;
    case 'code': {
      const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
      return `<pre><code${cls}>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
    }
    default:
      return `<p>${renderInline(block.lines.join(' '))}</p>`;
  }
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const blocks = [];
  let current = null;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lang = openingFence(line);
    if (lang !== null) {
      const code = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (isClosingFence(lines[i])) {
          closed = true;
          break;
        }
        code.push(lines[i]);
      }
      if (!closed) {
        while (code.length && isBlank(code[code.length - 1])) code.pop();
      }
      blocks.push({ kind: 'code', lang, lines: code });
      current = null;
      continue;
    }
    if (isBlank(line)) {
      current = null;
      continue;
    }
    const { kind, level, text } = classify(line);
    if (current && current.kind === kind && kind !== 'heading') {
      current.lines.push(text);
    } else {
      current = { kind, level, lines: [text] };
      blocks.push(current);
    }
  }
  return blocks.map(renderBlock).join('\n');
}
