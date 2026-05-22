const ntfyTopic = process.env.NTFY_TOPIC;
const ntfyServer = process.env.NTFY_SERVER || 'https://ntfy.sh';
const webpush = require('web-push');
const { CredentialsStore } = require('../lib/credentials-store');

/**
 * Sends a standard Web-Push notification to all registered PWA standalone devices.
 * @param {string} title
 * @param {string} message
 */
async function sendWebPush(title, message) {
   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) {
      console.warn('Web-Push übersprungen: MASTER_KEY ist nicht konfiguriert.');
      return;
   }
   
   let store;
   try {
      store = new CredentialsStore(masterKey);
      
      const keysJson = store.getEncryptedConfig('auth_vapid_keys');
      if (!keysJson) {
         console.warn('Web-Push übersprungen: Keine VAPID-Schlüssel konfiguriert.');
         return;
      }
      
      const vapidKeys = JSON.parse(keysJson);
      webpush.setVapidDetails(
         'mailto:admin@actual-fints.local',
         vapidKeys.publicKey,
         vapidKeys.privateKey
      );
      
      const subsJson = store.getEncryptedConfig('auth_push_subscriptions');
      if (!subsJson) return; // No PWA push subscribers
      
      const subscriptions = JSON.parse(subsJson);
      let activeSubscriptions = [...subscriptions];
      let dbChanged = false;
      
      const payload = JSON.stringify({ title, body: message });
      
      for (const sub of subscriptions) {
         try {
            await webpush.sendNotification(sub.subscription, payload);
         } catch (err) {
            console.error(`Fehler beim Senden der Web-Push an ${sub.deviceName}:`, err);
            if (err.statusCode === 410 || err.statusCode === 404) {
               activeSubscriptions = activeSubscriptions.filter(s => s.subscription.endpoint !== sub.subscription.endpoint);
               dbChanged = true;
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
   } catch (err) {
      console.error('Fehler bei der Web-Push Übertragung:', err.message);
   } finally {
      if (store) store.close();
   }
}

/**
 * Formats a transaction amount stored in cents back to EUR string.
 * @param {number} amount - Amount in cents (e.g. 1234 or -5678)
 * @returns {string} Formatted string (e.g. "12,34" or "-56,78")
 */
function formatAmount(amount) {
   const euros = amount / 100;
   return euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Formats a date string (YYYY-MM-DD) to a shorter German format (DD.MM.).
 * @param {string} dateStr 
 * @returns {string}
 */
function formatDate(dateStr) {
   if (!dateStr || dateStr.length < 10) return dateStr;
   const parts = dateStr.split('-');
   if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.`;
   }
   return dateStr;
}

/**
 * Helper to encode non-ASCII header values using RFC 2047 MIME encoded-words.
 * This prevents the undici/fetch "ByteString" validation error with emojis/unicode.
 * @param {string} value
 * @returns {string}
 */
function encodeHeaderValue(value) {
   if (!value) return '';
   const hasNonAscii = /[^\x00-\x7F]/.test(value);
   if (!hasNonAscii) return value;
   return `=?utf-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * Sends a push notification via ntfy.sh.
 * @param {string} title 
 * @param {string} message 
 * @param {string} tags 
 * @param {string} priority - 'min', 'low', 'default', 'high', 'urgent'
 * @param {string} [overrideTopic]
 * @param {string} [overrideServer]
 */
async function sendNtfy(title, message, tags = '', priority = 'default', overrideTopic = null, overrideServer = null) {
   const topic = overrideTopic ?? ntfyTopic;
   const server = overrideServer ?? ntfyServer;

   if (!topic) {
      throw new Error('Push-Notification übersprungen: ntfy Topic ist nicht definiert.');
   }

   const serverBase = server.endsWith('/') ? server.slice(0, -1) : server;
   const url = `${serverBase}/${topic}`;

   const headers = {
      'Priority': priority,
      'Content-Type': 'text/plain; charset=utf-8'
   };

   if (title) {
      headers['Title'] = encodeHeaderValue(title);
   }
   if (tags) {
      headers['Tags'] = encodeHeaderValue(tags);
   }

   const response = await fetch(url, {
      method: 'POST',
      headers,
      body: message
   });

   if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Fehler beim Senden der Push-Benachrichtigung: HTTP ${response.status}${errText ? ` - ${errText}` : ''}`);
   }
}

/**
 * Analyzes the import results and sends a success notification.
 * @param {Array} results 
 * @param {string} [overrideTopic]
 * @param {string} [overrideServer]
 */
async function sendSuccessNotification(results, overrideTopic = null, overrideServer = null) {
   if (!results || !Array.isArray(results)) return;

   // Filter for accounts that have new transactions
   const accountsWithNew = results.filter(r => r.added > 0);
   const totalAdded = results.reduce((sum, r) => sum + r.added, 0);

   let title = '';
   let message = '';
   let tags = '';
   let priority = 'default';

   if (totalAdded > 0) {
      title = totalAdded === 1 ? '1 neuer Umsatz importiert 🏦' : `${totalAdded} neue Umsätze importiert 🏦`;
      tags = 'money_with_wings,bank';
      priority = 'default'; // normal notification

      const lines = [];
      for (const res of accountsWithNew) {
         lines.push(`💳 ${res.account}:`);
         const newTransactions = res.transactions.filter(t => t.status === 'added');
         for (const tx of newTransactions) {
            const formattedAmt = formatAmount(tx.amount);
            const formattedDate = formatDate(tx.date);
            lines.push(`  • ${formattedDate} ${tx.payee}: ${formattedAmt}`);
         }
         lines.push('');
      }

      message = lines.join('\n').trim();
   } else {
      // Silent notification for successful run without any new transactions
      title = 'FinTS-Import erfolgreich 🔄';
      tags = 'white_check_mark,sleepy';
      priority = 'min'; // silent, won't buzz/vibrate, just in history
      message = 'Alle Konten sind auf dem neuesten Stand. Keine neuen Umsätze gefunden.';
   }

   // 1. Send via standard ntfy
   try {
      await sendNtfy(title, message, tags, priority, overrideTopic, overrideServer);
   } catch (error) {
      console.error('Fehler bei der ntfy Push-Benachrichtigungs-Übertragung:', error.message);
   }

   // 2. Send via native Web-Push (PWA)
   try {
      await sendWebPush(title, message);
   } catch (error) {
      console.error('Fehler bei der PWA Web-Push-Übertragung:', error.message);
   }
}

/**
 * Sends a failure notification with error details.
 * @param {Error|string} error 
 * @param {string} [overrideTopic]
 * @param {string} [overrideServer]
 */
async function sendFailureNotification(error, overrideTopic = null, overrideServer = null) {
   const title = 'FinTS-Import FEHLGESCHLAGEN 🚨';
   const tags = 'warning,skull';
   const priority = 'high'; // high alert, will ring/vibrate

   const message = `Fehler beim Ausführen der Bank-Synchronisation!

Fehlermeldung:
${error?.message || error || 'Unbekannter Fehler'}`;

   // 1. Send via standard ntfy
   try {
      await sendNtfy(title, message, tags, priority, overrideTopic, overrideServer);
   } catch (error) {
      console.error('Fehler bei der ntfy Push-Benachrichtigungs-Übertragung:', error.message);
   }

   // 2. Send via native Web-Push (PWA)
   try {
      await sendWebPush(title, message);
   } catch (error) {
      console.error('Fehler bei der PWA Web-Push-Übertragung:', error.message);
   }
}

module.exports = {
   sendSuccessNotification,
   sendFailureNotification,
   sendNtfy
};

