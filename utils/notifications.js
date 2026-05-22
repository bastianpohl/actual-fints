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
 * Analyzes the import results and sends a success notification.
 * @param {Array} results 
 */
async function sendSuccessNotification(results) {
   if (!results || !Array.isArray(results)) return;

   // Filter for accounts that have new transactions
   const accountsWithNew = results.filter(r => r.added > 0);
   const totalAdded = results.reduce((sum, r) => sum + r.added, 0);

   let title = '';
   let message = '';

   if (totalAdded > 0) {
      title = totalAdded === 1 ? '1 neuer Umsatz importiert 🏦' : `${totalAdded} neue Umsätze importiert 🏦`;

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
      message = 'Alle Konten sind auf dem neuesten Stand. Keine neuen Umsätze gefunden.';
   }

   // Send via native Web-Push (PWA)
   try {
      await sendWebPush(title, message);
   } catch (error) {
      console.error('Fehler bei der PWA Web-Push-Übertragung:', error.message);
   }
}

/**
 * Sends a failure notification with error details.
 * @param {Error|string} error 
 */
async function sendFailureNotification(error) {
   const title = 'FinTS-Import FEHLGESCHLAGEN 🚨';

   const message = `Fehler beim Ausführen der Bank-Synchronisation!

Fehlermeldung:
${error?.message || error || 'Unbekannter Fehler'}`;

   // Send via native Web-Push (PWA)
   try {
      await sendWebPush(title, message);
   } catch (error) {
      console.error('Fehler bei der PWA Web-Push-Übertragung:', error.message);
   }
}

module.exports = {
   sendSuccessNotification,
   sendFailureNotification
};

