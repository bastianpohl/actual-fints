const { spawn } = require('node:child_process');
const path = require('node:path');
const { appendRun, compactStdout } = require('./utils/synclog');

const LOG_FILE = path.join(__dirname, 'sync.log');
const args = process.argv.slice(2);

// Unter Cron (kein Terminal) nichts weiterreichen: Die Ausgabe landet sonst als Mail an root.
// Alles Relevante steht in sync.log.
const interactive = Boolean(process.stdout.isTTY);

if (interactive) console.log(`[Cron/CLI Sync Wrapper] Starting main.js with args: ${args.join(' ')}`);

const child = spawn('node', [path.join(__dirname, 'main.js'), ...args], { stdio: 'pipe' });

let output = '';
let errorOutput = '';

child.stdout.on('data', (chunk) => {
   output += chunk;
   if (interactive) process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
   errorOutput += chunk;
   if (interactive) process.stderr.write(chunk);
});

child.on('close', (code) => {
   const timestamp = new Date().toLocaleString('de-DE');
   const logContent = `\n[${timestamp}] --- CRON SYNC START ---\nSTDOUT:\n${compactStdout(output.trim())}\nSTDERR:\n${errorOutput.trim()}\nEXIT: ${code ?? 'killed'}\n--- SYNC END ---\n`;
   
   try {
      appendRun(LOG_FILE, logContent);
   } catch (e) {
      console.error("Error writing sync.log in cron-run.js:", e);
   }

   // Bei Fehlschlag genau eine Zeile, damit Cron eine kurze Mail schickt
   if (!interactive && code !== 0) {
      console.error(`Sync fehlgeschlagen (Exit-Code ${code ?? 'killed'}), Details in sync.log`);
   }

   process.exit(code);
});
