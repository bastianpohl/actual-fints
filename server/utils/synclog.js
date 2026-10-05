const fs = require('node:fs');

// Ein einzelner Lauf kann durch Objekt-Dumps der Actual-Bibliothek >30 KB groß sein,
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

module.exports = { appendRun, compactStdout, trimToRunBoundary };
