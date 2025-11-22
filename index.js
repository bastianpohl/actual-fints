const { FinTSClient } = require('./fints-api');
const { BudgetClient } = require('./budget-api');

const accountData = require(process.env.MAPPING_FILE || './account-mapping.json');

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

         const budgetTransactions = transactions.map(t => BudgetClient.convert(t));

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

if (require.main === module) {
   main().catch(err => {
      console.error('Unhandled error in main:', err);
   });
}
