const { FinTSClient } = require('./lib/fints-api');
const { BudgetClient } = require('./lib/udget-api');

const accountData = require(process.env.MAPPING_FILE || './account-mapping.json');
const parseDateRange = require('./utils/parseDateRange');

const main = async () => {

   let startDate, endDate;
   try {
      ({ startDate, endDate } = parseDateRange());
   } catch (error) {
      console.error('Fehler beim Parsen des Datumsbereichs:', error.message);
      return;
   }

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

         console.log("Umsätze für den Zeitraum", startDate.toLocaleDateString(process.env.LOCALE), "bis", endDate.toLocaleDateString(process.env.LOCALE), "abrufen...");
         console.log('Verarbeite Konto:', matchedAccount.iban, '->', matchedAccount.actualBudgetAccountName);
         const transactions = await fintsClient.getTransaktions(startDate, endDate);
         

         if (!transactions || transactions.length === 0) {
            console.log('Keine Transaktionen für', matchedAccount.iban);
            continue;
         }

         const budgetTransactions = transactions.map(t => budgetClient.convert(t));

         if (budgetTransactions.length > 0) {
            await budgetClient.importTransactions(budgetTransactions);
         }
      } catch (err) {
         console.error('Fehler beim Verarbeiten von Konto', fintsAccount?.iban, err);
      }
   }

   await budgetClient.close();
}

if (require.main === module) {
   main().catch(err => {
      console.error('Unhandled error in main:', err);
   });
}
