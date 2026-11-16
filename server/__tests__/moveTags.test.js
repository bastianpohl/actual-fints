const test = require('node:test');
const assert = require('node:assert/strict');
const { moveTagsToEnd } = require('../utils/moveTags');

const cases = [
   ['#ApplePay #Lastschrifteinzug NR XXXX 7025 ARN1', 'NR XXXX 7025 ARN1 #Lastschrifteinzug #ApplePay'],
   ['#UrlaubSchweden #ApplePay #Lastschrifteinzug NR 1', '#UrlaubSchweden NR 1 #Lastschrifteinzug #ApplePay'],
   ['#ApplePay NR 1 #Lastschrifteinzug', 'NR 1 #Lastschrifteinzug #ApplePay'],
   ['#Netflix #Streaming#Lastschrifteinzug Netflix E2E: 1', '#Netflix #Streaming Netflix E2E: 1 #Lastschrifteinzug'],
   ['#Gutschrift aus Dauerauftrag Netflix + Disney', 'Netflix + Disney #Gutschrift aus Dauerauftrag'],
   ['#Entgelt GIROCARD 300 MONATLICHES ENTGELT', 'GIROCARD 300 MONATLICHES ENTGELT #Entgelt'],
   ['#Gutschrift', '#Gutschrift'],
   ['#Bastian Lebensversicherung', '#Bastian Lebensversicherung'],
   ['Ohne Tag IBAN: DE1', 'Ohne Tag IBAN: DE1'],
   ['NR 1 #ApplePay #Lastschrifteinzug', 'NR 1 #Lastschrifteinzug #ApplePay'],
   ['#Paypal #Lastschrifteinzug NR 1', 'NR 1 #Lastschrifteinzug #Paypal'],
   ['#Corinna #Lastschrifteinzug X', '#Corinna X #Lastschrifteinzug'],
   ['X #Corinna #Lastschrifteinzug', 'X #Corinna #Lastschrifteinzug'],
];
for (const [input, expected] of cases) {
   test(`moveTagsToEnd: ${input}`, () => {
      assert.equal(moveTagsToEnd(input), expected);
      assert.equal(moveTagsToEnd(expected), expected); // idempotent
   });
}
