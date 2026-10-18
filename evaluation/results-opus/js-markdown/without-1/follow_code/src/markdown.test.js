import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './markdown.js';

test('renders a heading and a paragraph', () => {
  assert.equal(render('# Hello\n\nworld'), '<h1>Hello</h1>\n<p>world</p>');
});

test('renders an unordered list', () => {
  assert.equal(render('- a\n- b'), '<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
});

test('renders bold, italic and code inline', () => {
  assert.equal(
    render('**bold** and *it* and `x`'),
    '<p><strong>bold</strong> and <em>it</em> and <code>x</code></p>',
  );
});

test('renders a block quote and a fenced code block', () => {
  assert.equal(
    render('> a *quote*\n> continues\n\n```js\nif (a < b) {\n\n  return;\n}\n```\ndone'),
    '<blockquote><p>a <em>quote</em> continues</p></blockquote>\n' +
      '<pre><code class="language-js">if (a &lt; b) {\n\n  return;\n}</code></pre>\n' +
      '<p>done</p>',
  );
});

test('skips empty quote lines and treats a bare > as text', () => {
  assert.equal(render('> a\n>  \n> b\n>'), '<blockquote><p>a b</p></blockquote>\n<p>&gt;</p>');
});

test('fences interrupt blocks and may be empty, unclosed or invalid', () => {
  assert.equal(render('text\n```\n```\nmore'), '<p>text</p>\n<pre><code></code></pre>\n<p>more</p>');
  assert.equal(render('```\n  # x  \n\n\n'), '<pre><code>  # x  </code></pre>');
  assert.equal(render('``` a b'), '<p><code></code>` a b</p>');
});
