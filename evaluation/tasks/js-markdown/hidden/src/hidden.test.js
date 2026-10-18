import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './markdown.js';

test('empty or blank-only input renders the empty string', () => {
  assert.equal(render(''), '');
  assert.equal(render('\n  \n\t\n\n'), '');
});

test('heading levels one to three', () => {
  assert.equal(render('# a\n## b\n### c'), '<h1>a</h1>\n<h2>b</h2>\n<h3>c</h3>');
});

test('four hashes or no space is a paragraph', () => {
  assert.equal(render('#### deep\n#tag'), '<p>#### deep #tag</p>');
});

test('heading text is trimmed and formatted inline', () => {
  assert.equal(render('##   *Big*  title  '), '<h2><em>Big</em>  title</h2>');
});

test('paragraph lines are trimmed and joined with one space', () => {
  assert.equal(render('  one  \ntwo\t\n   three'), '<p>one two three</p>');
});

test('multiple blank lines separate blocks once', () => {
  assert.equal(render('a\n\n\n\nb\n'), '<p>a</p>\n<p>b</p>');
});

test('crlf line endings are accepted', () => {
  assert.equal(render('# T\r\n\r\nx\r\ny'), '<h1>T</h1>\n<p>x y</p>');
});

test('ordered list ignores the numbers', () => {
  assert.equal(render('3. c\n10. d'), '<ol>\n<li>c</li>\n<li>d</li>\n</ol>');
});

test('list markers need a space after them', () => {
  assert.equal(render('1.5 is a number'), '<p>1.5 is a number</p>');
  assert.equal(render('-x'), '<p>-x</p>');
});

test('indented markers are not blocks', () => {
  assert.equal(render(' - a\n # b'), '<p>- a # b</p>');
});

test('blank line splits a list into two lists', () => {
  assert.equal(render('- a\n\n- b'), '<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>');
});

test('switching list kind starts a new list', () => {
  assert.equal(
    render('1. a\n- b'),
    '<ol>\n<li>a</li>\n</ol>\n<ul>\n<li>b</li>\n</ul>',
  );
});

test('paragraph then list then paragraph without blank lines', () => {
  assert.equal(
    render('intro\n- item\nafter'),
    '<p>intro</p>\n<ul>\n<li>item</li>\n</ul>\n<p>after</p>',
  );
});

test('heading line splits a paragraph', () => {
  assert.equal(render('a\n## h\nb'), '<p>a</p>\n<h2>h</h2>\n<p>b</p>');
});

test('list items are trimmed and formatted inline', () => {
  assert.equal(render('-   **x**  \n- `y`'), '<ul>\n<li><strong>x</strong></li>\n<li><code>y</code></li>\n</ul>');
});

test('bold may contain italic', () => {
  assert.equal(render('**a *b* c**'), '<p><strong>a <em>b</em> c</strong></p>');
});

test('code span content is not formatted', () => {
  assert.equal(render('`**no** *em*`'), '<p><code>**no** *em*</code></p>');
});

test('bold closer inside a code span is skipped', () => {
  assert.equal(render('**a `**` b**'), '<p><strong>a <code>**</code> b</strong></p>');
});

test('code span takes precedence over an unclosed bold', () => {
  assert.equal(render('**a `b** c`'), '<p>**a <code>b** c</code></p>');
});

test('unclosed markers are literal', () => {
  assert.equal(render('**bold and *it and `code'), '<p>**bold and *it and `code</p>');
});

test('italic has no whitespace rules', () => {
  assert.equal(render('a * b * c'), '<p>a <em> b </em> c</p>');
});

test('code span may span joined paragraph lines', () => {
  assert.equal(render('`a\nb`'), '<p><code>a b</code></p>');
});

test('allowed link schemes become anchors', () => {
  assert.equal(
    render('[h](http://a.b) [s](https://c.d/e?f=1) [m](mailto:x@y.z)'),
    '<p><a href="http://a.b">h</a> <a href="https://c.d/e?f=1">s</a> <a href="mailto:x@y.z">m</a></p>',
  );
});

test('disallowed link schemes render only the text', () => {
  assert.equal(render('see [click](javascript:alert(1)) now'), '<p>see click) now</p>');
  assert.equal(render('[a](/path) [b](HTTP://x)'), '<p>a b</p>');
});

test('incomplete link syntax is literal', () => {
  assert.equal(render('[a] (http://x) [b](http://y'), '<p>[a] (http://x) [b](http://y</p>');
});

test('link text is plain text', () => {
  assert.equal(render('[*x*](https://e.com)'), '<p><a href="https://e.com">*x*</a></p>');
});

test('link inside bold', () => {
  assert.equal(render('**[x](https://e.com)**'), '<p><strong><a href="https://e.com">x</a></strong></p>');
});

test('escapes special characters in text', () => {
  assert.equal(render(`Tom & "Jerry" <b> it's`), '<p>Tom &amp; &quot;Jerry&quot; &lt;b&gt; it&#39;s</p>');
});

test('escapes inside code spans', () => {
  assert.equal(render('`<a href="x">&</a>`'), '<p><code>&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;</code></p>');
});

test('escapes link text and url', () => {
  assert.equal(
    render(`[a<b](https://e.com/?q="1"&r='2')`),
    '<p><a href="https://e.com/?q=&quot;1&quot;&amp;r=&#39;2&#39;">a&lt;b</a></p>',
  );
});
