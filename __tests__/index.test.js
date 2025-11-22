const test = require('node:test');
const assert = require('assert/strict');

const {
  convertAmountForDB,
  decodeText,
  getNotes,
  getPayeeName,
  convertTransaction,
} = require('../index');

test('convertAmountForDB gibt positiven Wert bei Kredit zurück', () => {
  assert.equal(convertAmountForDB(12.345, true), 1235);
});

test('convertAmountForDB gibt negativen Wert bei Debit zurück', () => {
  assert.equal(convertAmountForDB(99.99, false), -9999);
});

test('decodeText dekodiert Latin-1 nach UTF-8', () => {
  assert.equal(decodeText('Ãberweisung'), 'Überweisung');
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
  const transaction = {
    amount: 10.5,
    isCredit: true,
    entryDate: '2025-11-22',
    id: 'tx-1',
    descriptionStructured: {
      name: 'Müller GmbH',
      reference: { text: 'Ãberweisung' },
    },
  };

  const result = convertTransaction(transaction, 'account-1');

  assert.deepEqual(result, {
    account: 'account-1',
    amount: 1050,
    date: '2025-11-22',
    imported_id: 'tx-1',
    payee_name: 'Müller GmbH',
    notes: 'Überweisung',
  });
});