const util = require('node:util');
util.inspect.defaultOptions.depth = 5;

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
      const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
      const cmd = isRoot ? 'systemctl' : 'sudo';
      const args = isRoot ? ['restart', SERVICE_NAME] : ['systemctl', 'restart', SERVICE_NAME];

      runCommand(cmd, args)
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

// ── WebAuthn & JWT Security Engine ───────────────────────────────────
const {
   generateRegistrationOptions,
   verifyRegistrationResponse,
   generateAuthenticationOptions,
   verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const crypto = require('node:crypto');
const webpush = require('web-push');

let vapidKeys = null;
function getVapidKeys() {
   if (vapidKeys) return vapidKeys;
   
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) {
      console.warn('WARNUNG: MASTER_KEY ist nicht konfiguriert. Kann VAPID-Schlüssel nicht laden.');
      return null;
   }
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      let keysJson = store.getEncryptedConfig('auth_vapid_keys');
      if (!keysJson) {
         console.log('Generiere neue persistenten VAPID-Schlüssel...');
         const newKeys = webpush.generateVAPIDKeys();
         keysJson = JSON.stringify(newKeys);
         store.setEncryptedConfig('auth_vapid_keys', keysJson);
      }
      vapidKeys = JSON.parse(keysJson);
      
      const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:bastian@pohl.info';
      webpush.setVapidDetails(
         vapidSubject,
         vapidKeys.publicKey,
         vapidKeys.privateKey
      );
      
      return vapidKeys;
   } catch (err) {
      console.error('Fehler beim Initialisieren der VAPID-Schlüssel:', err);
      return null;
   } finally {
      if (store) store.close();
   }
}

const JWT_SECRET = crypto.randomBytes(32);
const SESSION_COOKIE_NAME = 'actual_fints_session';
const activeChallenges = new Map();

function cleanExpiredChallenges() {
   const now = Date.now();
   for (const [key, value] of activeChallenges.entries()) {
      if (value.expiresAt < now) {
         activeChallenges.delete(key);
      }
   }
}

function base64urlEncode(strOrBuffer) {
   const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
   return buf.toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
}

function base64urlDecode(str) {
   let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
   while (base64.length % 4) {
      base64 += '=';
   }
   return Buffer.from(base64, 'base64').toString('utf8');
}

function signToken(payload, secret) {
   const header = { alg: 'HS256', typ: 'JWT' };
   const encodedHeader = base64urlEncode(JSON.stringify(header));
   const encodedPayload = base64urlEncode(JSON.stringify(payload));
   
   const hmac = crypto.createHmac('sha256', secret);
   hmac.update(`${encodedHeader}.${encodedPayload}`);
   const signature = base64urlEncode(hmac.digest());
   
   return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token, secret) {
   try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const [encodedHeader, encodedPayload, signature] = parts;
      
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(`${encodedHeader}.${encodedPayload}`);
      const expectedSignature = base64urlEncode(hmac.digest());
      
      if (signature !== expectedSignature) {
         return null;
      }
      
      const payload = JSON.parse(base64urlDecode(encodedPayload));
      if (payload.exp && Date.now() > payload.exp) {
         return null;
      }
      
      return payload;
   } catch (error) {
      return null;
   }
}

function getSessionCookie(req) {
   const cookieHeader = req.headers.cookie;
   if (!cookieHeader) return null;
   
   const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, val] = cookie.trim().split('=');
      if (key && val) {
         acc[key] = decodeURIComponent(val);
      }
      return acc;
   }, {});
   
   return cookies[SESSION_COOKIE_NAME] || null;
}

function authMiddleware(req, res, next) {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) {
      return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   }

   let store;
   let passkeysJson;
   try {
      store = new CredentialsStore(masterKey);
      passkeysJson = store.getEncryptedConfig('auth_passkeys');
   } catch (error) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + error.message });
   } finally {
      if (store) store.close();
   }

   // If NO passkeys are configured, anyone can access to perform first-time setup!
   if (!passkeysJson) {
      return next();
   }

   // Session verification
   const token = getSessionCookie(req);
   if (!token) {
      return res.status(401).json({ error: 'Nicht autorisiert: Keine aktive Sitzung.' });
   }

   const session = verifyToken(token, JWT_SECRET);
   if (!session) {
      res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      return res.status(401).json({ error: 'Nicht autorisiert: Sitzung abgelaufen.' });
   }

   req.session = session;
   next();
}

