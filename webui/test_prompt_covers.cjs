const test = require('node:test');
const assert = require('node:assert/strict');
const {coverURL, matchesPrompt} = require('./prompt-covers.js');
test('covers use only validated local URLs', () => {
  assert.equal(coverURL('a'.repeat(32)), '/api/prompt-covers/' + 'a'.repeat(32) + '/thumb');
  assert.equal(coverURL('a'.repeat(32), 'full'), '/api/prompt-covers/' + 'a'.repeat(32) + '/full');
  for (const id of [null, undefined, '../file', 'https://example.com/image.png', '<img>', 'A'.repeat(32)]) assert.equal(coverURL(id), null);
  assert.equal(coverURL('a'.repeat(32), '../../file'), null);
});
test('source matching uses prompt content, not titles or unrelated images', () => {
  const row = {title:'A cup',prompt:'A white cup'};
  assert(matchesPrompt({base_prompt:'A white cup',prompt:'A white cup\nwatercolor style'},row));
  assert(matchesPrompt({prompt:' A white cup '},row));
  assert(!matchesPrompt({prompt:'A different cup',library_prompt:{title:'A cup'}},row));
  assert(!matchesPrompt({prompt:'A white cup'},null));
});
