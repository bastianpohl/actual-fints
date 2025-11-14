process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { FinTSClient } = require('./fints-api');
const { BudgetClient } = require('./budget-api')

const api = require('@actual-app/api');

const accountData = require(process.env.MAPPING_FILE || './account-mapping.json');

const convertAmountForDB = (amount, isCredit) => {
   let factor = isCredit ? 1 : -1;
   return Math.round(amount * 100 * factor);
}

const textDataforDB = (descriptionStructured = {}, customerReference = '', bankReference = '') => {
   const {
      name = '',
      reference = {},
      iban = descriptionStructured.iban || descriptionStructured.iabn || '',
      bic = '',
      text = ''
   } = descriptionStructured || {};

   const parts = [];

   // priorisiere referenz-Text, dann freie Felder, dann ids
   if (reference?.text) parts.push(reference.text);
   if (text) parts.push(`#${text}`);
   if (iban) parts.push(`IBAN: ${iban}`);
   if (bic) parts.push(`BIC: ${bic}`);

   if (reference?.endToEndRef) parts.push(`E2E: ${reference.endToEndRef}`);
   if (reference?.mandateRef) parts.push(`MD: ${reference.mandateRef}`);
   if (reference?.creditorId) parts.push(`CID: ${reference.creditorId}`);

   if (customerReference) parts.push(`CR: ${customerReference}`);
   if (bankReference) parts.push(`BR: ${bankReference}`);

   const notes = parts.join(' ').replace(/\s+/g, ' ');

   // optional: begrenze Länge, damit DB-Felder nicht überlaufen
   const MAX_NOTE_LENGTH = 2000;
   return { name: (name || ''), notes: notes.slice(0, MAX_NOTE_LENGTH) };
}

const prepareForDatabase = (transaction, budgetAccount) => {
   const _transaction = {
      account: budgetAccount,
      amount: convertAmountForDB(transaction.amount, transaction.isCredit),
      date: transaction.valueDate
   };

   const { name, notes } = textDataforDB(transaction.descriptionStructured, transaction.customerReference, transaction.bankReference);

   _transaction.payee_name = name;
   _transaction.notes = notes;

   return _transaction;
}

const main = async () => {
   const fintsClient = new FinTSClient();
   // FinTSClient intern ruft async-methoden im ctor — explizit initialisieren und Accounts laden
   if (typeof fintsClient.initiateClient === 'function') {
      await fintsClient.initiateClient();
   }
   if (typeof fintsClient.loadAccounts === 'function') {
      await fintsClient.loadAccounts();
   }

   const budgetClient = new BudgetClient();
   await budgetClient.loadBudget(); 
   await budgetClient.getAccounts();

   const fintsAccounts = fintsClient.getAccounts();
   if (!fintsAccounts || fintsAccounts.length === 0) {
      console.error('Keine FinTS-Konten verfügbar, Abbruch.');
      await budgetClient.close();
      return;
   }

   for (const fintsAccount of fintsAccounts) {
      try {
         const matchedAccount = accountData.find(a => a.iban === fintsAccount.iban);
         if (!matchedAccount) {
            console.warn("Kein Mapping für IBAN:", fintsAccount.iban);
            continue; // nächstes Konto
         }

         fintsClient.setAccount(matchedAccount.iban);
         await budgetClient.setActiveAccount(matchedAccount.actualBudgetAccountName);

         const transactions = await fintsClient.getTransaktions(new Date(), new Date());
         if (!transactions || transactions.length === 0) {
            console.log('Keine Transaktionen für', matchedAccount.iban);
            continue;
         }

         const budgetTransactions = transactions.map(async t => prepareForDatabase(t, await budgetClient.getActiveAccountId()));

         if (budgetTransactions.length > 0) {
            await budgetClient.importTransactions(budgetTransactions);
         }
      } catch (err) {
         console.error('Fehler beim Verarbeiten von Konto', fintsAccount?.iban, err);
         // optional: continue oder rethrow je nach gewünschtem Verhalten
      }
   }

   await budgetClient.close();
}

main().catch(err => {
   console.error('Unhandled error in main:', err);
});