const test = require('node:test');
const assert = require('node:assert/strict');
const {createState, scopeKey, supported} = require('./lora-v2.js');
const key = scopeKey('01_text_to_image', 'pro_mix', 'moody_zit_simple');
test('pages and recipes own separate state', () => {
  const a = createState(), b = createState();
  const row = {id:'loras/style.safetensors', strength:0.8};
  a.set(key, [row]); row.strength = 2;
  assert.equal(a.rows(key)[0].strength, 0.8);
  assert.deepEqual(b.rows(key), []);
  assert.deepEqual(a.rows(scopeKey('02_character_consistency', 'pro_mix', 'moody_zit_i2i')), []);
  assert.equal(a.rows(key)[0].strength, 0.8);
});
test('restoring and exporting cannot mutate other pages or history', () => {
  const saved = {[key]:[{id:'style',enabled:true}]};
  const state = createState(saved); saved[key][0].enabled = false;
  assert.equal(state.rows(key)[0].enabled, true);
  const snapshot = state.snapshot(); snapshot[key][0].enabled = false;
  assert.equal(state.rows(key)[0].enabled, true);
  state.set(key, []); assert.equal(state.count(), 0);
});
test('feature capability is exact, not category based', () => {
  assert(supported('01_text_to_image', 'pro_mix', 'moody_zit_simple'));
  assert(!supported('02_character_consistency', 'pro_mix', 'moody_zit_simple'));
  assert(!supported('01_text_to_image', 'wild', 'moody_zit_simple'));
  assert(!supported('01_text_to_image', 'pro_mix', 'moody_zit_i2i'));
});
