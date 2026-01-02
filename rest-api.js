import express from 'express';
import { spawn } from 'node:child_process';

const app = express();
app.use(express.json());

app.post('/run', (req, res) => {
   const { start, end } = req.body ?? {};
   if (typeof start === 'undefined' || typeof end === 'undefined') {
      return res.status(400).json({ error: 'Missing start or end' });
   }

   const child = spawn('node', ['main.js', String(start), String(end)], { stdio: 'pipe' });
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