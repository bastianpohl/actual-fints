const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LOG_FILE = path.join(__dirname, '..', 'sync.log');

// Ein einzelner Lauf kann durch Objekt-Dumps der Actual-Bibliothek groß sein,
// daher großzügig behalten und nur an Lauf-Grenzen kürzen.
const MAX_BYTES = 1024 * 1024;
const KEEP_BYTES = 700 * 1024;
const RUN_HEADER = /^\[[^\]\n]*\] --- (?:CRON )?SYNC START/m;

const trimToRunBoundary = (data) => {
   const tail = data.substring(data.length - KEEP_BYTES);
   const m = RUN_HEADER.exec(tail);
   return m ? tail.substring(m.index) : tail;
};

// Die Actual-Bibliothek schreibt ganze Objekt-Dumps nach STDOUT (tausende eingerückte Zeilen pro Lauf).
// Sie enthalten nichts, was die Auswertung braucht, also entfernen und die Anzahl vermerken.
const compactStdout = (text) => {
   let dropped = 0;
   const kept = [];
   for (const line of text.split('\n')) {
      if (/^\s/.test(line) || /^[}\]],?$/.test(line)) {
         dropped++;
      } else {
         kept.push(line);
      }
   }
   if (dropped) kept.push(`[${dropped} Zeilen Debug-Ausgabe entfernt]`);
   return kept.join('\n');
};

const appendRun = (logFile, content) => {
   fs.appendFileSync(logFile, content, 'utf8');
   if (fs.statSync(logFile).size > MAX_BYTES) {
      fs.writeFileSync(logFile, trimToRunBoundary(fs.readFileSync(logFile, 'utf8')), 'utf8');
   }
};

// Startet main.js, schreibt den Lauf ins sync.log und liefert {code, output, errorOutput}.
// title: Text der Kopfzeile, z. B. 'CRON SYNC START'. forward: Ausgabe zusätzlich ans Terminal.
const runSync = (args, title, { forward = false } = {}) =>
   new Promise((resolve) => {
      const child = spawn('node', [path.join(__dirname, '..', 'main.js'), ...args], { stdio: 'pipe' });
      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (chunk) => {
         output += chunk;
         if (forward) process.stdout.write(chunk);
      });
      child.stderr.on('data', (chunk) => {
         errorOutput += chunk;
         if (forward) process.stderr.write(chunk);
      });

      child.on('close', (code) => {
         const timestamp = new Date().toLocaleString('de-DE');
         const block = `\n[${timestamp}] --- ${title} ---\nSTDOUT:\n${compactStdout(output.trim())}\nSTDERR:\n${errorOutput.trim()}\nEXIT: ${code ?? 'killed'}\n--- SYNC END ---\n`;
         try {
            appendRun(LOG_FILE, block);
         } catch (e) {
            console.error('Error writing sync.log:', e);
         }
         resolve({ code, output, errorOutput });
      });
   });

const ERROR_RE = /fehler|error|failed|unhandled|nicht gesetzt|keine banken/i;
const WARN_RE = /kein fints|keine fints|warnung|warning|fehl-match|übersprungen|deduplizierungs/i;
const DUMP_RE = /^[\w$]+: |^[{}\[\]],?$/;
const HEADER_RE = /^\[(.*?)\] --- (CRON SYNC START|SYNC START)(?: \(Range: (.*?) to (.*?)\))? ---\s*$/;

const finishRun = (r) => {
   const stdout = r.stdout.join('\n').trim();
   const stderr = r.stderr.join('\n').trim();
   let results = [];
   for (const l of r.stdout) {
      const t = l.trim();
      if (t.startsWith('[') && t.endsWith(']')) {
         try {
            const parsed = JSON.parse(t);
            if (Array.isArray(parsed)) results = parsed;
         } catch { /* kein JSON */ }
      }
   }
   const errors = [];
   const warnings = [];
   for (const l of [...r.stderr, ...r.stdout]) {
      const t = l.trim();
      if (!t || (t.startsWith('[') && t.endsWith(']') && t.length > 2 && t[1] === '{')) continue;
      // Objekt-Dumps der Actual-Bibliothek (eingerückt bzw. "key: value,") sind keine Meldungen
      if (/^\s/.test(l) || DUMP_RE.test(t)) continue;
      if (t.startsWith('[Reconciliation-Fehler]') || (ERROR_RE.test(t) && !WARN_RE.test(t))) errors.push(t);
      else if (WARN_RE.test(t)) warnings.push(t);
   }
   if (r.exit !== undefined && r.exit !== '0') {
      errors.unshift(`Prozess mit Exit-Code ${r.exit} beendet`);
   }
   const added = results.reduce((n, a) => n + (a.added || 0), 0);
   const ignored = results.reduce((n, a) => n + (a.ignored || 0), 0);
   return { timestamp: r.timestamp, cron: r.cron, range: r.range, exit: r.exit, stdout, stderr, results, errors, warnings, added, ignored };
};

// Zerlegt sync.log in einzelne Läufe (Cron und manuell), neueste zuerst.
const parseRuns = (raw) => {
   const runs = [];
   let cur = null;
   let section = 'stdout';
   const finish = () => {
      if (cur) runs.push(finishRun(cur));
      cur = null;
   };
   for (const line of raw.split('\n')) {
      const m = line.match(HEADER_RE);
      if (m) {
         finish();
         cur = { timestamp: m[1], cron: m[2] === 'CRON SYNC START', range: m[3] ? `${m[3]} – ${m[4]}` : '', stdout: [], stderr: [] };
         section = 'stdout';
      } else if (cur) {
         const t = line.trim();
         if (t === 'STDOUT:') section = 'stdout';
         else if (t === 'STDERR:') section = 'stderr';
         else if (t === '--- SYNC END ---') finish();
         else if (section === 'stderr' && /^EXIT: /.test(t)) cur.exit = t.slice(6);
         else cur[section].push(line);
      }
   }
   finish();
   return runs.reverse();
};

module.exports = { LOG_FILE, runSync, parseRuns, compactStdout, trimToRunBoundary };
