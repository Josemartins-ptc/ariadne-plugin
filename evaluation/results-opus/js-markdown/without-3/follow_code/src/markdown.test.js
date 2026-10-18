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

test('renders block quotes and fenced code blocks', () => {
  assert.equal(
    render('> a *quote*\n> continues\n\n```js\nif (a < b) {\n\n  return;\n}\n```\ndone'),
    '<blockquote><p>a <em>quote</em> continues</p></blockquote>\n' +
      '<pre><code class="language-js">if (a &lt; b) {\n\n  return;\n}</code></pre>\n' +
      '<p>done</p>',
  );
});

test('block quote edge cases', () => {
  assert.equal(render('>\n> \n>  x '), '<p>&gt;</p>\n<blockquote><p>x</p></blockquote>');
  assert.equal(
    render('text\n> q\n- li'),
    '<p>text</p>\n<blockquote><p>q</p></blockquote>\n<ul>\n<li>li</li>\n</ul>',
  );
});

test('fenced code block edge cases', () => {
  assert.equal(render('```\n```'), '<pre><code></code></pre>');
  assert.equal(
    render('para\n```\n# x\n```  \nafter'),
    '<p>para</p>\n<pre><code># x</code></pre>\n<p>after</p>',
  );
  assert.equal(render('```py\n a\n\n \n'), '<pre><code class="language-py"> a</code></pre>');
  assert.equal(render('``` a b\nx'), '<p><code></code>` a b x</p>');
  assert.equal(render('```\nx\n ```\n````'), '<pre><code>x\n ```\n````</code></pre>');
});
