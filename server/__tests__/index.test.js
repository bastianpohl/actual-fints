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
    '#Überweisung Bonus Überweisung IBAN: DE44500105175407324931 BIC: COBADEFFXXX E2E: E2E123 CR: CUST BR: BANK';

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

test('parseDateRange looks a week back by default so backdated bookings are still picked up', t => {
  const originalLookback = process.env.SYNC_LOOKBACK_DAYS;
  delete process.env.SYNC_LOOKBACK_DAYS;
  t.after(() => {
    if (originalLookback === undefined) delete process.env.SYNC_LOOKBACK_DAYS;
    else process.env.SYNC_LOOKBACK_DAYS = originalLookback;
  });

  const { startDate, endDate } = parseDateRange();

  const expectedStart = new Date();
  expectedStart.setDate(expectedStart.getDate() - parseDateRange.DEFAULT_LOOKBACK_DAYS);

  assert.equal(startDate.toISOString().slice(0, 10), expectedStart.toISOString().slice(0, 10));
  assert.equal(endDate.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
});

test('parseDateRange honors SYNC_LOOKBACK_DAYS for the default range', t => {
  const originalLookback = process.env.SYNC_LOOKBACK_DAYS;
  process.env.SYNC_LOOKBACK_DAYS = '30';
  t.after(() => {
    if (originalLookback === undefined) delete process.env.SYNC_LOOKBACK_DAYS;
    else process.env.SYNC_LOOKBACK_DAYS = originalLookback;
  });

  const { startDate } = parseDateRange();

  const expectedStart = new Date();
  expectedStart.setDate(expectedStart.getDate() - 30);

  assert.equal(startDate.toISOString().slice(0, 10), expectedStart.toISOString().slice(0, 10));
});

test('parseDateRange falls back to the default when SYNC_LOOKBACK_DAYS is not a usable number', t => {
  const originalLookback = process.env.SYNC_LOOKBACK_DAYS;
  process.env.SYNC_LOOKBACK_DAYS = 'nonsense';
  t.after(() => {
    if (originalLookback === undefined) delete process.env.SYNC_LOOKBACK_DAYS;
    else process.env.SYNC_LOOKBACK_DAYS = originalLookback;
  });

  assert.equal(parseDateRange.getLookbackDays(), parseDateRange.DEFAULT_LOOKBACK_DAYS);
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

test('getAccountBalanceFromDb correctly sums only normal and parent transactions', () => {
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  const { getAccountBalanceFromDb } = require('../utils/reconcile');

  const tempDir = path.join(__dirname, 'temp-budget-test');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const dbDir = path.join(tempDir, 'test-budget-id');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
  const dbPath = path.join(dbDir, 'db.sqlite');

  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  db.prepare(`
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      acct TEXT,
      amount INTEGER,
      isParent INTEGER,
      isChild INTEGER,
      tombstone INTEGER,
      financial_id TEXT
    )
  `).run();

  const accountId = 'acc-123';

  // 1. Normal transaction: 50.00 Euro (5000 cents)
  db.prepare('INSERT INTO transactions (id, acct, amount, isParent, isChild, tombstone) VALUES (?, ?, ?, ?, ?, ?)').run(
     'tx-1', accountId, 5000, 0, 0, 0
  );

  // 2. Deleted normal transaction (tombstone = 1): 10.00 Euro (1000 cents)
  db.prepare('INSERT INTO transactions (id, acct, amount, isParent, isChild, tombstone) VALUES (?, ?, ?, ?, ?, ?)').run(
     'tx-2', accountId, 1000, 0, 0, 1
  );

  // 3. Parent split transaction: 100.00 Euro (10000 cents)
  db.prepare('INSERT INTO transactions (id, acct, amount, isParent, isChild, tombstone) VALUES (?, ?, ?, ?, ?, ?)').run(
     'tx-parent-3', accountId, 10000, 1, 0, 0
  );

  // 4. Child split transactions (should be ignored to avoid double counting): 60.00 + 40.00 Euro
  db.prepare('INSERT INTO transactions (id, acct, amount, isParent, isChild, tombstone) VALUES (?, ?, ?, ?, ?, ?)').run(
     'tx-child-3a', accountId, 6000, 0, 1, 0
  );
  db.prepare('INSERT INTO transactions (id, acct, amount, isParent, isChild, tombstone) VALUES (?, ?, ?, ?, ?, ?)').run(
     'tx-child-3b', accountId, 4000, 0, 1, 0
  );

  db.close();

  // Call the function
  const balance = getAccountBalanceFromDb(tempDir, accountId);

  // Expected sum = 5000 (normal) + 10000 (parent) = 15000 cents = 150.00 Euro
  assert.equal(balance, 150.00);

  // Cleanup
  fs.unlinkSync(dbPath);
  fs.rmdirSync(dbDir);
  fs.rmdirSync(tempDir);
});






test('applyHisalPatch tolerates HISAL segments without optional balance groups', () => {
  const { applyHisalPatch } = require('../lib/fints-hisal-patch');
  assert.equal(applyHisalPatch(), true);

  const { HISAL } = require('fints/dist/segments/hisal');

  // ING style response: booked balance only, no pending / dispo / available groups
  const segment = {};
  HISAL.prototype.deserialize.call(segment, [
    ['1234567890', '', '280', '50010517'],
    ['Girokonto'],
    ['EUR'],
    ['C', '1234,56'],
  ]);

  assert.equal(segment.currency, 'EUR');
  assert.equal(segment.productName, 'Girokonto');
  assert.equal(segment.bookedBalance, 1234.56);
  assert.equal(segment.pendingBalance, 0);
  assert.equal(segment.creditLimit, 0);
  assert.equal(segment.availableBalance, 0);
  assert.equal(segment.account.accountNumber, '1234567890');
});

test('applyHisalPatch still reads complete HISAL segments', () => {
  const { applyHisalPatch } = require('../lib/fints-hisal-patch');
  applyHisalPatch();

  const { HISAL } = require('fints/dist/segments/hisal');

  const segment = {};
  HISAL.prototype.deserialize.call(segment, [
    ['1234567890', '', '280', '50010517'],
    ['Girokonto'],
    ['EUR'],
    ['C', '1000,00'],
    ['D', '50,00'],
    ['2000,00'],
    ['2950,00'],
  ]);

  assert.equal(segment.bookedBalance, 1000);
  assert.equal(segment.pendingBalance, 50);
  assert.equal(segment.creditLimit, 2000);
  assert.equal(segment.availableBalance, 2950);
});
