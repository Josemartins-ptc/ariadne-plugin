import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './markdown.js';

test('quote lines join into one block quote with inline formatting', () => {
  assert.equal(
    render('> a *b*\n>   c `d`  '),
    '<blockquote><p>a <em>b</em> c <code>d</code></p></blockquote>',
  );
});

test('blank line separates two block quotes', () => {
  assert.equal(
    render('> a\n\n> b'),
    '<blockquote><p>a</p></blockquote>\n<blockquote><p>b</p></blockquote>',
  );
});

test('quote ends at a line of another kind', () => {
  assert.equal(
    render('para\n> q\n- i'),
    '<p>para</p>\n<blockquote><p>q</p></blockquote>\n<ul>\n<li>i</li>\n</ul>',
  );
});

test('greater-than without a space is paragraph text', () => {
  assert.equal(render('>no\n>'), '<p>&gt;no &gt;</p>');
});

test('empty quote lines are left out of the join', () => {
  assert.equal(render('> a\n> \n> b'), '<blockquote><p>a b</p></blockquote>');
});

test('fenced code with language', () => {
  assert.equal(
    render('```js\nlet x = 1;\n```'),
    '<pre><code class="language-js">let x = 1;</code></pre>',
  );
});

test('fenced code without language keeps lines verbatim and blank lines', () => {
  assert.equal(
    render('```\n  # not a heading\n\n- **x** `y`\n```'),
    '<pre><code>  # not a heading\n\n- **x** `y`</code></pre>',
  );
});

test('fenced code content and language are escaped', () => {
  assert.equal(
    render('```c&c\n<a href="x">it\'s & more</a>\n```'),
    '<pre><code class="language-c&amp;c">&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; more&lt;/a&gt;</code></pre>',
  );
});

test('empty fenced block', () => {
  assert.equal(render('```\n```'), '<pre><code></code></pre>');
});

test('unclosed fence runs to the end and drops trailing blank lines', () => {
  assert.equal(render('```py\nprint(1)\n\nprint(2)\n\n\n'), '<pre><code class="language-py">print(1)\n\nprint(2)</code></pre>');
});

test('fence interrupts a paragraph and the next line starts fresh', () => {
  assert.equal(
    render('before\n```\ncode\n```\nafter'),
    '<p>before</p>\n<pre><code>code</code></pre>\n<p>after</p>',
  );
});

test('closing fence may have trailing spaces but a fence with a word does not close', () => {
  assert.equal(
    render('```\na\n```js\nb\n```  \nc'),
    '<pre><code>a\n```js\nb</code></pre>\n<p>c</p>',
  );
});

test('a backtick line with two words is not a fence', () => {
  assert.equal(render('```js extra'), '<p><code></code>`js extra</p>');
});

test('opening fence language is trimmed', () => {
  assert.equal(render('```  rust  \nfn x() {}\n```'), '<pre><code class="language-rust">fn x() {}</code></pre>');
});

test('crlf inside fenced code is normalized', () => {
  assert.equal(render('```\r\na\r\nb\r\n```\r\n'), '<pre><code>a\nb</code></pre>');
});
