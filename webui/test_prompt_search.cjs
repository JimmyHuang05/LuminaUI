const assert=require('node:assert/strict');
const {search}=require('./prompt-search.js');
const rows=[
 {id:'synonym',prompt:'A wedding dress on the beach, backlit.',last_used_at:'2026-10-05'},
 {id:'direct',title:'婚纱',card_summary:'海边逆光写真',last_used_at:'2026-10-01'},
 {id:'related',prompt:'A bride at her wedding.',last_used_at:'2026-10-06'},
 {id:'summary',module_summaries:{lighting:'烛光照亮木桌'},card_summary:'特别的纸杯'},
 {id:'plain',prompt:'A redwood tree beside strawberry plants.',tags:['自定义词']}
];
const ids=q=>search(rows,q).map(r=>r.id);
assert.deepEqual(ids('婚纱'),['direct','synonym','related']);
assert.deepEqual(ids('海边 逆光'),['direct','synonym']);
assert.deepEqual(ids('海边逆光'),['direct','synonym']);
assert.ok(ids('WEDDING DRESS').includes('direct'));
assert.deepEqual(ids('烛光'),['summary']);
assert.deepEqual(ids('candlelight'),['summary']);
assert.deepEqual(ids('特别的纸杯'),['summary']);
assert.deepEqual(ids('自定义词'),['plain']);
assert.deepEqual(ids('redwood'),['plain']);
assert.deepEqual(ids('red'),[]);
assert.deepEqual(ids('不存在的词'),[]);
assert.deepEqual(ids('').slice(0,3),['related','synonym','direct']);
assert.deepEqual(rows.map(r=>r.id),['synonym','direct','related','summary','plain']);
console.log('Bilingual, related, full-content, multi-term, ranking and stable-order tests passed');
