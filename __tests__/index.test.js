const test = require('node:test');
const assert = require('assert/strict');

const { decodeText } = require('../utils/decodeText');
const { isUid } = require('../utils/uid')
const { convertAmount, getNotes, getPayeeName, convertTransaction } = require ('../utils/convert');


test('convertAmount gibt positiven Wert bei Kredit zurück', () => {
  assert.equal(convertAmount(12.345, true), 1235);
});

test('convertAmount gibt negativen Wert bei Debit zurück', () => {
  assert.equal(convertAmount(99.99, false), -9999);
});

test('decodeText dekodiert Latin-1 nach UTF-8', () => {
  assert.equal(decodeText('Ãberweisung'), 'Überweisung');
});

test('Überweisung bleibt Überweisung', () => {
  assert.equal(decodeText('Überweisung'), 'Überweisung');
});

test('decodeText gibt leeren String für Nicht-Strings zurück', () => {
  assert.equal(decodeText(null), '');
});

test('getNotes baut strukturierte Felder zu Notizen zusammen', () => {
  const transaction = {
    descriptionStructured: {
      reference: { text: 'Ãberweisung', endToEndRef: 'E2E123' },
      text: 'Ãberweisung Bonus',
      iban: 'DE44500105175407324931',
      bic: 'COBADEFFXXX',
    },
    customerReference: 'CUST',
    bankReference: 'BANK',
  };

  const expected =
    'Überweisung #Überweisung Bonus IBAN: DE44500105175407324931 BIC: COBADEFFXXX E2E: E2E123 CR: CUST BR: BANK';

  assert.equal(getNotes(transaction), expected);
});

test('getNotes toleriert fehlende Felder', () => {
  assert.equal(getNotes({ descriptionStructured: {} }), '');
});

test('getPayeeName liefert Namen aus descriptionStructured', () => {
  assert.equal(getPayeeName({ descriptionStructured: { name: 'Müller GmbH' } }), 'Müller GmbH');
});

test('getPayeeName gibt leeren String zurück, wenn kein Name vorhanden', () => {
  assert.equal(getPayeeName({}), '');
});

test('convertTransaction konvertiert Transaktion vollständig', () => {
  const t = {
    amount: 10.5,
    isCredit: false,
    entryDate: '2025-11-22',
    id: 'tx-1',
    descriptionStructured: {
      name: 'Müller GmbH',
      reference: { text: 'Ãberweisung' },
    },
  };

  const result = convertTransaction(t, "50e8400-e29b-41d4-a716-446655440000");

  assert.deepEqual(result, {
    account: "50e8400-e29b-41d4-a716-446655440000",
    amount: -1050,
    date: '2025-11-22',
    imported_id: 'tx-1',
    payee_name: 'Müller GmbH',
    notes: 'Überweisung',
  });
});


test('isUid erkennt gültige numerische IDs', () => {
  assert.equal(isUid(123456), true);
  assert.equal(isUid('789012'), true);
});

test('isUid erkennt gültige hexadezimale UUIDs', () => {
  assert.equal(isUid('550e8400e29b41d4a716446655440000'), true);
  assert.equal(isUid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('isUid erkennt ungültige IDs', () => {
  assert.equal(isUid('not-a-uid'), false);
  assert.equal(isUid(null), false);
  assert.equal(isUid(undefined), false);
  assert.equal(isUid(''), false);
});

test('erkennt UID von ActualBudget', () => {
  assert.equal(isUid(' 52c9f3ee-3335-4be5-a84d-78eabab3286a'), true);
});

test('Haushaltskonto ist keine UID', () => {
  assert.equal(isUid(' Haushaltskonto'), false);
});
