const test = require('node:test');
const assert = require('node:assert');
const { uniquifyIds } = require('../utils/uid');
const ids = (list, ex) => uniquifyIds(list.map(id => ({ id })), ex).map(t => t.id);

test('neue Kollision: erste behält ID, weitere bekommen Suffix', () => {
   assert.deepStrictEqual(ids(['a', 'b', 'a', 'a']), ['a', 'b', 'a-2', 'a-3']);
});

test('bereits doppelt importierte Kollision bleibt unverändert (keine dritte Buchung)', () => {
   assert.deepStrictEqual(ids(['a', 'a'], new Map([['a', 2]])), ['a', 'a']);
});

test('eine von zwei Kollisionsbuchungen schon importiert: zweite bekommt Suffix', () => {
   assert.deepStrictEqual(ids(['a', 'a'], new Map([['a', 1]])), ['a', 'a-2']);
});
