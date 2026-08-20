const test = require('node:test');
const assert = require('assert/strict');

const { decodeText } = require('../utils/decodeText');
const { isUid } = require('../utils/uid')
const { convertAmount, getNotes, getPayeeName, convertTransaction, convertPendingTransaction, PENDING_ID_PREFIX } = require ('../utils/convert');
const { splitAlreadyBookedPending, dateIntToIso, payeesMatch } = require('../utils/pending');
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

test('parseDateRange defaults to current day for start date when arguments are missing', t => {
  const defaultEndDate = new Date();
  const defaultStartDate = new Date();

  const { startDate, endDate } = parseDateRange();

  assert.equal(startDate.toISOString(), defaultStartDate.toISOString());
  assert.equal(endDate.toISOString(), defaultEndDate.toISOString());
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

  // 5. Imported pending booking (uncleared, preliminary): must not count towards the balance
  db.prepare('INSERT INTO transactions (id, acct, amount, isParent, isChild, tombstone, financial_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
     'tx-pending-4', accountId, 2500, 0, 0, 0, 'pending-abc123'
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






test('convertPendingTransaction marks the transaction as uncleared and prefixes the imported_id', () => {
  const transaction = {
    id: 'abc123',
    amount: 12.54,
    isCredit: false,
    valueDate: '2026-06-10',
    entryDate: '2026-06-19',
    descriptionStructured: { name: 'Lidl', reference: { text: 'Kaufumsatz' } },
  };

  const converted = convertPendingTransaction(transaction, 'acc-1');

  assert.equal(converted.account, 'acc-1');
  assert.equal(converted.amount, -1254);
  assert.equal(converted.cleared, false);
  assert.equal(converted.imported_id, `${PENDING_ID_PREFIX}abc123`);
  // The value date is closer to the eventual booking date than the entry date
  assert.equal(converted.date, '2026-06-10');
  assert.ok(converted.notes.startsWith('⏳ Vorgemerkt'));
});

test('convertPendingTransaction falls back to the entry date', () => {
  const converted = convertPendingTransaction(
    { id: 'x', amount: 5, isCredit: true, entryDate: '2026-06-19' },
    'acc-1'
  );
  assert.equal(converted.date, '2026-06-19');
  assert.equal(converted.amount, 500);
});

test('convertPendingTransaction rejects transactions without a usable date', () => {
  assert.throws(
    () => convertPendingTransaction({ id: 'x', amount: 5, isCredit: true }, 'acc-1'),
    /valid valueDate or entryDate/
  );
});

test('dateIntToIso converts Actual date integers', () => {
  assert.equal(dateIntToIso(20260610), '2026-06-10');
  assert.equal(dateIntToIso('not-a-date'), null);
});

test('payeesMatch compares normalized payee names', () => {
  assert.equal(payeesMatch('EDK*Getraenke Bruss', 'edk getraenke bruss'), true);
  assert.equal(payeesMatch('Lidl sagt Danke', 'Aldi Sued'), false);
  assert.equal(payeesMatch('', 'Lidl'), false);
});

test('splitAlreadyBookedPending skips pending bookings that already arrived as booked', () => {
  const pending = [
    { amount: -1254, date: '2026-06-10', payee_name: 'Lidl Gelsenkirchen' },
    { amount: -2176, date: '2026-06-11', payee_name: 'Aldi Sued' },
  ];
  const booked = [
    { amount: -1254, date: 20260612, payee: 'Lidl Gelsenkirchen' },
  ];

  const { fresh, duplicates } = splitAlreadyBookedPending(pending, booked);

  assert.equal(duplicates.length, 1);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].payee_name, 'Aldi Sued');
});

test('splitAlreadyBookedPending keeps pending bookings outside the date window', () => {
  const pending = [{ amount: -1254, date: '2026-06-10', payee_name: 'Lidl' }];
  const booked = [{ amount: -1254, date: 20260601, payee: 'Lidl' }];

  const { fresh, duplicates } = splitAlreadyBookedPending(pending, booked);

  assert.equal(fresh.length, 1);
  assert.equal(duplicates.length, 0);
});

test('splitAlreadyBookedPending consumes each booked transaction only once', () => {
  const pending = [
    { amount: -1000, date: '2026-06-10', payee_name: 'Rewe' },
    { amount: -1000, date: '2026-06-10', payee_name: 'Rewe' },
  ];
  const booked = [{ amount: -1000, date: 20260610, payee: 'Rewe' }];

  const { fresh, duplicates } = splitAlreadyBookedPending(pending, booked);

  assert.equal(duplicates.length, 1);
  assert.equal(fresh.length, 1);
});
