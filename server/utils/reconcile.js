const api = require('@actual-app/api');
const Database = require('better-sqlite3');
const { PENDING_ID_PREFIX } = require('./convert');
const fs = require('node:fs');
const path = require('node:path');

// Transactions imported as pending (vorgemerkt) bookings are preliminary: they must not
// count towards the balance that is compared against the booked bank balance, and they
// must never be marked as reconciled.
const EXCLUDE_PENDING_SQL = `AND (financial_id IS NULL OR financial_id NOT LIKE '${PENDING_ID_PREFIX}%')`;

function getDatabasePath(dataDir) {
   if (!fs.existsSync(dataDir)) return null;
   const files = fs.readdirSync(dataDir);
   for (const file of files) {
      const fullPath = path.join(dataDir, file);
      if (fs.statSync(fullPath).isDirectory()) {
         const dbPath = path.join(fullPath, 'db.sqlite');
         if (fs.existsSync(dbPath)) {
            return dbPath;
         }
      }
   }
   return null;
}

/**
 * Resolves the account balance directly from SQLite, accounting for split transactions properly.
 * 
 * @param {string} dataDir The Actual Budget data directory.
 * @param {string} accountId The Actual Budget account ID.
 * @returns {number|null} The balance in Euro or null if the DB path could not be found.
 */
function getAccountBalanceFromDb(dataDir, accountId) {
   const dbPath = getDatabasePath(dataDir);
   if (!dbPath) return null;
   const db = new Database(dbPath);
   try {
      const row = db.prepare(`
         SELECT SUM(amount) FROM transactions 
         WHERE acct = ? 
           AND tombstone = 0 
           AND isChild = 0
           ${EXCLUDE_PENDING_SQL}
      `).get(accountId);
      const sum = row ? row['SUM(amount)'] : 0;
      return (sum || 0) / 100.0;
   } finally {
      db.close();
   }
}

/**
 * Automatically reconciles transactions for an account if the bank balance matches 
 * the Actual Budget balance and there are no uncategorized transactions.
 * 
 * @param {string} accountId The Actual Budget account ID.
 * @param {string} actualAccountName The name of the account in Actual Budget.
 * @param {number} bankBalance The current booked balance from the bank in Euro.
 * @returns {Promise<{reconciledCount: number, reason: string}>}
 */
async function reconcileAccountIfSynchronized(accountId, actualAccountName, bankBalance) {
   try {
      // Determine SQLite DB path
      const dataDir = process.env.AB_PATH || './actual-budget/';
      const dbPath = getDatabasePath(dataDir);
      
      if (!dbPath) {
         console.warn(`[Reconciliation] Datenbank-Datei konnte unter "${dataDir}" nicht gefunden werden. Überspringe Abstimmung.`);
         return { reconciledCount: 0, reason: 'Datenbank-Datei nicht gefunden' };
      }
      
      const db = new Database(dbPath);
      let budgetBalance = 0;
      let uncatTxs = [];
      let unreconciledTxs = [];
      
      try {
         // Query working balance of the account (sum of normal + parent transactions, excluding child transactions of splits)
         const balanceRow = db.prepare(`
            SELECT SUM(amount) FROM transactions 
            WHERE acct = ? 
              AND tombstone = 0 
              AND isChild = 0
              ${EXCLUDE_PENDING_SQL}
         `).get(accountId);
         const budgetSum = balanceRow ? balanceRow['SUM(amount)'] : 0;
         budgetBalance = (budgetSum || 0) / 100.0; // in Euro
         
         const isSynchronous = Math.abs(bankBalance - budgetBalance) < 0.01;
         
         if (!isSynchronous) {
            return { reconciledCount: 0, reason: `Kontostand nicht synchron (Bank: ${bankBalance} €, Budget: ${budgetBalance} €)` };
         }
         
         // Query uncategorized transactions (including child transactions of splits)
         const uncatQuery = `
            SELECT id FROM transactions 
            WHERE acct = ? 
              AND category IS NULL 
              AND transferred_id IS NULL 
              AND isParent = 0 
              AND tombstone = 0
              ${EXCLUDE_PENDING_SQL}
         `;
         uncatTxs = db.prepare(uncatQuery).all(accountId);
         
         // Query unreconciled transactions (excluding child transactions of splits, since they can't be reconciled directly)
         const unreconciledQuery = `
            SELECT id FROM transactions 
            WHERE acct = ? 
              AND reconciled = 0 
              AND isChild = 0 
              AND tombstone = 0
              ${EXCLUDE_PENDING_SQL}
         `;
         unreconciledTxs = db.prepare(unreconciledQuery).all(accountId);
      } finally {
         db.close();
      }
      
      const isFullyCategorized = uncatTxs.length === 0;
      
      if (!isFullyCategorized) {
         return { reconciledCount: 0, reason: `Nicht alle Umsätze sind kategorisiert (${uncatTxs.length} offen)` };
      }
      
      if (unreconciledTxs.length > 0) {
         console.error(`[Reconciliation] Konto "${actualAccountName}" ist synchron und voll kategorisiert. Markiere ${unreconciledTxs.length} Buchung(en) als abgestimmt...`);
         for (const tx of unreconciledTxs) {
            await api.updateTransaction(tx.id, { reconciled: true });
         }
         console.error(`[Reconciliation] Erfolgreich abgeschlossen für Konto "${actualAccountName}".`);
         return { reconciledCount: unreconciledTxs.length, reason: 'Abstimmung erfolgreich durchgeführt' };
      }
      
      return { reconciledCount: 0, reason: 'Bereits alle Umsätze abgestimmt' };
   } catch (err) {
      console.error(`[Reconciliation-Fehler] Fehler bei der Abstimmungs-Prüfung für ${actualAccountName}:`, err.message);
      throw err;
   }
}

module.exports = { reconcileAccountIfSynchronized, getAccountBalanceFromDb, getDatabasePath };
