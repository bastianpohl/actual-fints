const express = require('express');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const { CredentialsStore } = require('./lib/credentials-store');

const app = express();
app.use(express.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'actual-fints-api';
const LOG_FILE = path.join(__dirname, 'sync.log');
const ENV_FILE = path.join(__dirname, '.env');

const runCommand = (command, args = [], options = {}) => {
   return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'pipe', ...options });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => (stdout += chunk));
      child.stderr?.on('data', (chunk) => (stderr += chunk));

      child.on('error', reject);
      child.on('close', (code) => {
         resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });
   });
};

const restartServiceInBackground = () => {
   if (!SERVICE_NAME) {
      console.log('SERVICE_NAME not set; skipping service restart.');
      return;
   }

   setImmediate(() => {
      console.log(`Restarting ${SERVICE_NAME} in background...`);
      runCommand('sudo', ['systemctl', 'restart', SERVICE_NAME])
         .then((result) => {
            if (result.code === 0) {
               console.log(`Restarted ${SERVICE_NAME}: ${result.stdout || 'ok'}`);
            } else {
               console.error(`Restart ${SERVICE_NAME} failed: ${result.stderr || result.stdout || `exit ${result.code}`}`);
            }
         })
         .catch((error) => {
            console.error(`Error restarting ${SERVICE_NAME}:`, error);
         });
   });
};

// ── Web UI Support API Endpoints ─────────────────────────────────────

// GET /api/status - Get current configuration status and latest logs meta
app.get('/api/status', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   const status = {
      actualBudgetConfigured: !!(process.env.AB_URL && process.env.AB_PASS && process.env.AB_SYNC_DB),
      masterKeyConfigured: !!masterKey,
      bankCount: 0,
      accountCount: 0,
      lastSync: null,
   };

   if (masterKey) {
      const store = new CredentialsStore(masterKey);
      try {
         const banks = store.listBanks() || [];
         status.bankCount = banks.length;
         status.accountCount = banks.reduce((sum, b) => sum + (b.accountCount || 0), 0);
      } catch (err) {
         status.dbError = err.message;
      } finally {
         store.close();
      }
   }

   if (fs.existsSync(LOG_FILE)) {
      try {
         const stats = fs.statSync(LOG_FILE);
         status.lastSync = stats.mtime.toISOString();
      } catch (e) {
         // Ignore stats error
      }
   }

   return res.json(status);
});

// GET /api/banks - Retrieve all banks and masked account configurations
app.get('/api/banks', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const store = new CredentialsStore(masterKey);
   try {
      const banks = store.getAllBanks();
      // Mask the PIN and sensitive fields for security on display, but keep other parts
      const safeBanks = banks.map(b => ({
         ...b,
         fints: {
            url: b.fints.url,
            blz: b.fints.blz,
            login: b.fints.login,
            pin: '●●●●●●●●', // Do not return the actual pin over the API
         }
      }));
      return res.json(safeBanks);
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      store.close();
   }
});

// POST /api/banks - Add a new bank configuration
app.post('/api/banks', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const { name, url, blz, login, pin, accounts } = req.body ?? {};
   if (!name || !url || !blz || !login || !pin) {
      return res.status(400).json({ error: 'Alle Felder (Name, URL, BLZ, Login, PIN) sind erforderlich.' });
   }

   const store = new CredentialsStore(masterKey);
   try {
      const bankId = store.addBank({ name, url, blz, login, pin, accounts });
      return res.json({ success: true, bankId });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      store.close();
   }
});

// PUT /api/banks/:name - Update an existing bank configuration
app.put('/api/banks/:name', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const { name } = req.params;
   const { url, blz, login, pin, accounts, name: newName } = req.body ?? {};

   const store = new CredentialsStore(masterKey);
   try {
      const updates = {};
      if (url) updates.url = url;
      if (blz) updates.blz = blz;
      if (login) updates.login = login;
      if (pin && pin !== '●●●●●●●●') updates.pin = pin; // Only update if actual new pin provided
      if (newName) updates.name = newName;
      if (accounts) updates.accounts = accounts;

      store.updateBank(name, updates);
      return res.json({ success: true });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      store.close();
   }
});

// DELETE /api/banks/:name - Delete a bank configuration
app.delete('/api/banks/:name', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const { name } = req.params;
   const store = new CredentialsStore(masterKey);
   try {
      const deleted = store.removeBank(name);
      return res.json({ success: deleted });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      store.close();
   }
});

// GET /api/logs - Get sync logs
app.get('/api/logs', (req, res) => {
   try {
      if (!fs.existsSync(LOG_FILE)) {
         return res.json({ logs: 'Noch keine Logs aufgezeichnet.' });
      }
      const logs = fs.readFileSync(LOG_FILE, 'utf8');
      return res.json({ logs: logs.trim() });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   }
});

