const { PinTanClient } = require('fints');
const { HKKAZ, HKTAN } = require('fints/dist/segments');
const { HIKAZ } = require('fints/dist/segments/hikaz');
const { read } = require('mt940-js');
const { parse86Structured } = require('fints/dist/mt940-86-structured');

class FinTSClient {

   #accounts;
   #client;
   #activeAccount;

   #fintsUrl;
   #fintsLogin;
   #fintsPin;
   #fintsBlz;

   /**
    * @param {{ url: string, blz: string, login: string, pin: string }} credentials
    */
   constructor(credentials) {
      if (!credentials || !credentials.url || !credentials.blz || !credentials.login || !credentials.pin) {
         throw new Error('FinTS credentials (url, blz, login, pin) are required.');
      }

      this.#fintsUrl = credentials.url;
      this.#fintsBlz = credentials.blz;
      this.#fintsLogin = credentials.login;
      this.#fintsPin = credentials.pin;
      this.#client = null;
      this.#activeAccount = null;
      this.#accounts = [];
   }

   async initiateClient() {
      try {
         if (this.#client) return;

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

   async getBalance(account) {
      if (!this.#client) {
         throw new Error("Client not initialized");
      }
      return await this.#client.balance(account);
   }

   async getPendingTransactions(fromDate, toDate) {
      if (!this.#activeAccount) {
         throw new Error("No active account set");
      }
      if (!this.#client) {
         throw new Error("Client not initialized");
      }

      try {
         const dialog = this.#client.createDialog();
         await dialog.sync();
         await dialog.init();

         const segments = [];
         segments.push(new HKKAZ({
            segNo: 3,
            version: dialog.hikazsVersion,
            account: this.#activeAccount,
            startDate: fromDate,
            endDate: toDate,
         }));

         if (dialog.hktanVersion >= 6) {
            segments.push(new HKTAN({
               segNo: 4,
               version: 6,
               process: "4",
               segmentReference: "HKKAZ",
               medium: dialog.tanMethods[0].name,
            }));
         }

         let touchdowns;
         let touchdown;
         const responses = [];
         do {
            const request = this.#client.createRequest(dialog, segments);
            const response = await dialog.send(request);
            touchdowns = response.getTouchdowns(request);
            touchdown = touchdowns.get("HKKAZ");
            responses.push(response);
         } while (touchdown);

         await dialog.end();

         const responseSegments = responses.reduce((result, response) => {
            result.push(...response.findSegments(HIKAZ));
            return result;
         }, []);

         let pendingString = responseSegments.map((segment) => segment.pendingTransactions || "").join("");
         if (!pendingString.trim()) {
            return [];
         }

         // Inject mock opening balance if not present to satisfy mt940-js parser requirement
         if (!pendingString.includes(':60F:') && !pendingString.includes(':60M:')) {
            const now = new Date();
            const yy = String(now.getFullYear()).slice(-2);
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const yymmdd = `${yy}${mm}${dd}`;
            
            const mockOpeningBalance = `:60F:C${yymmdd}EUR0,00\r\n`;
            
            // Insert it right before the first ':61:' tag
            const idx = pendingString.indexOf(':61:');
            if (idx !== -1) {
               pendingString = pendingString.slice(0, idx) + mockOpeningBalance + pendingString.slice(idx);
            }
         }

         const unprocessedStatements = await read(Buffer.from(pendingString, "utf-8"));
         const parsedStatements = unprocessedStatements.map((statement) => {
            const transactions = statement.transactions.map((transaction) => {
               const descriptionStructured = parse86Structured(transaction.description);
               return Object.assign(Object.assign({}, transaction), { descriptionStructured });
            });
            return Object.assign(Object.assign({}, statement), { transactions });
         });

         const allTransactions = [];
         for (const stmt of parsedStatements) {
            if (stmt.transactions && Array.isArray(stmt.transactions)) {
               for (const tx of stmt.transactions) {
                  allTransactions.push(tx);
               }
            }
         }
         return allTransactions;
      } catch (error) {
         console.error("Error fetching pending statements:", error);
         throw error;
      }
   }

}

module.exports = { FinTSClient }