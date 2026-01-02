const test = require('node:test');
const assert = require('assert/strict');

const { decodeText } = require('../utils/decodeText');
const { isUid } = require('../utils/uid')
const { convertAmount, getNotes, getPayeeName, convertTransaction } = require ('../utils/convert');
const { requireEnv } = require('../utils/env');
const parseDateRange = require('../utils/parseDateRange');


test('convertAmount returns positive value for credit', () => {
  assert.equal(convertAmount(12.345, true), 1235);
});

test('convertAmount returns negative value for debit', () => {
  assert.equal(convertAmount(99.99, false), -9999);
});

test('decodeText decodes Latin-1 to UTF-8', () => {
  assert.equal(decodeText('Ãberweisung'), 'Überweisung');
});

test('Überweisung remains Überweisung', () => {
  assert.equal(decodeText('Überweisung'), 'Überweisung');
});

test('decodeText returns empty string for non-strings', () => {
  assert.equal(decodeText(null), '');
});

test('getNotes composes structured fields into notes', () => {
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

test('getNotes tolerates missing fields', () => {
  assert.equal(getNotes({ descriptionStructured: {} }), '');
});

test('getPayeeName returns name from descriptionStructured', () => {
  assert.equal(getPayeeName({ descriptionStructured: { name: 'Müller GmbH' } }), 'Müller GmbH');
});

test('getPayeeName returns empty string when no name present', () => {
  assert.equal(getPayeeName({}), '');
});

test('convertTransaction fully converts the transaction', () => {
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

test('parseDateRange uses explicit --from and --to arguments when provided', t => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script', '--from', '2025-01-01', '--to', '2025-01-31'];

  t.after(() => {
    process.argv = originalArgv;
  });

  const { startDate, endDate } = parseDateRange();

  assert.equal(startDate.toISOString(), new Date('2025-01-01').toISOString());
  assert.equal(endDate.toISOString(), new Date('2025-01-31').toISOString());
});

test('parseDateRange still honors legacy --start/--end flags', t => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script', '--start', '2025-03-01', '--end', '2025-03-15'];

  t.after(() => {
    process.argv = originalArgv;
  });

  const { startDate, endDate } = parseDateRange();

  assert.equal(startDate.toISOString(), new Date('2025-03-01').toISOString());
  assert.equal(endDate.toISOString(), new Date('2025-03-15').toISOString());
});

test('parseDateRange defaults to the current date when arguments are missing', t => {
  const defaultDate = new Date();

  const { startDate, endDate } = parseDateRange();

  assert.equal(startDate.toISOString(), defaultDate.toISOString());
  assert.equal(endDate.toISOString(), defaultDate.toISOString());
});

test('parseDateRange throws when end date precedes start date', t => {
  const originalArgv = process.argv;
  process.argv = ['node', 'script', '--from', '2025-02-01', '--to', '2025-01-01'];

  t.after(() => {
    process.argv = originalArgv;
  });

  assert.throws(() => parseDateRange(), /Enddatum darf nicht vor dem Startdatum liegen/);
});

test('isUid recognizes valid numeric IDs', () => {
  assert.equal(isUid(123456), true);
  assert.equal(isUid('789012'), true);
});

test('isUid recognizes valid hexadecimal UUIDs', () => {
  assert.equal(isUid('550e8400e29b41d4a716446655440000'), true);
  assert.equal(isUid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('isUid recognizes invalid IDs', () => {
  assert.equal(isUid('not-a-uid'), false);
  assert.equal(isUid(null), false);
  assert.equal(isUid(undefined), false);
  assert.equal(isUid(''), false);
});

test('recognizes ActualBudget UID', () => {
  assert.equal(isUid(' 52c9f3ee-3335-4be5-a84d-78eabab3286a'), true);
});

test('Haushaltskonto is not a UID', () => {
  assert.equal(isUid(' Haushaltskonto'), false);
});

test('requireEnv throws error when no array is provided', () => {
  assert.throws(
    () => requireEnv('AB_URL'),
    /Keys must be an array/
  );
});

test('requireEnv throws error when variables are missing', () => {
  assert.throws(
    () => requireEnv(['NOT_SET']),
    /Missing Actual env vars: NOT_SET/
  );
});

test('requireEnv returns object with existing variables', () => {
  process.env.TEST_URL = 'http://localhost';
  process.env.TEST_PASS = 'secret';

  const env = requireEnv(['TEST_URL', 'TEST_PASS']);

  assert.deepEqual(env, {
    TEST_URL: 'http://localhost',
    TEST_PASS: 'secret',
  });
});

