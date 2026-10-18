Implement a small Markdown-to-HTML renderer in `src/markdown.js`. It must export one function:

```js
export function render(markdown) // markdown: string -> string of HTML
```

Use only the JavaScript standard library (ES modules, no npm packages). The exact output text matters, so follow the rules below precisely.

## Lines

- Split the input into lines on `"\n"`; a `"\r\n"` line ending counts as `"\n"`.
- A line is **blank** if it is empty or contains only spaces and tabs.
- "Trimmed" below always means: leading and trailing spaces and tabs removed.
- Block markers must start at the very first character of the line. A line that begins with a space or tab is never a heading or list item.

## Line kinds

Each non-blank line is classified on its own, in this order:

1. **Heading**: the line starts with 1, 2 or 3 `#` characters followed by a space (`# `, `## `, `### `). The heading text is the rest of the line after that space, trimmed. `#### x` and `#x` are not headings.
2. **Unordered item**: the line starts with `- ` (dash, space). The item text is the rest of the line, trimmed.
3. **Ordered item**: the line starts with one or more ASCII digits, then `.`, then a space (e.g. `1. `, `42. `). The item text is the rest of the line, trimmed. The numbers themselves are ignored.
4. **Text**: any other non-blank line.

## Blocks

Lines are grouped into blocks from top to bottom:

- A blank line ends the current block. Several blank lines in a row act as one.
- A heading line is always a block of its own: `<h1>text</h1>`, `<h2>text</h2>` or `<h3>text</h3>`.
- Consecutive unordered item lines form one unordered list; consecutive ordered item lines form one ordered list. A list renders on several lines: the opening tag, one `<li>text</li>` per item, then the closing tag:
  ```
  <ul>
  <li>a</li>
  <li>b</li>
  </ul>
  ```
  (`<ol>` / `</ol>` for ordered lists.) A blank line between items ends the list, so it produces two separate lists.
- Consecutive text lines form one paragraph: each line is trimmed and the lines are joined with a single space, giving `<p>text</p>`.
- A line of a different kind ends the current block immediately, with no blank line needed. For example, a text line followed by `- x` gives a paragraph and then a list; `- x` followed by a text line gives a list and then a paragraph; an unordered item right after an ordered item starts a new `<ul>`; a heading line between two text lines splits them into two paragraphs.

## Output

- The rendered blocks are joined with `"\n"`, in input order.
- There is no leading or trailing newline. An input with no blocks (empty, or only blank lines) renders as the empty string `""`.

## Inline formatting

Inline formatting applies to the text of headings, list items and paragraphs (for paragraphs, to the already joined text). The text is scanned from left to right; at each position the first matching rule below wins:

1. **Code span**: a `` ` `` starts a code span if there is another `` ` `` later in the text. The span ends at the next `` ` ``. Its content is rendered as `<code>content</code>` with no formatting inside (only HTML escaping). The content may be empty. A `` ` `` with no later `` ` `` is literal text.
2. **Bold**: `**` starts bold if a closing `**` occurs later in the text. The closer is the first `**` found after the opener, skipping over code spans (a code span is a `` ` `` together with the next `` ` `` after it, scanning from just after the opener). The content between opener and closer is rendered as `<strong>content</strong>`, and inside it the inline rules apply again (code spans, italic and links; outside code spans `**` cannot occur there). Content is always processed as a text of its own: "later in the text" then means later within that content. If there is no closer, the two characters `**` are literal text and scanning continues after them.
3. **Italic**: a single `*` (one not handled by rule 2) starts italic if a closing `*` occurs later. The closer is the first `*` after the opener, skipping over code spans in the same way. The content is rendered as `<em>content</em>`, and inside it only code spans and links apply. If there is no closer, the `*` is literal text. There are no whitespace rules: `a * b * c` renders as `a <em> b </em> c`.
4. **Link**: `[` starts a link if the first `]` after it is immediately followed by `(` and a `)` occurs after that `(`. The link text is everything between `[` and that `]`; the URL is everything between that `(` and the first `)` after it. The link text is plain text (HTML-escaped, no formatting inside). If the URL starts with `http://`, `https://` or `mailto:` (case-sensitive), render `<a href="URL">text</a>`; otherwise render only the link text, without any tag. If the `[` does not start a link, it is literal text.
5. Any other character is literal text.

## HTML escaping

Every piece of text that ends up in the output is HTML-escaped, including text inside code spans, link text and URLs in `href`: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`. No other characters are escaped.

## Examples

Input:

```
# Title

Some *text* here
and **more `x`**.

- one
- [two](https://e.com)
```

Output (no trailing newline):

```
<h1>Title</h1>
<p>Some <em>text</em> here and <strong>more <code>x</code></strong>.</p>
<ul>
<li>one</li>
<li><a href="https://e.com">two</a></li>
</ul>
```

`render("[x](javascript:alert(1))")` returns `<p>x)</p>` (the URL is `javascript:alert(1`, which is not allowed, so only the text `x` is rendered and the remaining `)` is literal).

Visible tests are in `src/markdown.test.js`; run them with `node --test`.
