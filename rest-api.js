const express = require('express');
const { spawn } = require('node:child_process');
const { main } = require('./main');

const app = express();
app.use(express.json());

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'actual-fints-api';

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


app.post('/api/transactions/load', async (req, res) => {
   const { start, end } = req.body ?? {};

   // Inject date args into process.argv for parseDateRange
   const originalArgv = process.argv;
   process.argv = ['node', 'main.js'];
   if (start) process.argv.push('--start', start);
   if (end) process.argv.push('--end', end);

   try {
      const results = await main();

      if (!results || results.length === 0) {
         return res.json({ message: 'Keine neuen Umsätze.' });
      }

      return res.json({ accounts: results });
   } catch (error) {
      console.error('Fehler beim Laden der Transaktionen:', error.message);
      return res.status(500).json({ error: 'Transaktionsabruf fehlgeschlagen.' });
   } finally {
      process.argv = originalArgv;
   }
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
      console.error('Config-Update Fehler:', error.message);
      return res.status(500).json({ error: 'Konfigurations-Update fehlgeschlagen.' });
   }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
   console.log(`REST API listening on port ${PORT}`);
});