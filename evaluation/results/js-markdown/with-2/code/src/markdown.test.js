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
