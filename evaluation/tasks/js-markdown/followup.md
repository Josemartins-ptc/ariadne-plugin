Please extend `render` in `src/markdown.js` with two new block types. Everything that already works must keep working exactly as before, except that the lines described below now start these new blocks instead of being text.

## Block quotes

- A line that starts with `> ` (greater-than, space, at the very first character of the line) is a **quote line**. Its content is the rest of the line after `> `, trimmed (spaces and tabs).
- Consecutive quote lines form one block quote. Like the other blocks, it ends at a blank line or at a line of a different kind.
- The contents of the quote lines are joined with a single space (lines whose content is empty are left out of the join), inline formatting is applied to the joined text exactly as for paragraphs, and the block renders on one line as `<blockquote><p>text</p></blockquote>`.
- A line consisting of just `>` (no space after it) is not a quote line.

## Fenced code blocks

- An **opening fence** is a line that starts with ` ``` ` (three backticks, at the very first character of the line) where the rest of the line, trimmed, is either empty or a single language word: one or more characters, none of them a space, tab or backtick. Any other line starting with ` ``` ` is not a fence and keeps its old meaning.
- The code block contains the lines after the opening fence up to the **closing fence**: the next line that is exactly ` ``` ` after removing trailing spaces and tabs. The closing fence is not part of the content. Lines inside the block are taken verbatim: they are not trimmed, they are not classified (no headings, lists, quotes or inline formatting inside), and blank lines inside are kept.
- If there is no closing fence, the block runs to the end of the input; in that case blank lines at the very end of the input are not part of the content.
- Render it on its own as `<pre><code class="language-WORD">CONTENT</code></pre>` when there is a language word, or `<pre><code>CONTENT</code></pre>` when there is none. CONTENT is the content lines joined with `"\n"` (no extra newline before `</code>`; an empty block gives `<pre><code></code></pre>`). CONTENT and WORD are HTML-escaped with the same rules as everything else.
- An opening fence ends the current block immediately (no blank line needed before it), and the line after the closing fence starts fresh (no blank line needed after it).

The rendered blocks are still joined with `"\n"`, so a multi-line code block contributes its own newlines inside the `<pre>`.

Example input:

````
> a *quote*
> continues

```js
if (a < b) {

  return;
}
```
done
````

Output:

```
<blockquote><p>a <em>quote</em> continues</p></blockquote>
<pre><code class="language-js">if (a &lt; b) {

  return;
}</code></pre>
<p>done</p>
```

Make sure `node --test` still passes.
