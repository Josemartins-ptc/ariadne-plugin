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
 * Finds the first occurrence of `marker` at or after `start`, skipping over
 * code spans (a backtick together with the next backtick after it).
 * @returns {number} index of the marker, or -1
 */
function findCloser(text, start, marker) {
  let i = start;
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

const ALLOWED_SCHEMES = ['http://', 'https://', 'mailto:'];

/**
 * Renders inline formatting.
 * @param {string} text
 * @param {{bold: boolean, italic: boolean}} allow which emphasis rules apply
 */
function renderInline(text, allow = { bold: true, italic: true }) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '*' && text[i + 1] === '*' && allow.bold) {
      const end = findCloser(text, i + 2, '**');
      if (end !== -1) {
        const inner = renderInline(text.slice(i + 2, end), { bold: false, italic: true });
        out += `<strong>${inner}</strong>`;
        i = end + 2;
      } else {
        out += '**';
        i += 2;
      }
      continue;
    }

    if (ch === '*' && allow.italic) {
      const end = findCloser(text, i + 1, '*');
      if (end !== -1) {
        const inner = renderInline(text.slice(i + 1, end), { bold: false, italic: false });
        out += `<em>${inner}</em>`;
        i = end + 1;
        continue;
      }
    }

    if (ch === '[') {
      const close = text.indexOf(']', i + 1);
      if (close !== -1 && text[close + 1] === '(') {
        const paren = text.indexOf(')', close + 2);
        if (paren !== -1) {
          const label = escapeHtml(text.slice(i + 1, close));
          const url = text.slice(close + 2, paren);
          if (ALLOWED_SCHEMES.some((scheme) => url.startsWith(scheme))) {
            out += `<a href="${escapeHtml(url)}">${label}</a>`;
          } else {
            out += label;
          }
          i = paren + 1;
          continue;
        }
      }
    }

    out += escapeHtml(ch);
    i++;
  }
  return out;
}

function classify(line) {
  let m = /^(#{1,3}) ([\s\S]*)$/.exec(line);
  if (m) return { kind: 'heading', level: m[1].length, text: trim(m[2]) };
  m = /^- ([\s\S]*)$/.exec(line);
  if (m) return { kind: 'ul', text: trim(m[1]) };
  m = /^[0-9]+\. ([\s\S]*)$/.exec(line);
  if (m) return { kind: 'ol', text: trim(m[1]) };
  m = /^> ([\s\S]*)$/.exec(line);
  if (m) return { kind: 'quote', text: trim(m[1]) };
  return { kind: 'text', text: trim(line) };
}

/**
 * Returns the language word of an opening code fence ('' when there is none),
 * or null when the line is not an opening fence.
 */
function openingFence(line) {
  if (!line.startsWith('```')) return null;
  const rest = trim(line.slice(3));
  return /^[^ \t`]*$/.test(rest) ? rest : null;
}

function isClosingFence(line) {
  return line.replace(/[ \t]+$/, '') === '```';
}

function renderBlock(block) {
  switch (block.kind) {
    case 'heading':
      return `<h${block.level}>${renderInline(block.items[0])}</h${block.level}>`;
    case 'ul':
    case 'ol': {
      const items = block.items.map((item) => `<li>${renderInline(item)}</li>`);
      return [`<${block.kind}>`, ...items, `</${block.kind}>`].join('\n');
    }
    case 'quote': {
      const text = block.items.filter((item) => item !== '').join(' ');
      return `<blockquote><p>${renderInline(text)}</p></blockquote>`;
    }
    case 'code': {
      const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
      return `<pre><code${cls}>${escapeHtml(block.items.join('\n'))}</code></pre>`;
    }
    default:
      return `<p>${renderInline(block.items.join(' '))}</p>`;
  }
}

/**
 * Renders a small subset of Markdown to HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function render(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lang = openingFence(line);
    if (lang !== null) {
      const items = [];
      i++;
      while (i < lines.length && !isClosingFence(lines[i])) {
        items.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        // Unclosed fence: blank lines at the end of the input are not content.
        while (items.length > 0 && isBlank(items[items.length - 1])) items.pop();
      }
      blocks.push({ kind: 'code', lang, items });
      current = null;
      continue;
    }
    if (isBlank(line)) {
      current = null;
      continue;
    }
    const info = classify(line);
    if (info.kind === 'heading') {
      blocks.push({ kind: 'heading', level: info.level, items: [info.text] });
      current = null;
    } else if (current && current.kind === info.kind) {
      current.items.push(info.text);
    } else {
      current = { kind: info.kind, items: [info.text] };
      blocks.push(current);
    }
  }

  return blocks.map(renderBlock).join('\n');
}
