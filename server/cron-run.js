const { runSync } = require('./utils/synclog');

const args = process.argv.slice(2);

// Unter Cron (kein Terminal) nichts weiterreichen: Die Ausgabe landet sonst als Mail an root.
// Alles Relevante steht in sync.log.
const interactive = Boolean(process.stdout.isTTY);

if (interactive) console.log(`[Cron/CLI Sync Wrapper] Starting main.js with args: ${args.join(' ')}`);

runSync(args, 'CRON SYNC START', { forward: interactive }).then(({ code }) => {
   // Bei Fehlschlag genau eine Zeile, damit Cron eine kurze Mail schickt
   if (!interactive && code !== 0) {
      console.error(`Sync fehlgeschlagen (Exit-Code ${code ?? 'killed'}), Details in sync.log`);
   }
   process.exit(code);
});
