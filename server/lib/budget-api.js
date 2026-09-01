// Polyfill: @actual-app/api bundle references navigator.platform (browser API)
// which does not exist in Node.js environments (e.g. LXC containers).
if (typeof globalThis.navigator === 'undefined') {
   globalThis.navigator = { platform: process.platform, userAgent: '' };
}

const api = require('@actual-app/api');
const { isUid } = require('../utils/uid');
const { convertTransaction, convertPendingTransaction, PENDING_ID_PREFIX } = require('../utils/convert');
const { selectObsoletePendingImports, matchPendingToBooked } = require('../utils/pending');
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
    * Returns the transactions of the active account that were created by a previous
    * pending import (imported_id prefixed with "pending-"), including the category the
    * user may have assigned to them.
    *
    * @returns {Promise<Array<{id: string, imported_id: string, amount: number, date: number, payee: string, category: string|null}>>}
    */
   async getPendingImports() {
      await this.#initClient();
      if (!this.#activeAccount) throw new Error("No active account id set");

      const db = this.#openDatabase();
      if (!db) return [];
      try {
         return db.prepare(`
            SELECT t.id AS id,
                   t.financial_id AS imported_id,
                   t.amount AS amount,
                   t.date AS date,
                   COALESCE(cm.transferId, t.category) AS category,
                   COALESCE(NULLIF(t.imported_description, ''), p.name, '') AS payee
            FROM transactions t
            LEFT JOIN category_mapping cm ON cm.id = t.category
            LEFT JOIN payee_mapping pm ON pm.id = t.description
            LEFT JOIN payees p ON p.id = COALESCE(pm.targetId, t.description)
            WHERE t.acct = ?
              AND t.tombstone = 0
              AND t.isChild = 0
              AND t.financial_id LIKE ?
         `).all(this.#activeAccount, `${PENDING_ID_PREFIX}%`);
      } catch (error) {
         console.warn(`[budget-api] Vorgemerkte Buchungen konnten nicht gelesen werden: ${error.message}`);
         return [];
      } finally {
         db.close();
      }
   }

   /**
    * Removes the previously imported pending transactions that the bank no longer reports
    * as pending. Transactions that are still pending keep their id - and with it any
    * category, payee or note the user assigned in Actual Budget. Manually entered
    * uncleared transactions are never touched.
    *
    * Before a pending booking is removed it is matched against the booked transactions of
    * the account. If it turned into a booked transaction that has no category yet, the
    * category assigned to the pending booking is carried over, so categorizing a pending
    * booking is not lost once the bank books it.
    *
    * @param {Set<string>|Array<string>} stillPendingIds imported_ids that are still pending.
    * @param {Array<object>} [bookedRows] Booked transactions of the account (see getBookedTransactionsSince).
    * @returns {Promise<{removed: number, kept: number, categoriesTransferred: number}>}
    */
   async deleteObsoletePendingImports(stillPendingIds, bookedRows = []) {
      const existing = await this.getPendingImports();
      const obsolete = selectObsoletePendingImports(existing, stillPendingIds);

      // Carry the category of a pending booking over to the booking it turned into
      let categoriesTransferred = 0;
      for (const { pending, booked } of matchPendingToBooked(obsolete, bookedRows)) {
         try {
            await api.updateTransaction(booked.id, { category: pending.category });
            categoriesTransferred++;
         } catch (error) {
            console.warn(`[budget-api] Kategorie der Vormerkung ${pending.id} konnte nicht übernommen werden: ${error.message}`);
         }
      }

      let removed = 0;
      for (const row of obsolete) {
         try {
            await api.deleteTransaction(row.id);
            removed++;
         } catch (error) {
            console.warn(`[budget-api] Vorgemerkte Buchung ${row.id} konnte nicht gelöscht werden: ${error.message}`);
         }
      }
      return { removed, kept: existing.length - removed, categoriesTransferred };
   }

   /**
    * Returns booked (non-pending) transactions of the active account since a given date,
    * used to detect pending bookings that already arrived as a real booking.
    *
    * @param {string} sinceDate Date in YYYY-MM-DD format.
    * @returns {Promise<Array<{id:string,amount:number,date:number,category:string|null,payee:string}>>}
    */
   async getBookedTransactionsSince(sinceDate) {
      await this.#initClient();
      if (!this.#activeAccount) throw new Error("No active account id set");

      const db = this.#openDatabase();
      if (!db) return [];
      try {
         const dateInt = Number(String(sinceDate).replace(/-/g, ''));
         return db.prepare(`
            SELECT t.id AS id,
                   t.amount AS amount,
                   t.date AS date,
                   COALESCE(cm.transferId, t.category) AS category,
                   COALESCE(NULLIF(t.imported_description, ''), p.name, '') AS payee
            FROM transactions t
            LEFT JOIN category_mapping cm ON cm.id = t.category
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