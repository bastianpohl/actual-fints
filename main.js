const { FinTSClient } = require('./lib/fints-api');
const { BudgetClient } = require('./lib/budget-api');
const { maskIban } = require('./utils/mask');

const accountData = require(process.env.MAPPING_FILE || './account-mapping.json');
const parseDateRange = require('./utils/parseDateRange');

const main = async () => {

   let startDate, endDate;
   try {
      ({ startDate, endDate } = parseDateRange());
   } catch (error) {
      console.error('Fehler beim Parsen des Datumsbereichs:', error.message);
      return [];
   }

   const fintsClient = new FinTSClient();
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
      return [];
   }

   const results = [];

   for (const fintsAccount of fintsAccounts) {
      try {
         const matchedAccount = accountData.find(a => a.iban === fintsAccount.iban);
         if (!matchedAccount) {
            console.warn("Kein Mapping für IBAN:", maskIban(fintsAccount.iban));
            continue;
         }

         fintsClient.setAccount(matchedAccount.iban);
         await budgetClient.setActiveAccount(matchedAccount.actualBudgetAccountName);

         console.error('Verarbeite Konto:', maskIban(matchedAccount.iban), '->', matchedAccount.actualBudgetAccountName);
         const transactions = await fintsClient.getTransaktions(startDate, endDate);

         if (!transactions || transactions.length === 0) {
            continue;
         }

         const budgetTransactions = transactions.map(t => budgetClient.convert(t));

         if (budgetTransactions.length > 0) {
            const importResult = await budgetClient.importTransactions(budgetTransactions);
            const added = importResult?.added?.length ?? 0;
            const updated = importResult?.updated?.length ?? 0;

            if (added > 0 || updated > 0) {
               results.push({
                  account: matchedAccount.actualBudgetAccountName,
                  added,
                  updated,
               });
            }
         }
      } catch (err) {
         console.error('Fehler beim Verarbeiten von Konto', maskIban(fintsAccount?.iban), err.message);
      }
   }

   await budgetClient.close();
   return results;
}

if (require.main === module) {
   main()
      .then(results => {
         console.log(JSON.stringify(results));
      })
      .catch(err => {
         console.error('Unhandled error in main:', err);
         process.exitCode = 1;
      });
}

module.exports = { main };
