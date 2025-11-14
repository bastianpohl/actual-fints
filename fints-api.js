const { PinTanClient } = require('fints');


class FinTSClient {

   #accounts;
   #client;
   #activeAccount;

   constructor() {
      this.#client = null;
      this.#activeAccount = null;
      this.#accounts = [];
   }

   async initiateClient() {
      try {
         if (this.#client) return;
         this.#client = new PinTanClient({
            url: process.env.FINTS_URL,
            name: process.env.FINTS_LOGIN,
            pin: process.env.FINTS_PIN,
            blz: process.env.FINTS_BLZ,
         });
         console.log("FinTS client created");
      } catch (error) {
         console.error("Error creating FinTS client:", error);
         throw error;
      }
   }

   async loadAccounts() {
      try {
         if (!this.#client) {
            throw new Error("Client not initialized. Call initiateClient() first.");
         }
         this.#accounts = await this.#client.accounts() || [];
      } catch (error) {
         console.error("Error loading accounts:", error);
         this.#accounts = [];
         throw error;
      }
   }

   getAccounts() {
      return this.#accounts || [];
   }   

   setAccount(iban) {
      if (!this.#accounts || this.#accounts.length === 0) {
         throw new Error("No accounts loaded");
      }

      if (!iban) {
         this.#activeAccount = this.#accounts[0];
         return;
      }

      const found = this.#accounts.find(acc => acc.iban === iban);
      if (!found) {
         throw new Error(`Account with IBAN ${iban} not found`);
      }
      this.#activeAccount = found;
   }

   async getTransaktions(fromDate, toDate) {
      if (!this.#activeAccount) {
         throw new Error("No active account set");
      }
      if (!this.#client) {
         throw new Error("Client not initialized");
      }

      try {
         const statements = await this.#client.statements(
            this.#activeAccount,
            fromDate,
            toDate
         );

         const transactions = statements?.[0]?.transactions ?? [];
         return Array.isArray(transactions) ? transactions : [];
      } catch (error) {
         console.error("Error fetching statements:", error);
         throw error;
      }
   }

}

module.exports = { FinTSClient }