// Polyfill: @actual-app/api bundle references navigator.platform (browser API)
// which does not exist in Node.js environments (e.g. LXC containers).
if (typeof globalThis.navigator === 'undefined') {
   globalThis.navigator = { platform: process.platform, userAgent: '' };
}

const api = require('@actual-app/api');
const { isUid } = require('../utils/uid');
const { convertTransaction, convertPendingTransaction, PENDING_ID_PREFIX } = require('../utils/convert');
const { requireEnv } = require('../utils/env');

class BudgetClient {
   #accounts;
   #activeAccount;
   #initialized = false;

   #AB_URL;
   #AB_PASS;
   #AB_PATH;
   #AB_SYNC_DB;

   constructor(config = {}) {
      this.#activeAccount = null;
      this.#AB_URL = config.serverUrl || null;
      this.#AB_PASS = config.password || null;
      this.#AB_PATH = config.dataDir || null;
      this.#AB_SYNC_DB = config.syncDb || null;
      this.#accounts = [];
   }

   #loadCredentials() {
      // If any core credentials were not provided, check the environment variables
      if (!this.#AB_URL || !this.#AB_PASS || !this.#AB_SYNC_DB) {
         try {
            const env = requireEnv(['AB_URL', 'AB_PASS', 'AB_PATH', 'AB_SYNC_DB']);
            this.#AB_URL = this.#AB_URL || env.AB_URL;
            this.#AB_PASS = this.#AB_PASS || env.AB_PASS;
            this.#AB_PATH = this.#AB_PATH || env.AB_PATH;
            this.#AB_SYNC_DB = this.#AB_SYNC_DB || env.AB_SYNC_DB;
         } catch (error) {
            // Throw if we don't have enough details to connect
            throw new Error(`Verbindungsdaten für Actual Budget fehlen (weder in DB noch in .env gefunden): ${error.message}`);
         }
      }
      if (!this.#AB_PATH) {
         this.#AB_PATH = process.env.AB_PATH || './actual-budget/';
      }
   }

   async #initClient() {
      if (this.#initialized) return;

      try {
         this.#loadCredentials();

         await api.init({
            serverURL: this.#AB_URL,
            password: this.#AB_PASS,
            dataDir: this.#AB_PATH
         });

      } catch (error) {
         throw new Error(`Failed to initialize API client: ${error.message}`);
      } finally {
         this.#initialized = true;
         console.log('API initialized successfully');
      }
   }

   async loadBudget() {
      await this.#initClient();

      try {
         await api.downloadBudget(this.#AB_SYNC_DB);
      } catch (error) {
         throw new Error(`Failed to load budget: ${error.message}`);
      } finally {
         console.log('Budget downloaded successfully');
      }

   }

   async getAccounts() {
      await this.#initClient();
      try {
         this.#accounts = await api.getAccounts();
         return [...this.#accounts];
      } catch (error) {
         throw new Error(`Failed to retrieve accounts: ${error.message}`);
      }
   }

   async getExistingImportedIds() {
      await this.#initClient();
      if (!this.#activeAccount) throw new Error("No active account id set");
      try {
         const { getDatabasePath } = require('../utils/reconcile');
         const Database = require('better-sqlite3');
         const dbPath = getDatabasePath(this.#AB_PATH);
         if (!dbPath) {
            console.warn(`[budget-api] DB-Pfad konnte nicht ermittelt werden.`);
            return new Set();
         }
         const db = new Database(dbPath);
         try {
            const rows = db.prepare('SELECT financial_id FROM transactions WHERE acct = ? AND financial_id IS NOT NULL AND tombstone = 0').all(this.#activeAccount);
            return new Set(rows.map(r => r.financial_id));
         } finally {
            db.close();
         }
      } catch (error) {
         console.warn(`Failed to fetch existing transactions: ${error.message}`);
         return new Set();
      }
   }

   async setActiveAccount(input) {
      if (!this.#accounts.length) throw new Error("No accounts loaded");
      if (!input) {
         this.#activeAccount = this.#accounts[0];
         return;
      }

      if (isUid(input)) {
         const matched = this.#accounts.find(a => a.id === input);
         if (!matched) throw new Error(`Account with ID "${input}" not found`);
         this.#activeAccount = matched.id;
         return;
      }

      const id = await api.getIDByName('accounts', input);
      if (!id) throw new Error(`Account with name "${input}" not found`);
      this.#activeAccount = id;
   }

   getActiveAccountId() {
      return this.#activeAccount;
   }

   convert(transaction) {
      if (!this.#activeAccount) throw new Error("No active account id set");
      if (!transaction || typeof transaction !== 'object') {
         throw new Error("Invalid transaction object");
      }

      return convertTransaction(transaction, this.#activeAccount);
   }

   async importTransactions(transactions) {
      if (!Array.isArray(transactions) || !transactions.length) return { added: [], updated: [], errors: [] };
      if (!this.#activeAccount) throw new Error("No active account id set");
      // Resolve any pending promises in the transactions array (works for plain values too)
      const resolvedTransactions = await Promise.all(transactions);
      const result = await api.importTransactions(this.#activeAccount, resolvedTransactions);
      return result;
   }

   convertPending(transaction) {
      if (!this.#activeAccount) throw new Error("No active account id set");
      if (!transaction || typeof transaction !== 'object') {
         throw new Error("Invalid transaction object");
      }

      return convertPendingTransaction(transaction, this.#activeAccount);
   }

   #openDatabase() {
      const { getDatabasePath } = require('../utils/reconcile');
      const Database = require('better-sqlite3');
      const dbPath = getDatabasePath(this.#AB_PATH);
      if (!dbPath) {
         console.warn(`[budget-api] DB-Pfad konnte nicht ermittelt werden.`);
         return null;
      }
      return new Database(dbPath);
   }

   /**
    * Removes every uncleared transaction of the active account that was created by a
    * previous pending import (imported_id prefixed with "pending-"). Manually entered
    * uncleared transactions are left untouched.
    *
    * @returns {Promise<number>} Number of deleted transactions.
    */
   async deletePendingImports() {
      await this.#initClient();
      if (!this.#activeAccount) throw new Error("No active account id set");

      let rows = [];
      const db = this.#openDatabase();
      if (!db) return 0;
      try {
         rows = db.prepare(`
            SELECT id FROM transactions
            WHERE acct = ?
              AND tombstone = 0
              AND isChild = 0
              AND financial_id LIKE ?
         `).all(this.#activeAccount, `${PENDING_ID_PREFIX}%`);
      } finally {
         db.close();
      }

      let deleted = 0;
      for (const row of rows) {
         try {
            await api.deleteTransaction(row.id);
            deleted++;
         } catch (error) {
            console.warn(`[budget-api] Vorgemerkte Buchung ${row.id} konnte nicht gelöscht werden: ${error.message}`);
         }
      }
      return deleted;
   }

   /**
    * Returns booked (non-pending) transactions of the active account since a given date,
    * used to detect pending bookings that already arrived as a real booking.
    *
    * @param {string} sinceDate Date in YYYY-MM-DD format.
    * @returns {Promise<Array<{amount:number,date:number,payee:string}>>}
    */
   async getBookedTransactionsSince(sinceDate) {
      await this.#initClient();
      if (!this.#activeAccount) throw new Error("No active account id set");

      const db = this.#openDatabase();
      if (!db) return [];
      try {
         const dateInt = Number(String(sinceDate).replace(/-/g, ''));
         return db.prepare(`
            SELECT t.amount AS amount,
                   t.date AS date,
                   COALESCE(NULLIF(t.imported_description, ''), p.name, '') AS payee
            FROM transactions t
            LEFT JOIN payee_mapping pm ON pm.id = t.description
            LEFT JOIN payees p ON p.id = COALESCE(pm.targetId, t.description)
            WHERE t.acct = ?
              AND t.tombstone = 0
              AND t.isChild = 0
              AND t.date >= ?
              AND (t.financial_id IS NULL OR t.financial_id NOT LIKE ?)
         `).all(this.#activeAccount, Number.isNaN(dateInt) ? 0 : dateInt, `${PENDING_ID_PREFIX}%`);
      } catch (error) {
         console.warn(`[budget-api] Gebuchte Umsätze konnten nicht gelesen werden: ${error.message}`);
         return [];
      } finally {
         db.close();
      }
   }

   async close() {
      if (!this.#initialized) return;
      try {
         await api.sync();
      } finally {
         await api.shutdown();
         this.#initialized = false;
      }
   }
}

module.exports = { BudgetClient };