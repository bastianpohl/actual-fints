const test = require('node:test');
const assert = require('assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { findReconciledMatches } = require('../utils/reconcile');

test('findReconciledMatches: nächste abgeglichene Buchung innerhalb von 7 Tagen', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-'));
  fs.mkdirSync(path.join(dataDir, 'budget'));
  const db = new Database(path.join(dataDir, 'budget', 'db.sqlite'));
  db.exec(`CREATE TABLE transactions (id TEXT, acct TEXT, amount INTEGER, date TEXT, description TEXT, notes TEXT,
    reconciled INTEGER, financial_id TEXT, tombstone INTEGER, isChild INTEGER)`);
  const ins = db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, 0)');
  ins.run('near', 'a1', -1000, '2026-09-27', 'p-near', 1, null);   // 1 Tag Abstand
  ins.run('far', 'a1', -1000, '2026-09-20', 'p-far', 1, null);     // 8 Tage: außerhalb
  ins.run('bank', 'a1', -1000, '2026-09-28', 'p-bank', 1, 'fid');  // hat financial_id: kein Kandidat
  ins.run('other', 'a1', -2000, '2026-09-28', 'p-other', 1, null); // anderer Betrag
  db.close();

  const tx = (imported_id, amount) => ({ transaction: { imported_id, account: 'a1', amount, date: '2026-09-28' } });
  const found = findReconciledMatches(dataDir, [tx('new', -1000), tx('known', -1000), tx('none', -5)], new Set(['known']));

  assert.equal(found.length, 1);
  assert.equal(found[0].bestMatch.id, 'near');
  assert.equal(found[0].diffDays, 1);
  fs.rmSync(dataDir, { recursive: true });
});
