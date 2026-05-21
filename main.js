const { FinTSClient } = require('./lib/fints-api');
const { BudgetClient } = require('./lib/budget-api');
const { CredentialsStore } = require('./lib/credentials-store');
const { maskIban } = require('./utils/mask');

const parseDateRange = require('./utils/parseDateRange');

const main = async () => {

   let startDate, endDate;
   try {
      ({ startDate, endDate } = parseDateRange());
   } catch (error) {
      console.error('Fehler beim Parsen des Datumsbereichs:', error.message);
      return [];
   }

   const masterKey = process.env.MASTER_KEY;
   if (!masterKey) {
      console.error('MASTER_KEY nicht gesetzt. Bitte in .env definieren.');
      return [];
   }

   const store = new CredentialsStore(masterKey);
   let banks;
   try {
      banks = store.getAllBanks();
   } finally {
      store.close();
   }

   if (!banks || banks.length === 0) {
      console.error('Keine Banken konfiguriert. Nutze "node setup.js add-bank" zum Einrichten.');
      return [];
   }

   const budgetClient = new BudgetClient();
   await budgetClient.loadBudget();
   await budgetClient.getAccounts();

   const results = [];

   for (const bank of banks) {
      console.error(`\n── Bank: ${bank.name} ──`);

      let fintsClient;
      try {
         fintsClient = new FinTSClient(bank.fints);
         await fintsClient.initiateClient();
         await fintsClient.loadAccounts();
      } catch (err) {
         console.error(`Fehler bei Bank "${bank.name}":`, err.message);
         continue;
      }

      const fintsAccounts = fintsClient.getAccounts();
      if (!fintsAccounts || fintsAccounts.length === 0) {
         console.error(`Keine FinTS-Konten für Bank "${bank.name}" verfügbar.`);
         continue;
      }

      for (const accountMapping of bank.accounts) {
         try {
            const matchedFintsAccount = fintsAccounts.find(a => a.iban === accountMapping.iban);
            if (!matchedFintsAccount) {
               console.warn("Kein FinTS-Konto für IBAN:", maskIban(accountMapping.iban));
               continue;
            }

            fintsClient.setAccount(accountMapping.iban);
            await budgetClient.setActiveAccount(accountMapping.actualAccountName);

            console.error('Verarbeite Konto:', maskIban(accountMapping.iban), '->', accountMapping.actualAccountName);
            const transactions = await fintsClient.getTransaktions(startDate, endDate);

            if (!transactions || transactions.length === 0) {
               continue;
            }

            const budgetTransactions = transactions.map(t => budgetClient.convert(t));

            if (budgetTransactions.length > 0) {
               const existingIds = await budgetClient.getExistingImportedIds();
               
               const importResult = await budgetClient.importTransactions(budgetTransactions);
               const added = importResult?.added?.length ?? 0;
               const updated = importResult?.updated?.length ?? 0;

               const txDetails = budgetTransactions.map(bt => {
                  const isExisting = existingIds.has(bt.imported_id);
                  return {
                     date: bt.date,
                     payee: bt.payee_name || 'Unbekannter Empfänger',
                     amount: bt.amount,
                     status: isExisting ? 'ignored' : 'added'
                  };
               });

               results.push({
                  account: accountMapping.actualAccountName,
                  added,
                  updated,
                  ignored: budgetTransactions.length - added,
                  transactions: txDetails
               });
            }
         } catch (err) {
            console.error('Fehler beim Verarbeiten von Konto', maskIban(accountMapping.iban), err.message);
         }
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
