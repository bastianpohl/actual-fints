const test = require('node:test');
const assert = require('assert/strict');

const { compactStdout, trimToRunBoundary, parseRuns } = require('../utils/synclog');

const block = (title, stdout, stderr, exit) =>
  `\n[5.10.2026, 19:37:54] --- ${title} ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\nEXIT: ${exit}\n--- SYNC END ---\n`;

test('compactStdout entfernt Objekt-Dumps, behält Meldungen und Ergebniszeile', () => {
  const out = compactStdout(
    ['Budget downloaded', 'Debug data: {', '  a: [', '    { error: null }', '  ]', '}', '[{"account":"X","added":1}]'].join('\n')
  );
  assert.equal(out, 'Budget downloaded\nDebug data: {\n[{"account":"X","added":1}]\n[4 Zeilen Debug-Ausgabe entfernt]');
});

test('trimToRunBoundary schneidet nur an einer Lauf-Kopfzeile', () => {
  const big = block('CRON SYNC START', 'x\n'.repeat(400000), '', 0);
  const trimmed = trimToRunBoundary(big + block('SYNC START (Range: a to b)', 'ok', '', 0));
  assert.match(trimmed, /^\[5\.10\.2026, 19:37:54\] --- SYNC START \(Range: a to b\) ---/);
});

test('parseRuns: Importe, Exit-Code und Dump-Zeilen', () => {
  const log =
    block('SYNC START (Range: 2026-10-01 to Heute)', 'error: null,\n[{"account":"Giro","added":2,"ignored":1,"transactions":[]}]', 'Verarbeite Konto: DE** -> Giro', 0) +
    block('CRON SYNC START', '', 'Fehler bei Bank "ING": timeout', 1);
  const [cron, manual] = parseRuns(log);
  assert.equal(cron.cron, true);
  assert.deepEqual(cron.errors, ['Prozess mit Exit-Code 1 beendet', 'Fehler bei Bank "ING": timeout']);
  assert.equal(manual.range, '2026-10-01 – Heute');
  assert.equal(manual.added, 2);
  assert.equal(manual.ignored, 1);
  assert.deepEqual(manual.errors, []);
});

test('parseRuns überspringt ein angeschnittenes Log ohne Kopfzeile', () => {
  assert.deepEqual(parseRuns('ushaltskonto\',\n  balance: null,\n--- SYNC END ---'), []);
});
