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

const appendRun = (logFile, content) => {
   fs.appendFileSync(logFile, content, 'utf8');
   if (fs.statSync(logFile).size > MAX_BYTES) {
      fs.writeFileSync(logFile, trimToRunBoundary(fs.readFileSync(logFile, 'utf8')), 'utf8');
   }
};

module.exports = { appendRun, trimToRunBoundary };