// Helper functions for reading and writing .env values
const getEnvValue = (key) => {
   if (!fs.existsSync(ENV_FILE)) return process.env[key] ?? '';
   const content = fs.readFileSync(ENV_FILE, 'utf8');
   const lines = content.split('\n');
   for (const line of lines) {
      const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?(.*?)["']?\\s*$`));
      if (match) {
         return match[1];
      }
   }
   return process.env[key] ?? '';
};

const setEnvValue = (key, value) => {
   if (!fs.existsSync(ENV_FILE)) {
      fs.writeFileSync(ENV_FILE, `${key}="${value}"\n`, 'utf8');
      return;
   }
   const content = fs.readFileSync(ENV_FILE, 'utf8');
   const lines = content.split('\n');
   let found = false;
   const newLines = lines.map(line => {
      const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*.*`));
      if (match) {
         found = true;
         return `${key}="${value}"`;
      }
      return line;
   });
   if (!found) {
      newLines.push(`${key}="${value}"`);
   }
   fs.writeFileSync(ENV_FILE, newLines.join('\n'), 'utf8');
};

// GET /api/notifications/topic - Retrieve the current ntfy topic
app.get('/api/notifications/topic', (req, res) => {
   try {
      const topic = getEnvValue('NTFY_TOPIC');
      return res.json({ topic });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   }
});

// POST /api/notifications/topic - Save the ntfy topic and restart the api service in the background
app.post('/api/notifications/topic', (req, res) => {
   const { topic } = req.body ?? {};
   if (topic === undefined) {
      return res.status(400).json({ error: 'Topic ist erforderlich.' });
   }

   try {
      setEnvValue('NTFY_TOPIC', topic.trim());
      res.json({ success: true, topic: topic.trim() });

      // Restart service to pick up the new env variable
      restartServiceInBackground();
   } catch (err) {
      return res.status(500).json({ error: err.message });
   }
});

// ── Main Execution Endpoints ────────────────────────────────────────

app.post('/api/transactions/load', (req, res) => {
   const { start, end } = req.body ?? {};

   if (start && !DATE_REGEX.test(start)) {
      return res.status(400).json({ error: 'Ungültiges Startdatum-Format. Erwartet wird YYYY-MM-DD.' });
   }
   if (end && !DATE_REGEX.test(end)) {
      return res.status(400).json({ error: 'Ungültiges Enddatum-Format. Erwartet wird YYYY-MM-DD.' });
   }

   console.log(`Loading transactions from ${start} to ${end}...`);

   const child = spawn('node', ['main.js', '--start', start, '--end', end], { stdio: 'pipe' });
   let output = '';
   let errorOutput = '';

   child.stdout.on('data', (chunk) => (output += chunk));
   child.stderr.on('data', (chunk) => (errorOutput += chunk));

   child.on('close', (code) => {
      const timestamp = new Date().toLocaleString('de-DE');
      const logContent = `\n[${timestamp}] --- SYNC START (Range: ${start || 'Heute'} to ${end || 'Heute'}) ---\nSTDOUT:\n${output.trim()}\nSTDERR:\n${errorOutput.trim()}\n--- SYNC END ---\n`;
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
         console.error("Error writing sync.log:", e);
      }

      if (code === 0) {
         let results = [];
         try {
            const lines = output.trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
               const line = lines[i].trim();
               if (line.startsWith('[') && line.endsWith(']')) {
                  results = JSON.parse(line);
                  break;
               }
            }
         } catch (e) {
            console.error("Failed to parse main.js stdout JSON results:", e);
         }
         return res.json({ success: true, results, output: output.trim() });
      }
      return res.status(500).json({ success: false, error: errorOutput.trim() || 'main.js failed' });
   });
});

app.put('/api/update/config', async (req, res) => {
   try {
      const pullResult = await runCommand('git', ['pull', '--ff-only']);
      if (pullResult.code !== 0) {
         throw new Error(pullResult.stderr || pullResult.stdout || 'git pull failed');
      }

      res.json({ output: pullResult.stdout || 'git pull completed.' });
      restartServiceInBackground();
      return;
   } catch (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
   }
});

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = process.env.PORT ?? 3000;

const certPath = process.env.HTTPS_CERT_PATH;
const keyPath = process.env.HTTPS_KEY_PATH;

if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
   const https = require('node:https');
   const options = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
   };
   https.createServer(options, app).listen(PORT, HOST, () => {
      console.log(`REST API listening securely on https://${HOST}:${PORT}`);
   });
} else {
   app.listen(PORT, HOST, () => {
      console.log(`REST API listening on http://${HOST}:${PORT}`);
   });
}