// Global API Shield Middleware
app.use((req, res, next) => {
   const publicPaths = [
      '/api/auth/status',
      '/api/auth/login-challenge',
      '/api/auth/login-verify',
   ];
   
   if (req.path.startsWith('/api/') && !publicPaths.includes(req.path)) {
      // Setup/Registration endpoints are only public if no passkeys are configured yet
      if (req.path === '/api/auth/register-challenge' || req.path === '/api/auth/register-verify') {
         const masterKey = process.env.MASTER_KEY;
         if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
         
         let store;
         let passkeysJson;
         try {
            store = new CredentialsStore(masterKey);
            passkeysJson = store.getEncryptedConfig('auth_passkeys');
         } catch (err) {
            return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
         } finally {
            if (store) store.close();
         }
         
         if (passkeysJson) {
            return authMiddleware(req, res, next);
         } else {
            return next();
         }
      }
      
      return authMiddleware(req, res, next);
   }
   
   next();
});

// --- WebAuthn Authentication Routes ---

app.get('/api/auth/status', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   let passkeysJson = null;
   try {
      store = new CredentialsStore(masterKey);
      passkeysJson = store.getEncryptedConfig('auth_passkeys');
   } catch (err) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
   
   const token = getSessionCookie(req);
   const session = token ? verifyToken(token, JWT_SECRET) : null;
   
   res.json({
      configured: !!passkeysJson,
      authenticated: !!session
   });
});

app.post('/api/auth/register-challenge', async (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   let existingPasskeys = [];
   try {
      store = new CredentialsStore(masterKey);
      const passkeysJson = store.getEncryptedConfig('auth_passkeys');
      if (passkeysJson) {
         existingPasskeys = JSON.parse(passkeysJson);
      }
   } catch (err) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
   
   const rpId = req.hostname;
   
   try {
      const options = await generateRegistrationOptions({
         rpName: 'Actual-FinTS Connector',
         rpID: rpId,
         userID: Uint8Array.from('admin-user-id', c => c.charCodeAt(0)),
         userName: 'admin',
         userDisplayName: 'Admin',
         attestationType: 'none',
         authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'preferred',
         },
         excludeCredentials: existingPasskeys.map(passkey => ({
            id: passkey.credentialID,
            type: 'public-key',
         })),
      });
      
      const challengeId = crypto.randomUUID();
      activeChallenges.set(challengeId, {
         challenge: options.challenge,
         userId: 'admin-user-id',
         type: 'registration',
         expiresAt: Date.now() + 5 * 60 * 1000
      });
      
      res.json({
         options,
         challengeId
      });
   } catch (err) {
      console.error('Registration challenge generation failed:', err);
      res.status(500).json({ error: 'Challenge-Generierung fehlgeschlagen: ' + err.message });
   }
});

