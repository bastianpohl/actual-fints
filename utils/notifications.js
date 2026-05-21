const ntfyTopic = process.env.NTFY_TOPIC;
const ntfyServer = process.env.NTFY_SERVER || 'https://ntfy.sh';

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
      console.error('Push-Notification übersprungen: ntfy Topic ist nicht definiert.');
      return;
   }

   const serverBase = server.endsWith('/') ? server.slice(0, -1) : server;
   const url = `${serverBase}/${topic}`;

   try {
      const response = await fetch(url, {
         method: 'POST',
         headers: {
            'Title': title,
            'Tags': tags,
            'Priority': priority,
            'Content-Type': 'text/plain; charset=utf-8'
         },
         body: message
      });

      if (!response.ok) {
         console.error(`Fehler beim Senden der Push-Benachrichtigung: HTTP ${response.status}`);
      }
   } catch (error) {
      console.error('Fehler bei der Push-Benachrichtigungs-Übertragung:', error.message);
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

   await sendNtfy(title, message, tags, priority, overrideTopic, overrideServer);
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

   await sendNtfy(title, message, tags, priority, overrideTopic, overrideServer);
}

module.exports = {
   sendSuccessNotification,
   sendFailureNotification
};
