const { PinTanClient } = require('fints');
const { requireEnv } = require('./utils/env');


class FinTSClient {

   #accounts;
   #client;
   #activeAccount;

   #fintsUrl;
   #fintsLogin;
   #fintsPin;
   #fintsBlz;

   constructor() {
      this.#client = null;
      this.#activeAccount = null;
      this.#accounts = [];
   }

   #loadCredentials() {
      const env = requireEnv(['FINTS_URL', 'FINTS_LOGIN', 'FINTS_PIN', 'FINTS_BLZ']);
      this.#fintsUrl = env.FINTS_URL;
      this.#fintsLogin = env.FINTS_LOGIN;
      this.#fintsPin = env.FINTS_PIN;
      this.#fintsBlz = env.FINTS_BLZ;
   }

   async initiateClient() {
      try {
         if (this.#client) return;

         this.#loadCredentials();

         this.#client = new PinTanClient({
            url: this.#fintsUrl,
            name: this.#fintsLogin,
            pin: this.#fintsPin,
            blz: this.#fintsBlz,
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