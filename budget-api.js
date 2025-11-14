const api = require('@actual-app/api');

class BudgetClient {
   #accounts;
   #activeAccount;
   #initialized = false;

   constructor() {
      this.#activeAccount = null;
      this.#accounts = [];
   }

   static #requireEnv(keys) {
      const missing = keys.filter(k => !process.env[k]);
      if (missing.length) throw new Error(`Missing Actual env vars: ${missing.join(', ')}`);
   }

   async #initClient() {
      if (this.#initialized) return;
      BudgetClient.#requireEnv(['AB_URL', 'AB_PASS', 'AB_PATH']);
      await api.init({
         serverURL: process.env.AB_URL,
         password: process.env.AB_PASS,
         dataDir: process.env.AB_PATH 
      });
      this.#initialized = true;
      console.log('API initialized successfully');
   }

   async loadBudget() {
      await this.#initClient();
      BudgetClient.#requireEnv(['AB_SYNC_DB']);
      await api.downloadBudget(process.env.AB_SYNC_DB);
      console.log('Budget downloaded successfully');
   }

   async getAccounts() {
      await this.#initClient();
      this.#accounts = await api.getAccounts();
      return [...this.#accounts];
   }

   async setActiveAccount(name) {
      if (!this.#accounts.length) throw new Error("No accounts loaded");
      if (!name) {
         this.#activeAccount = this.#accounts[0];
         return;
      }
      const id = await api.getIDByName('accounts', name);
      if (!id) throw new Error(`Account with name "${name}" not found`);
      this.#activeAccount = id;
   }

   getActiveAccountId() {
      return this.#activeAccount;
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

module.exports =  { BudgetClient }