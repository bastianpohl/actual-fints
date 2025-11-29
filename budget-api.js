const api = require('@actual-app/api');
const { isUid } = require('./utils/uid');
const { convertTransaction } = require('./utils/convert');
const { requireEnv } = require('./utils/env');

class BudgetClient {
   #accounts;
   #activeAccount;
   #initialized = false;

   #AB_URL = null;
   #AB_PASS = null;
   #AB_PATH = null;
   #AB_SYNC_DB = null;

   constructor() {
      this.#activeAccount = null;
      this.#accounts = [];
   }

   #loadCredentials() {
      const env = requireEnv(['AB_URL', 'AB_PASS', 'AB_PATH', 'AB_SYNC_DB']);
      this.#AB_URL = env.AB_URL;
      this.#AB_PASS = env.AB_PASS;
      this.#AB_PATH = env.AB_PATH;
      this.#AB_SYNC_DB = env.AB_SYNC_DB;
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
      if (!Array.isArray(transactions) || !transactions.length) return;
      if (!this.#activeAccount) throw new Error("No active account id set");
      // Resolve any pending promises in the transactions array (works for plain values too)
      const resolvedTransactions = await Promise.all(transactions);
      await api.importTransactions(this.#activeAccount, resolvedTransactions);
      console.log('Transactions imported successfully');
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