const express = require('express');
const { spawn } = require('node:child_process');

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


app.post('/api/transactions/load', (req, res) => {
   const { start, end } = req.body ?? {};

   console.log(`Loading transactions from ${start} to ${end}...`);

   const child = spawn('node', ['main.js', '--start', start, '--end', end], { stdio: 'pipe' });
   let output = '';
   let errorOutput = '';

   child.stdout.on('data', (chunk) => (output += chunk));
   child.stderr.on('data', (chunk) => (errorOutput += chunk));

   child.on('close', (code) => {
      if (code === 0) return res.json({ output: output.trim() });
      return res.status(500).json({ error: errorOutput.trim() || 'main.js failed' });
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

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
   console.log(`REST API listening on port ${PORT}`);
});