app.post('/api/auth/register-verify', async (req, res) => {
   cleanExpiredChallenges();
   
   const { body, challengeId, deviceName } = req.body;
   if (!body || !challengeId) {
      return res.status(400).json({ error: 'Fehlende Parameter.' });
   }
   
   const saved = activeChallenges.get(challengeId);
   if (!saved || saved.type !== 'registration') {
      return res.status(400).json({ error: 'Ungültige oder abgelaufene Challenge.' });
   }
   activeChallenges.delete(challengeId);
   
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   let existingPasskeys = [];
   try {
      store = new CredentialsStore(masterKey);
      const passkeysJson = store.getEncryptedConfig('auth_passkeys');
      if (passkeysJson) {
         existingPasskeys = JSON.parse(passkeysJson);
      }
   } catch (err) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   }
   
   const rpId = req.hostname;
   const expectedOrigin = [
      `${req.protocol}://${req.get('host')}`,
      `https://${req.get('host')}`,
      `http://${req.get('host')}`
   ];
   if (req.headers.origin && !expectedOrigin.includes(req.headers.origin)) {
      expectedOrigin.push(req.headers.origin);
   }
   
   try {
      const verification = await verifyRegistrationResponse({
         response: body,
         expectedChallenge: saved.challenge,
         expectedOrigin,
         expectedRPID: rpId,
      });
      
      if (verification.verified && verification.registrationInfo) {
         const { credential } = verification.registrationInfo;
         
         const newPasskey = {
            credentialID: credential.id,
            publicKey: Buffer.from(credential.publicKey).toString('base64'),
            counter: credential.counter,
            transports: body.response.transports || [],
            deviceName: deviceName || body.authenticatorAttachment || 'Unbekanntes Gerät',
            createdAt: new Date().toISOString()
         };
         
         existingPasskeys.push(newPasskey);
         store.setEncryptedConfig('auth_passkeys', JSON.stringify(existingPasskeys));
         
         // Automatisches Login nach Registrierung
         const token = signToken({
            userId: 'admin-user-id',
            username: 'admin',
            exp: Date.now() + 30 * 24 * 60 * 60 * 1000
         }, JWT_SECRET);
         
         res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`);
         res.json({ verified: true });
      } else {
         res.status(400).json({ error: 'Verifizierung fehlgeschlagen.' });
      }
   } catch (err) {
      console.error('Registration verification failed:', err);
      res.status(400).json({ error: 'Registrierung fehlgeschlagen: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

app.post('/api/auth/login-challenge', async (req, res) => {
   cleanExpiredChallenges();
   
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   let existingPasskeys = [];
   try {
      store = new CredentialsStore(masterKey);
      const passkeysJson = store.getEncryptedConfig('auth_passkeys');
      if (!passkeysJson) {
         return res.status(400).json({ error: 'Keine Passkeys registriert.' });
      }
      existingPasskeys = JSON.parse(passkeysJson);
   } catch (err) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
   
   const rpId = req.hostname;
   
   try {
      const options = await generateAuthenticationOptions({
         rpID: rpId,
         allowCredentials: existingPasskeys.map(passkey => ({
            id: passkey.credentialID,
            type: 'public-key',
            transports: passkey.transports,
         })),
         userVerification: 'preferred',
      });
      
      const challengeId = crypto.randomUUID();
      activeChallenges.set(challengeId, {
         challenge: options.challenge,
         userId: 'admin-user-id',
         type: 'login',
         expiresAt: Date.now() + 5 * 60 * 1000
      });
      
      res.json({
         options,
         challengeId
      });
   } catch (err) {
      console.error('Authentication challenge generation failed:', err);
      res.status(500).json({ error: 'Login-Challenge konnte nicht generiert werden: ' + err.message });
   }
});

app.post('/api/auth/login-verify', async (req, res) => {
   cleanExpiredChallenges();
   
   const { body, challengeId } = req.body;
   if (!body || !challengeId) {
      return res.status(400).json({ error: 'Fehlende Parameter.' });
   }
   
   const saved = activeChallenges.get(challengeId);
   if (!saved || saved.type !== 'login') {
      return res.status(400).json({ error: 'Ungültige oder abgelaufene Challenge.' });
   }
   activeChallenges.delete(challengeId);
   
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   let existingPasskeys = [];
   try {
      store = new CredentialsStore(masterKey);
      const passkeysJson = store.getEncryptedConfig('auth_passkeys');
      if (!passkeysJson) {
         return res.status(400).json({ error: 'Keine Passkeys registriert.' });
      }
      existingPasskeys = JSON.parse(passkeysJson);
   } catch (err) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   }
   
   const rpId = req.hostname;
   const expectedOrigin = [
      `${req.protocol}://${req.get('host')}`,
      `https://${req.get('host')}`,
      `http://${req.get('host')}`
   ];
   if (req.headers.origin && !expectedOrigin.includes(req.headers.origin)) {
      expectedOrigin.push(req.headers.origin);
   }
   
   const passkey = existingPasskeys.find(pk => pk.credentialID === body.id);
   if (!passkey) {
      if (store) store.close();
      return res.status(400).json({ error: 'Passkey nicht in Datenbank gefunden.' });
   }
   
   try {
      const verification = await verifyAuthenticationResponse({
         response: body,
         expectedChallenge: saved.challenge,
         expectedOrigin,
         expectedRPID: rpId,
         credential: {
            id: passkey.credentialID,
            publicKey: Buffer.from(passkey.publicKey, 'base64'),
            counter: passkey.counter,
            transports: passkey.transports
         }
      });
      
      if (verification.verified && verification.authenticationInfo) {
         passkey.counter = verification.authenticationInfo.newCounter;
         store.setEncryptedConfig('auth_passkeys', JSON.stringify(existingPasskeys));
         
         const token = signToken({
            userId: 'admin-user-id',
            username: 'admin',
            exp: Date.now() + 30 * 24 * 60 * 60 * 1000
         }, JWT_SECRET);
         
         res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`);
         res.json({ verified: true });
      } else {
         res.status(400).json({ error: 'Verifizierung fehlgeschlagen.' });
      }
   } catch (err) {
      console.error('Authentication verification failed:', err);
      res.status(400).json({ error: 'Login-Verifizierung fehlgeschlagen: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

app.post('/api/auth/logout', (req, res) => {
   res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
   res.json({ success: true });
});

app.get('/api/auth/devices', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   let existingPasskeys = [];
   try {
      store = new CredentialsStore(masterKey);
      const passkeysJson = store.getEncryptedConfig('auth_passkeys');
      if (passkeysJson) {
         existingPasskeys = JSON.parse(passkeysJson);
      }
   } catch (err) {
      return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
   
   res.json(existingPasskeys.map(pk => ({
      deviceName: pk.deviceName,
      createdAt: pk.createdAt,
      credentialID: pk.credentialID
   })));
});

app.delete('/api/auth/devices/:id', (req, res) => {
   const credentialID = req.params.id;
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const passkeysJson = store.getEncryptedConfig('auth_passkeys');
      if (passkeysJson) {
         let existingPasskeys = JSON.parse(passkeysJson);
         existingPasskeys = existingPasskeys.filter(pk => pk.credentialID !== credentialID);
         
         if (existingPasskeys.length > 0) {
            store.setEncryptedConfig('auth_passkeys', JSON.stringify(existingPasskeys));
         } else {
            store.deleteConfig('auth_passkeys');
         }
         res.json({ success: true });
      } else {
         res.status(404).json({ error: 'Keine Geräte gefunden.' });
      }
   } catch (err) {
      res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

// --- PWA Web-Push Endpoints ---

app.get('/api/auth/push-vapid-public', (req, res) => {
   const keys = getVapidKeys();
   if (!keys) {
      return res.status(500).json({ error: 'VAPID-Schlüssel konnten nicht geladen werden.' });
   }
   res.json({ publicKey: keys.publicKey });
});

app.post('/api/auth/push-subscribe', (req, res) => {
   const { subscription, deviceName, platform } = req.body;
   if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Ungültiges Abonnement-Objekt.' });
   }
   
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const subsJson = store.getEncryptedConfig('auth_push_subscriptions');
      let subscriptions = subsJson ? JSON.parse(subsJson) : [];
      
      // Remove existing subscription with same endpoint if exists
      subscriptions = subscriptions.filter(s => s.subscription.endpoint !== subscription.endpoint);
      
      subscriptions.push({
         subscription,
         deviceName: deviceName || 'Unbekanntes Gerät',
         platform: platform || 'Browser',
         createdAt: new Date().toISOString()
      });
      
      store.setEncryptedConfig('auth_push_subscriptions', JSON.stringify(subscriptions));
      res.json({ success: true });
   } catch (err) {
      res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

app.post('/api/auth/push-unsubscribe', (req, res) => {
   const { endpoint } = req.body;
   if (!endpoint) {
      return res.status(400).json({ error: 'Endpunkt fehlt.' });
   }
   
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const subsJson = store.getEncryptedConfig('auth_push_subscriptions');
      if (subsJson) {
         let subscriptions = JSON.parse(subsJson);
         subscriptions = subscriptions.filter(s => s.subscription.endpoint !== endpoint);
         
         if (subscriptions.length > 0) {
            store.setEncryptedConfig('auth_push_subscriptions', JSON.stringify(subscriptions));
         } else {
            store.deleteConfig('auth_push_subscriptions');
         }
      }
      res.json({ success: true });
   } catch (err) {
      res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

app.get('/api/auth/push-subscriptions', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const subsJson = store.getEncryptedConfig('auth_push_subscriptions');
      const subscriptions = subsJson ? JSON.parse(subsJson) : [];
      res.json(subscriptions.map(s => ({
         deviceName: s.deviceName,
         platform: s.platform,
         createdAt: s.createdAt,
         endpoint: s.subscription.endpoint
      })));
   } catch (err) {
      res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

app.post('/api/auth/push-test', async (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht konfiguriert.' });
   
   const keys = getVapidKeys();
   if (!keys) {
      return res.status(500).json({ error: 'VAPID-Schlüssel konnten nicht geladen werden.' });
   }
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const subsJson = store.getEncryptedConfig('auth_push_subscriptions');
      const subscriptions = subsJson ? JSON.parse(subsJson) : [];
      
      if (subscriptions.length === 0) {
         return res.status(400).json({ error: 'Keine Geräte für Web-Push abonniert.' });
      }
      
      const payload = JSON.stringify({
         title: 'PWA Web-Push 🔔',
         body: 'Herzlichen Glückwunsch! Deine PWA Web-Push-Verbindung funktioniert einwandfrei!'
      });
      
      const results = [];
      let dbChanged = false;
      let activeSubscriptions = [...subscriptions];
      
      for (const sub of subscriptions) {
         try {
            await webpush.sendNotification(sub.subscription, payload);
            results.push({ deviceName: sub.deviceName, status: 'Erfolgreich' });
         } catch (err) {
            console.error(`Fehler beim Senden an ${sub.deviceName}:`, err);
            if (err.statusCode === 410 || err.statusCode === 404) {
               activeSubscriptions = activeSubscriptions.filter(s => s.subscription.endpoint !== sub.subscription.endpoint);
               dbChanged = true;
               results.push({ deviceName: sub.deviceName, status: 'Entfernt (Inaktiv)' });
            } else {
               results.push({ deviceName: sub.deviceName, status: 'Fehler: ' + err.message });
            }
         }
      }
      
      if (dbChanged) {
         if (activeSubscriptions.length > 0) {
            store.setEncryptedConfig('auth_push_subscriptions', JSON.stringify(activeSubscriptions));
         } else {
            store.deleteConfig('auth_push_subscriptions');
         }
      }
      
      res.json({ success: true, results });
   } catch (err) {
      res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
   } finally {
      if (store) store.close();
   }
});

// ── Web UI Support API Endpoints ─────────────────────────────────────

// --- Cron Scheduler Helper Functions ---
const getCronSchedule = () => {
   const crontabPath = '/etc/crontab';
   if (fs.existsSync(crontabPath)) {
      try {
         const content = fs.readFileSync(crontabPath, 'utf8');
         const lines = content.split('\n');
         for (const line of lines) {
            if (line.includes('actual-fints') && (line.includes('npm start') || line.includes('main.js') || line.includes('cron-run.js'))) {
               const parts = line.trim().split(/\s+/);
               if (parts.length >= 6) {
                  return parts.slice(0, 5).join(' ');
               }
            }
         }
      } catch (e) {
         console.error('Error reading /etc/crontab:', e);
      }
   }
   return '59 7-23/4 * * 1-6';
};

const getLastCronSync = () => {
   if (fs.existsSync(LOG_FILE)) {
      try {
         const content = fs.readFileSync(LOG_FILE, 'utf8');
         const regex = /\[(.*?)\] --- CRON SYNC START ---/g;
         let lastTimestamp = null;
         let lastLog = '';
         
         const matches = [...content.matchAll(regex)];
         if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            lastTimestamp = lastMatch[1];
            
            const startIndex = lastMatch.index;
            const nextSyncIndex = content.indexOf('--- SYNC START', startIndex + lastMatch[0].length);
            const nextCronIndex = content.indexOf('--- CRON SYNC START', startIndex + lastMatch[0].length);
            let endIndex = content.length;
            
            if (nextSyncIndex !== -1 && nextCronIndex !== -1) {
               endIndex = Math.min(nextSyncIndex, nextCronIndex);
            } else if (nextSyncIndex !== -1) {
               endIndex = nextSyncIndex;
            } else if (nextCronIndex !== -1) {
               endIndex = nextCronIndex;
            }
            
            lastLog = content.substring(startIndex, endIndex).trim();
         }
         return { timestamp: lastTimestamp, log: lastLog };
      } catch (e) {
         console.error('Error reading last cron sync:', e);
      }
   }
   return { timestamp: null, log: '' };
};

const matchCronField = (field, value, min, max) => {
   if (field === '*') return true;
   const parts = field.split(',');
   for (const part of parts) {
      if (part.includes('/')) {
         const [range, stepStr] = part.split('/');
         const step = parseInt(stepStr, 10);
         let start = min;
         let end = max;
         if (range !== '*') {
            if (range.includes('-')) {
               const [s, e] = range.split('-');
               start = parseInt(s, 10);
               end = parseInt(e, 10);
            } else {
               start = parseInt(range, 10);
            }
         }
         if (value >= start && value <= end && (value - start) % step === 0) {
            return true;
         }
      } else if (part.includes('-')) {
         const [s, e] = part.split('-');
         const start = parseInt(s, 10);
         const end = parseInt(e, 10);
         if (value >= start && value <= end) return true;
      } else {
         if (parseInt(part, 10) === value) return true;
      }
   }
   return false;
};

const getNextCronDate = (cronExpr, fromDate = new Date()) => {
   const fields = cronExpr.trim().split(/\s+/);
   if (fields.length !== 5) {
      throw new Error('Invalid cron expression');
   }
   const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = fields;
   let testDate = new Date(fromDate.getTime());
   testDate.setSeconds(0);
   testDate.setMilliseconds(0);
   
   const maxMinutes = 30 * 24 * 60; // 30 days
   for (let i = 0; i < maxMinutes; i++) {
      testDate.setMinutes(testDate.getMinutes() + 1);
      
      const min = testDate.getMinutes();
      const hour = testDate.getHours();
      const dom = testDate.getDate();
      const month = testDate.getMonth() + 1;
      const dow = testDate.getDay();
      
      const matchMin = matchCronField(minExpr, min, 0, 59);
      const matchHour = matchCronField(hourExpr, hour, 0, 23);
      const matchDom = matchCronField(domExpr, dom, 1, 31);
      const matchMonth = matchCronField(monthExpr, month, 1, 12);
      
      let matchDow = false;
      if (dowExpr === '*' || dowExpr === '?') {
         matchDow = true;
      } else {
         matchDow = matchCronField(dowExpr, dow, 0, 7) || (dow === 0 && matchCronField(dowExpr, 7, 0, 7));
      }
      
      if (matchMin && matchHour && matchDom && matchMonth && matchDow) {
         return testDate;
      }
   }
   return null;
};

// GET /api/status - Get current configuration status and latest logs meta
app.get('/api/status', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   let actualBudgetConfigured = false;
   let bankCount = 0;
   let accountCount = 0;
   let dbError = null;

   if (masterKey) {
      let store;
      try {
         store = new CredentialsStore(masterKey);
         const banks = store.listBanks() || [];
         bankCount = banks.length;
         accountCount = banks.reduce((sum, b) => sum + (b.accountCount || 0), 0);

         // Read connection parameters from SQLite
         const abUrl = store.getConfig('actual_server_url');
         const abPass = store.getEncryptedConfig('actual_password');
         const abSync = store.getConfig('actual_sync_db');
         actualBudgetConfigured = !!(abUrl && abPass && abSync);
      } catch (err) {
         dbError = err.message;
      } finally {
         if (store) store.close();
      }
   }

   // Fallback to environment variables if not configured in SQLite
   if (!actualBudgetConfigured) {
      actualBudgetConfigured = !!(process.env.AB_URL && process.env.AB_PASS && process.env.AB_SYNC_DB);
   }

   const status = {
      actualBudgetConfigured,
      masterKeyConfigured: !!masterKey,
      bankCount,
      accountCount,
      lastSync: null,
   };

   if (dbError) {
      status.dbError = dbError;
   }

   if (fs.existsSync(LOG_FILE)) {
      try {
         const stats = fs.statSync(LOG_FILE);
         status.lastSync = stats.mtime.toISOString();
      } catch (e) {
         // Ignore stats error
      }
   }

   // Cron sync details
   const cronSchedule = getCronSchedule();
   const lastCronSync = getLastCronSync();
   let nextCronSync = null;
   try {
      const nextDate = getNextCronDate(cronSchedule);
      if (nextDate) {
         nextCronSync = nextDate.toISOString();
      }
   } catch (e) {
      console.error('Error calculating next cron date:', e);
   }

   status.cronSchedule = cronSchedule;
   status.lastCronSync = lastCronSync.timestamp;
   status.lastCronSyncLog = lastCronSync.log;
   status.nextCronSync = nextCronSync;

   return res.json(status);
});

// GET /api/banks - Retrieve all banks and masked account configurations
app.get('/api/banks', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   let store;
   try {
      store = new CredentialsStore(masterKey);
      const banks = store.getAllBanks();
      // Mask both PIN and Login/Username for security on display
      const safeBanks = banks.map(b => ({
         ...b,
         fints: {
            url: b.fints.url,
            blz: b.fints.blz,
            login: '●●●●●●●●', // Do not return raw login over the API
            pin: '●●●●●●●●', // Do not return raw PIN over the API
         }
      }));
      return res.json(safeBanks);
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      if (store) store.close();
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

   let store;
   try {
      store = new CredentialsStore(masterKey);
      const bankId = store.addBank({ name, url, blz, login, pin, accounts });
      return res.json({ success: true, bankId });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      if (store) store.close();
   }
});

// PUT /api/banks/:name - Update an existing bank configuration
app.put('/api/banks/:name', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const { name } = req.params;
   const { url, blz, login, pin, accounts, name: newName } = req.body ?? {};

   let store;
   try {
      store = new CredentialsStore(masterKey);
      const updates = {};
      if (url) updates.url = url;
      if (blz) updates.blz = blz;
      if (login && login !== '●●●●●●●●') updates.login = login; // Only update if actual new login provided
      if (pin && pin !== '●●●●●●●●') updates.pin = pin; // Only update if actual new pin provided
      if (newName) updates.name = newName;
      if (accounts) updates.accounts = accounts;

      store.updateBank(name, updates);
      return res.json({ success: true });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      if (store) store.close();
   }
});

// DELETE /api/banks/:name - Delete a bank configuration
app.delete('/api/banks/:name', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const { name } = req.params;
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const deleted = store.removeBank(name);
      return res.json({ success: deleted });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      if (store) store.close();
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

// GET /api/budget/config - Retrieve Actual Budget connection config
app.get('/api/budget/config', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   let store;
   try {
      store = new CredentialsStore(masterKey);
      let url = store.getConfig('actual_server_url') || '';
      let syncDb = store.getConfig('actual_sync_db') || '';
      let hasPassword = !!store.getEncryptedConfig('actual_password');

      // Fallback to process.env variables if database entries are not yet populated
      if (!url && !syncDb && !hasPassword) {
         url = process.env.AB_URL || '';
         syncDb = process.env.AB_SYNC_DB || '';
         hasPassword = !!process.env.AB_PASS;
      }

      return res.json({ url, syncDb, hasPassword });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      if (store) store.close();
   }
});

// POST /api/budget/config - Save Actual Budget connection config
app.post('/api/budget/config', (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   const { url, syncDb, password } = req.body ?? {};
   if (url === undefined || syncDb === undefined) {
      return res.status(400).json({ error: 'Server URL und Budget Sync ID sind erforderlich.' });
   }

   let store;
   try {
      store = new CredentialsStore(masterKey);
      store.setConfig('actual_server_url', url.trim());
      store.setConfig('actual_sync_db', syncDb.trim());
      if (password && password !== '●●●●●●●●') {
         store.setEncryptedConfig('actual_password', password.trim());
      }
      return res.json({ success: true });
   } catch (err) {
      return res.status(500).json({ error: err.message });
   } finally {
      if (store) store.close();
   }
});

// GET /api/budget/accounts - Retrieve list of available Actual Budget accounts
app.get('/api/budget/accounts', async (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   let store;
   let url = '';
   let syncDb = '';
   let password = '';
   try {
      store = new CredentialsStore(masterKey);
      url = store.getConfig('actual_server_url') || '';
      syncDb = store.getConfig('actual_sync_db') || '';
      password = store.getEncryptedConfig('actual_password') || '';

      // Fallback to process.env variables if database entries are not yet populated
      if (!url && !syncDb && !password) {
         url = process.env.AB_URL || '';
         syncDb = process.env.AB_SYNC_DB || '';
         password = process.env.AB_PASS || '';
      }
   } catch (err) {
      return res.status(500).json({ error: 'Fehler beim Laden der Budget-Konfiguration: ' + err.message });
   } finally {
      if (store) store.close();
   }

   if (!url || !syncDb || !password) {
      return res.status(400).json({ error: 'Actual Budget ist nicht oder unvollständig konfiguriert.' });
   }

   const { BudgetClient } = require('./lib/budget-api');
   const client = new BudgetClient({
      serverUrl: url.trim(),
      syncDb: syncDb.trim(),
      password: password.trim(),
   });

   try {
      await client.loadBudget();
      const accounts = await client.getAccounts() || [];
      // We only return open accounts that can hold transactions
      const mapped = accounts.map(acc => ({
         id: acc.id,
         name: acc.name,
         offbudget: acc.offbudget,
         closed: acc.closed
      }));
      return res.json({ success: true, accounts: mapped });
   } catch (err) {
      return res.status(400).json({ error: 'Verbindung zu Actual Budget fehlgeschlagen: ' + err.message });
   } finally {
      try {
         await client.close();
      } catch (closeErr) {
         console.error('Fehler beim Schließen des Budget-Clients:', closeErr);
      }
   }
});

// POST /api/budget/test - Test Actual Budget connection credentials
app.post('/api/budget/test', async (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   let { url, syncDb, password } = req.body ?? {};
   if (!url || !syncDb) {
      return res.status(400).json({ error: 'Server URL und Budget Sync ID sind erforderlich.' });
   }

   let store;
   try {
      if (!password || password === '●●●●●●●●') {
         store = new CredentialsStore(masterKey);
         password = store.getEncryptedConfig('actual_password');
      }
   } catch (err) {
      return res.status(500).json({ error: 'Fehler beim Laden des gespeicherten Passworts: ' + err.message });
   } finally {
      if (store) store.close();
   }

   if (!password) {
      return res.status(400).json({ error: 'Passwort ist erforderlich.' });
   }

   const { BudgetClient } = require('./lib/budget-api');
   const client = new BudgetClient({
      serverUrl: url.trim(),
      syncDb: syncDb.trim(),
      password: password.trim(),
   });

   try {
      await client.loadBudget();
      return res.json({ success: true });
   } catch (err) {
      return res.status(400).json({ error: err.message });
   } finally {
      try {
         await client.close();
      } catch (closeErr) {
         console.error('Fehler beim Schließen des Budget-Clients:', closeErr);
      }
   }
});

// POST /api/banks/test - Test bank FinTS connection credentials
app.post('/api/banks/test', async (req, res) => {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY ist nicht gesetzt.' });

   let { name, url, blz, login, pin } = req.body ?? {};

   let store;
   try {
      if (name && (login === '●●●●●●●●' || pin === '●●●●●●●●' || !url || !blz)) {
         store = new CredentialsStore(masterKey);
         const existing = store.getBank(name);
         if (existing) {
            if (!url) url = existing.fints.url;
            if (!blz) blz = existing.fints.blz;
            if (login === '●●●●●●●●' || !login) login = existing.fints.login;
            if (pin === '●●●●●●●●' || !pin) pin = existing.fints.pin;
         }
      }
   } catch (err) {
      return res.status(500).json({ error: 'Fehler beim Laden der gespeicherten Bankdaten: ' + err.message });
   } finally {
      if (store) store.close();
   }

   if (!url || !blz || !login || !pin) {
      return res.status(400).json({ error: 'Alle Felder (URL, BLZ, Login, PIN) sind erforderlich.' });
   }

   const { FinTSClient } = require('./lib/fints-api');
   try {
      const client = new FinTSClient({
         url: url.trim(),
         blz: blz.trim(),
         login: login.trim(),
         pin: pin.trim()
      });
      await client.initiateClient();
      await client.loadAccounts();
      const accounts = client.getAccounts() || [];
      const accountList = accounts.map(acc => ({
         iban: acc.iban,
         name: acc.name,
         productName: acc.productName
      }));
      return res.json({ success: true, accounts: accountList });
   } catch (err) {
      return res.status(400).json({ error: err.message });
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

// Automatic migration of Actual Budget credentials from .env to SQLite if not already migrated
const masterKey = process.env.MASTER_KEY;
if (masterKey) {
   let store;
   try {
      store = new CredentialsStore(masterKey);
      const dbUrl = store.getConfig('actual_server_url');
      if (!dbUrl && process.env.AB_URL && process.env.AB_PASS && process.env.AB_SYNC_DB) {
         console.log('🔄 [Migration] Migriere Actual Budget Verbindungsdaten aus .env in die SQLite-Datenbank...');
         store.setConfig('actual_server_url', process.env.AB_URL.trim());
         store.setConfig('actual_sync_db', process.env.AB_SYNC_DB.trim());
         store.setEncryptedConfig('actual_password', process.env.AB_PASS.trim());
         if (process.env.AB_PATH) {
            store.setConfig('actual_data_dir', process.env.AB_PATH.trim());
         }
         console.log('✅ [Migration] Actual Budget Verbindungsdaten erfolgreich und verschlüsselt in SQLite importiert!');
      }
   } catch (err) {
      console.error('❌ [Migration] Fehler bei der automatischen Actual Budget Migration:', err.message);
   } finally {
      if (store) store.close();
   }
}

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