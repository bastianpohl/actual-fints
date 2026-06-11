const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LOG_FILE = path.join(__dirname, 'sync.log');
const args = process.argv.slice(2);

console.log(`[Cron/CLI Sync Wrapper] Starting main.js with args: ${args.join(' ')}`);

const child = spawn('node', [path.join(__dirname, 'main.js'), ...args], { stdio: 'pipe' });

let output = '';
let errorOutput = '';

child.stdout.on('data', (chunk) => {
   output += chunk;
   process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
   errorOutput += chunk;
   process.stderr.write(chunk);
});

child.on('close', (code) => {
   const timestamp = new Date().toLocaleString('de-DE');
   const logContent = `\n[${timestamp}] --- CRON SYNC START ---\nSTDOUT:\n${output.trim()}\nSTDERR:\n${errorOutput.trim()}\n--- SYNC END ---\n`;
   
   try {
      fs.appendFileSync(LOG_FILE, logContent, 'utf8');
      
      // Keep log file under 50KB to prevent endless growth
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > 50 * 1024) {
         const data = fs.readFileSync(LOG_FILE, 'utf8');
         const trimmed = data.substring(data.length - 30 * 1024); // Keep last 30KB
         fs.writeFileSync(LOG_FILE, trimmed, 'utf8');
      }
   } catch (e) {
      console.error("Error writing sync.log in cron-run.js:", e);
   }

   process.exit(code);
});
