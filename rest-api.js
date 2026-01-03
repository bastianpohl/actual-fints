const express = require('express');
const { spawn } = require('node:child_process');

const app = express();
app.use(express.json());


app.post('/api/transactions/load', (req, res) => {
   const { start, end } = req.body ?? {};

   console.log(`Loading transactions from ${start} to ${end}...`);

   const child = spawn('node', ['main.js', '--start', String(start), '--end', String(end)], { stdio: 'pipe' });
   let output = '';
   let errorOutput = '';

   child.stdout.on('data', (chunk) => (output += chunk));
   child.stderr.on('data', (chunk) => (errorOutput += chunk));

   child.on('close', (code) => {
      if (code === 0) return res.json({ output: output.trim() });
      return res.status(500).json({ error: errorOutput.trim() || 'main.js failed' });
   });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
   console.log(`REST API listening on port ${PORT}`);
});